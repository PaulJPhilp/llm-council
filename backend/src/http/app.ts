/**
 * Effect Platform HTTP Application
 * Main HTTP router and handlers using Effect Platform
 */

import * as Http from "@effect/platform/HttpServer";
import { Effect, Either, Option, Runtime, Schema } from "effect";
import { randomUUID } from "node:crypto";
import { AuthorizationError, AuthService, authorizeResource, extractUserFromRequest } from "../auth";
import { AppConfig } from "../config";
import {
  AuthenticationError,
  ConversationNotFoundError,
  OpenRouterError,
  RateLimitError,
  StorageError,
  TimeoutError,
  ValidationError
} from "../errors";
import {
  CorrelationId,
  createCorrelationId,
  logError,
  logInfo,
  trackHttpRequest,
  trackRateLimitCheck,
  withSpan
} from "../observability";
import { RateLimitService } from "../rate-limit";
import {
  StorageService,
  type Conversation,
  type ConversationMetadata,
  type Stage1Response,
  type Stage2Response,
  type Stage3Response,
} from "../storage";
import { WorkflowRegistry } from "../workflow/registry";
import { executeCouncilWorkflow } from "../workflow/workflows/council-integration";
import { ProductionRuntime } from "../runtime";

// Initialize Workflow Registry with default models
const workflowRegistry = new WorkflowRegistry();

/**
 * Validation schemas for route parameters
 */
const ConversationIdSchema = Schema.String.pipe(
  Schema.minLength(1, { message: () => "Conversation ID cannot be empty" }),
  Schema.maxLength(255, { message: () => "Conversation ID too long" })
);

const WorkflowIdSchema = Schema.String.pipe(
  Schema.minLength(1, { message: () => "Workflow ID cannot be empty" }),
  Schema.maxLength(255, { message: () => "Workflow ID too long" })
);

/**
 * Request body schema for workflow execution
 */
const ExecuteWorkflowBodySchema = Schema.Struct({
  content: Schema.String.pipe(
    Schema.minLength(1, { message: () => "Message content cannot be empty" }),
    Schema.maxLength(100000, { message: () => "Message content too long" })
  ),
  workflowId: Schema.String.pipe(
    Schema.minLength(1, { message: () => "Workflow ID cannot be empty" }),
    Schema.maxLength(255, { message: () => "Workflow ID too long" })
  ),
});

/**
 * Helper to extract and validate route parameters from URL pathname
 * Extracts parameters based on route pattern (e.g., /api/conversations/:conversationId)
 * 
 * @param url - The request URL
 * @param paramName - The parameter name (e.g., "conversationId", "workflowId")
 * @param schema - Schema to validate the parameter value
 */
const extractRouteParam = <A>(
  url: URL,
  paramName: string,
  schema: Schema.Schema<A>
): Effect.Effect<A, unknown> =>
  Effect.gen(function* () {
    // Extract parameter from URL pathname
    // Handles patterns like:
    // - /api/conversations/{id}
    // - /api/workflows/{id}
    // - /api/conversations/{id}/execute/stream
    const pathSegments = url.pathname.split("/");
    let paramValue: string | undefined;

    // Find the segment after the resource name (conversations, workflows)
    if (pathSegments.includes("conversations")) {
      const index = pathSegments.indexOf("conversations");
      paramValue = pathSegments[index + 1];
    } else if (pathSegments.includes("workflows")) {
      const index = pathSegments.indexOf("workflows");
      paramValue = pathSegments[index + 1];
    }

    if (!paramValue) {
      // Return validation error that will be caught by mapErrorToHttp
      return yield* Effect.fail(
        new ValidationError({
          message: `${paramName} is required`,
          field: paramName,
        })
      );
    }

    // Schema.decodeUnknown will return a parse error if validation fails
    // This will be caught by mapErrorToHttp which checks for _tag === "ParseError"
    return yield* Schema.decodeUnknown(schema)(paramValue);
  });

/**
 * Map Effect errors to HTTP responses
 * Provides comprehensive error-to-HTTP status code mapping
 */
const mapErrorToHttp = (error: unknown): Http.response.HttpResponse => {
  // 400 Bad Request - Client errors (validation, malformed requests)
  if (error instanceof ValidationError) {
    return Http.response.json(
      {
        error: "Validation error",
        message: error.message,
        field: error.field,
      },
      { status: 400 }
    );
  }

  // Check for Schema.ParseError (from Effect Schema validation)
  // Schema.ParseError has _tag: "ParseError" and an errors array
  if (
    error &&
    typeof error === "object" &&
    "_tag" in error &&
    error._tag === "ParseError"
  ) {
    const parseError = error as {
      errors?: Array<{
        message?: string;
        path?: ReadonlyArray<string | number>;
        _tag?: string;
      }>;
    };
    const errorMessages =
      parseError.errors
        ?.map((e) => {
          const path = e.path ? ` at ${e.path.join(".")}` : "";
          return `${e.message || "Validation failed"}${path}`;
        })
        .join("; ") || "Invalid request data";
    return Http.response.json(
      {
        error: "Invalid request",
        message: errorMessages,
        details: parseError.errors,
      },
      { status: 400 }
    );
  }

  // 401 Unauthorized - Authentication required
  if (error instanceof AuthenticationError) {
    return Http.response.json(
      {
        error: "Unauthorized",
        message: error.message,
        code: error.code,
      },
      { status: 401 }
    );
  }

  // 403 Forbidden - Authorization failed
  if (error instanceof AuthorizationError) {
    return Http.response.json(
      {
        error: "Forbidden",
        message: error.message,
        resource: error.resource,
        resourceId: error.resourceId,
      },
      { status: 403 }
    );
  }

  // 404 Not Found - Resource doesn't exist
  if (error instanceof ConversationNotFoundError) {
    return Http.response.json(
      {
        error: "Conversation not found",
        conversationId: error.conversationId,
      },
      { status: 404 }
    );
  }

  if (error instanceof StorageError && error.operation === "getConversation") {
    return Http.response.json(
      { error: "Conversation not found" },
      { status: 404 }
    );
  }

  // 429 Too Many Requests - Rate limiting
  if (error instanceof RateLimitError) {
    return Http.response.json(
      {
        error: "Rate limit exceeded",
        message: error.message,
        retryAfter: error.retryAfter,
      },
      {
        status: 429,
        headers: {
          "Retry-After": String(error.retryAfter || 60),
          "X-RateLimit-Limit": String(error.limit),
          "X-RateLimit-Window": String(error.windowMs),
        },
      }
    );
  }

  // 502 Bad Gateway - Upstream service errors
  if (error instanceof OpenRouterError) {
    // Check if it's a timeout or connection error
    const isTimeout = error.message.toLowerCase().includes("timeout") ||
                      error.message.toLowerCase().includes("aborted");
    const isServiceUnavailable = error.message.toLowerCase().includes("503") ||
                                 error.message.toLowerCase().includes("service unavailable");

    if (isTimeout) {
      return Http.response.json(
        {
          error: "Gateway timeout",
          message: "The upstream service timed out",
          details: error.message,
        },
        { status: 504 }
      );
    }

    if (isServiceUnavailable) {
      return Http.response.json(
        {
          error: "Service unavailable",
          message: "The upstream service is temporarily unavailable",
          details: error.message,
        },
        { status: 503 }
      );
    }

    return Http.response.json(
      {
        error: "Bad gateway",
        message: "Error communicating with upstream service",
        details: error.message,
      },
      { status: 502 }
    );
  }

  // 504 Gateway Timeout - Operation timeout
  if (error instanceof TimeoutError) {
    return Http.response.json(
      {
        error: "Gateway timeout",
        message: error.message,
        operation: error.operation,
        timeoutMs: error.timeoutMs,
      },
      { status: 504 }
    );
  }

  // 500 Internal Server Error - Default for unexpected errors
  // Log error with observability (fire and forget - don't block response)
  // Note: This is in a non-Effect context (mapErrorToHttp), so we use Effect.runPromise
  // In a real Effect context, we would yield* logError directly
  Effect.runPromise(
    logError("Unhandled error in request handler", error).pipe(
      Effect.catchAll(() => Effect.sync(() => {
        // Fallback if logging fails
        console.error("Unhandled error:", error);
      }))
    )
  );

  // Check if it's a StorageError for other operations
  if (error instanceof StorageError) {
    return Http.response.json(
      {
        error: "Storage error",
        message: error.message,
        operation: error.operation,
      },
      { status: 500 }
    );
  }

  return Http.response.json(
    { error: "Internal server error" },
    { status: 500 }
  );
};

/**
 * Health check endpoint
 */
const healthCheck = Http.router.get(
  "/",
  Effect.succeed(
    Http.response.json({
      status: "ok",
      service: "LLM Council API",
    })
  )
);

/**
 * List all conversations
 */
const listConversationsRoute = Http.router.get(
  "/api/conversations",
  Effect.gen(function* () {
    const request = yield* Http.request.HttpRequest;
    const user = yield* extractUserFromRequest(request);
    const storage = yield* StorageService;
    const conversations = yield* storage.listConversations(user.userId);
    return Http.response.json(conversations);
  }).pipe(Effect.catchAll((error) => Effect.succeed(mapErrorToHttp(error))))
);

/**
 * Create a new conversation
 */
const createConversationRoute = Http.router.post(
  "/api/conversations",
  Effect.gen(function* () {
    const request = yield* Http.request.HttpRequest;
    const user = yield* extractUserFromRequest(request);
    const storage = yield* StorageService;
    const conversationId = randomUUID();
    const conversation = yield* storage.createConversation(conversationId, user.userId);
    return Http.response.json(conversation);
  }).pipe(Effect.catchAll((error) => Effect.succeed(mapErrorToHttp(error))))
);

/**
 * Get a specific conversation
 */
const getConversationRoute = Http.router.get(
  "/api/conversations/:conversationId",
  Effect.gen(function* () {
    const request = yield* Http.request.HttpRequest;
    const user = yield* extractUserFromRequest(request);
    
    // Extract and validate route parameters
    const url = yield* Http.request.url(request);
    const conversationId = yield* extractRouteParam(
      url,
      "conversationId",
      ConversationIdSchema
    );

    const storage = yield* StorageService;
    const conversation = yield* storage.getConversation(conversationId);

    if (!conversation) {
      return Http.response.json(
        { error: "Conversation not found" },
        { status: 404 }
      );
    }

    // Check authorization
    const auth = yield* AuthService;
    yield* auth.authorizeResource(
      user.userId,
      "conversation",
      conversationId,
      conversation.user_id
    );

    return Http.response.json(conversation);
  }).pipe(Effect.catchAll((error) => Effect.succeed(mapErrorToHttp(error))))
);

/**
 * List available workflows
 */
const listWorkflowsRoute = Http.router.get(
  "/api/workflows",
  Effect.gen(function* () {
    const workflows = workflowRegistry.list();
    return Http.response.json(workflows);
  })
);

/**
 * Get a specific workflow with DAG
 */
const getWorkflowRoute = Http.router.get(
  "/api/workflows/:workflowId",
  Effect.gen(function* () {
    const request = yield* Http.request.HttpRequest;
    const url = yield* Http.request.url(request);
    
    // Extract and validate route parameters
    const workflowId = yield* extractRouteParam(
      url,
      "workflowId",
      WorkflowIdSchema
    );

    const workflow = workflowRegistry.get(workflowId);

    if (!workflow) {
      return Http.response.json(
        { error: "Workflow not found" },
        { status: 404 }
      );
    }

    const dag = workflowRegistry.toDAG(workflow);

    return Http.response.json({
      id: workflow.id,
      name: workflow.name,
      version: workflow.version,
      description: workflow.description,
      dag,
    });
  })
);

/**
 * Execute workflow via streaming SSE
 */
const executeWorkflowRoute = Http.router.post(
  "/api/conversations/:conversationId/execute/stream",
  Effect.gen(function* () {
    const request = yield* Http.request.HttpRequest;
    const user = yield* extractUserFromRequest(request);
    
    // Extract and validate route parameters
    const url = yield* Http.request.url(request);
    const conversationId = yield* extractRouteParam(
      url,
      "conversationId",
      ConversationIdSchema
    );

    // Parse and validate request body
    const body = yield* Http.request.schemaBodyJson(
      ExecuteWorkflowBodySchema
    )(request);
    
    // Validate workflowId from body matches schema (already validated by schemaBodyJson)
    // Verify workflow exists

    // Verify workflow exists
    const workflow = workflowRegistry.get(body.workflowId);
    if (!workflow) {
      return Http.response.json(
        { error: "Workflow not found" },
        { status: 404 }
      );
    }

    // Check if conversation exists
    const storage = yield* StorageService;
    const conversation = yield* storage.getConversation(conversationId);

    if (!conversation) {
      return Http.response.json(
        { error: "Conversation not found" },
        { status: 404 }
      );
    }

    // Check authorization
    const auth = yield* AuthService;
    yield* auth.authorizeResource(
      user.userId,
      "conversation",
      conversationId,
      conversation.user_id
    );

    const isFirstMessage = conversation.messages.length === 0;

    // Create SSE stream
    // Note: ReadableStream callbacks are native async functions, so we use Effect.runPromise
    // to execute Effect programs within them, but the callback itself remains async
    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        const enqueue = (data: string) => {
          controller.enqueue(encoder.encode(data));
        };

        // Execute workflow operations using Effect with ProductionRuntime
        // This ensures services are available and observability context is maintained
        await Runtime.runPromise(ProductionRuntime)(
          Effect.gen(function* () {
            // Add user message
            const storage = yield* StorageService;
            yield* storage.addUserMessage(conversationId, body.content);

            // Track progress events
            const progressEvents: unknown[] = [];
            const stageResults: Record<string, unknown> = {};

            // Execute workflow with progress callback
            yield* Effect.tryPromise({
              try: () =>
                executeCouncilWorkflow(body.content, (event) => {
                  progressEvents.push(event);
                  enqueue(`data: ${JSON.stringify(event)}\n\n`);

                  if (event.type === "stage_complete" && "stageId" in event) {
                    stageResults[event.stageId as string] = event.data;
                  }
                }),
              catch: (error) => error,
            });

            // Save assistant message
            yield* storage.addAssistantMessage(
              conversationId,
              (stageResults["parallel-query"] || []) as Stage1Response[],
              (stageResults["peer-ranking"] || []) as Stage2Response[],
              (stageResults.synthesis as Stage3Response | undefined) ||
                ({} as Stage3Response)
            );

            enqueue(`data: ${JSON.stringify({ type: "workflow_complete" })}\n\n`);
            controller.close();
          }).pipe(
            Effect.catchAll((error) =>
              Effect.gen(function* () {
                const errorMessage =
                  error instanceof Error ? error.message : String(error);
                
                // Log error with observability
                yield* logError("Error in workflow stream", error, {
                  conversationId,
                  workflowId: body.workflowId,
                }).pipe(
                  Effect.catchAll(() => Effect.sync(() => {
                    // Fallback if logging fails
                    console.error("Error in workflow stream:", errorMessage);
                  }))
                );
                
                // Try to send error event
                yield* Effect.try({
                  try: () => {
                    enqueue(
                      `data: ${JSON.stringify({
                        type: "error",
                        message: errorMessage,
                      })}\n\n`
                    );
                  },
                  catch: (e) => e,
                }).pipe(
                  Effect.catchAll((e) =>
                    logError("Failed to send error event", e).pipe(
                      Effect.catchAll(() => Effect.sync(() => {
                        console.error("Failed to send error event:", e);
                      }))
                    )
                  )
                );
                
                controller.close();
              })
            )
          )
        );
      },
    });

    return Http.response.stream(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  }).pipe(Effect.catchAll((error) => Effect.succeed(mapErrorToHttp(error))))
);

/**
 * Request timeout middleware - enforces maximum request duration
 */
const requestTimeoutMiddleware = Http.middleware.make((app) =>
  Effect.gen(function* () {
    const config = yield* AppConfig;
    const request = yield* Http.request.HttpRequest;
    const method = yield* Http.request.method(request);
    const url = yield* Http.request.url(request);
    const path = url.pathname;

    // Apply timeout to the request handler
    const timeoutEffect = app.pipe(
      Effect.timeout({
        duration: config.httpRequestTimeoutMs,
        onTimeout: () =>
          Effect.fail(
            new TimeoutError({
              operation: `HTTP ${method} ${path}`,
              timeoutMs: config.httpRequestTimeoutMs,
            })
          ),
      })
    );

    return yield* timeoutEffect;
  })
);

/**
 * Request body size limit middleware - prevents DoS via large payloads
 */
const requestSizeLimitMiddleware = Http.middleware.make((app) =>
  Effect.gen(function* () {
    const config = yield* AppConfig;
    const request = yield* Http.request.HttpRequest;
    const method = yield* Http.request.method(request);

    // Only check body size for methods that can have bodies
    if (method === "POST" || method === "PUT" || method === "PATCH") {
      const contentLengthHeader = yield* Http.request.header(
        request,
        "Content-Length"
      );

      if (Option.isSome(contentLengthHeader)) {
        const contentLength = Number.parseInt(contentLengthHeader.value, 10);

        if (
          !Number.isNaN(contentLength) &&
          contentLength > config.httpMaxRequestSizeBytes
        ) {
          yield* logError("Request body too large", undefined, {
            contentLength,
            maxSize: config.httpMaxRequestSizeBytes,
            method,
          });

          return Http.response.json(
            {
              error: "Request entity too large",
              message: `Request body exceeds maximum size of ${config.httpMaxRequestSizeBytes} bytes`,
              maxSize: config.httpMaxRequestSizeBytes,
            },
            { status: 413 }
          );
        }
      }
    }

    return yield* app;
  })
);

/**
 * Correlation ID middleware - adds correlation ID to request context
 */
const correlationIdMiddleware = Http.middleware.make((app) =>
  Effect.gen(function* () {
    const request = yield* Http.request.HttpRequest;
    
    // Extract correlation ID from header if present, otherwise create new one
    const headerId = yield* Http.request.header(request, "X-Correlation-ID");
    const correlationId = Option.isSome(headerId)
      ? { id: headerId.value }
      : createCorrelationId();
    
    // Provide correlation ID to the effect context
    return yield* Effect.provideService(app, CorrelationId, correlationId);
  })
);

/**
 * Request logging and metrics middleware
 */
const observabilityMiddleware = Http.middleware.make((app) => {
  const start = Date.now();
  return Effect.gen(function* () {
    const request = yield* Http.request.HttpRequest;
    const method = yield* Http.request.method(request);
    const url = yield* Http.request.url(request);
    const path = url.pathname;

    yield* logInfo("HTTP request started", {
      method,
      path,
    });

    const response = yield* withSpan(
      `http.${method.toLowerCase()}`,
      {
        "http.method": method,
        "http.path": path,
        "http.url": url.toString(),
      },
      app
    );

    const duration = Date.now() - start;
    const status = yield* Http.response.status(response);

    yield* trackHttpRequest(method, path, status, duration);
    
    yield* logInfo("HTTP request completed", {
      method,
      path,
      status,
      duration,
    });

    return response;
  }).pipe(
    Effect.catchAll((error) =>
      Effect.gen(function* () {
        const request = yield* Http.request.HttpRequest;
        const duration = Date.now() - start;
        const method = yield* Http.request.method(request);
        const url = yield* Http.request.url(request);
        const path = url.pathname;

        yield* logError("HTTP request failed", error, {
          method,
          path,
          duration,
        });

        yield* trackHttpRequest(method, path, 500, duration);

        // Re-throw to let error handling continue
        return yield* Effect.fail(error);
      })
    )
  );
});

/**
 * Get identifier for rate limiting (user ID or IP address)
 */
const getRateLimitIdentifier = (
  request: Http.request.HttpRequest,
  userId?: string
): Effect.Effect<string> =>
  Effect.gen(function* () {
    if (userId) {
      return userId; // Use authenticated user ID
    }

    // Fallback to IP address
    const forwardedFor = yield* Http.request.header(request, "X-Forwarded-For");
    if (Option.isSome(forwardedFor)) {
      // X-Forwarded-For can contain multiple IPs, take the first one
      return forwardedFor.value.split(",")[0].trim();
    }

    // Try X-Real-IP
    const realIp = yield* Http.request.header(request, "X-Real-IP");
    if (Option.isSome(realIp)) {
      return realIp.value;
    }

    // Last resort: use a default identifier
    // In production, you'd want to extract IP from the connection
    return "unknown";
  });

/**
 * Rate limiting middleware for general API requests
 */
const rateLimitMiddleware = Http.middleware.make((app) =>
  Effect.gen(function* () {
    const request = yield* Http.request.HttpRequest;
    const method = yield* Http.request.method(request);
    const url = yield* Http.request.url(request);

    // Skip rate limiting for health check
    if (url.pathname === "/") {
      return yield* app;
    }

    // Try to get user ID from request (if authenticated)
    let userId: string | undefined;
    const userResult = yield* Effect.either(extractUserFromRequest(request));
    if (Either.isRight(userResult)) {
      userId = userResult.right.userId;
    }

    const identifier = yield* getRateLimitIdentifier(request, userId);
    const rateLimit = yield* RateLimitService;

    // Check rate limit
    const checkResult = yield* Effect.either(
      rateLimit.checkApiRateLimit(identifier)
    );

    yield* trackRateLimitCheck("api", Either.isRight(checkResult));

    if (Either.isLeft(checkResult)) {
      const error = checkResult.left;
      yield* logError("Rate limit exceeded", error, {
        identifier,
        path: url.pathname,
        method,
      });
      return yield* Effect.fail(error);
    }

    return yield* app;
  })
);

/**
 * Rate limiting middleware for workflow executions (more restrictive)
 */
const workflowRateLimitMiddleware = Http.middleware.make((app) =>
  Effect.gen(function* () {
    const request = yield* Http.request.HttpRequest;
    const method = yield* Http.request.method(request);
    const url = yield* Http.request.url(request);

    // Try to get user ID from request (if authenticated)
    let userId: string | undefined;
    const userResult = yield* Effect.either(extractUserFromRequest(request));
    if (Either.isRight(userResult)) {
      userId = userResult.right.userId;
    }

    const identifier = yield* getRateLimitIdentifier(request, userId);
    const rateLimit = yield* RateLimitService;

    // Check workflow rate limit
    const checkResult = yield* Effect.either(
      rateLimit.checkWorkflowRateLimit(identifier)
    );

    yield* trackRateLimitCheck("workflow", Either.isRight(checkResult));

    if (Either.isLeft(checkResult)) {
      const error = checkResult.left;
      yield* logError("Workflow rate limit exceeded", error, {
        identifier,
        path: url.pathname,
        method,
      });
      return yield* Effect.fail(error);
    }

    return yield* app;
  })
);

/**
 * CORS middleware
 */
const corsMiddleware = Http.middleware.make((app) =>
  Effect.gen(function* () {
    const request = yield* Http.request.HttpRequest;
    const method = yield* Http.request.method(request);

    // Handle preflight OPTIONS requests
    if (method === "OPTIONS") {
      return Http.response.empty({ status: 204 }).pipe(
        Http.response.withHeaders({
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type, Authorization",
          "Access-Control-Max-Age": "86400",
        })
      );
    }

    const response = yield* app;

    // Add CORS headers to all responses
    return response.pipe(
      Http.response.withHeaders({
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
      })
    );
  })
);

/**
 * Apply workflow-specific rate limiting to execute workflow route
 */
const executeWorkflowRouteWithRateLimit = workflowRateLimitMiddleware(
  executeWorkflowRoute
);

/**
 * Apply general rate limiting to API routes (excluding health check)
 */
const apiRoutesWithRateLimit = rateLimitMiddleware(
  Http.router.empty.pipe(
    Http.router.concat(listConversationsRoute),
    Http.router.concat(createConversationRoute),
    Http.router.concat(getConversationRoute),
    Http.router.concat(listWorkflowsRoute),
    Http.router.concat(getWorkflowRoute)
  )
);

/**
 * Combine all routes with middleware
 * Order matters:
 * 1. Request size limit (early rejection of oversized requests)
 * 2. Correlation ID (needed for all subsequent logging/tracing)
 * 3. Rate limiting (protect against abuse)
 * 4. Request timeout (prevent hanging requests)
 * 5. Observability (logging, metrics, tracing)
 * 6. CORS (response headers)
 */
export const app = Http.router.empty.pipe(
  Http.router.concat(healthCheck),
  Http.router.concat(apiRoutesWithRateLimit),
  Http.router.concat(executeWorkflowRouteWithRateLimit),
  Http.middleware.use(requestSizeLimitMiddleware),
  Http.middleware.use(correlationIdMiddleware),
  Http.middleware.use(requestTimeoutMiddleware),
  Http.middleware.use(observabilityMiddleware),
  Http.middleware.use(corsMiddleware)
);
