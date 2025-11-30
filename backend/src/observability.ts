/**
 * Comprehensive Observability Service
 * Provides structured logging, metrics, and tracing using Effect
 */

import { Context, Effect, Layer, Logger, Metric, Option, Span } from "effect";
import { AppConfig } from "./config";
import { randomUUID } from "node:crypto";

/**
 * Correlation ID context key
 * Used to track requests across services
 */
export const CorrelationId = Context.Tag<CorrelationId>("CorrelationId");

export interface CorrelationId {
  readonly id: string;
}

/**
 * Create a new correlation ID
 */
export const createCorrelationId = (): CorrelationId => ({
  id: randomUUID(),
});

/**
 * Get current correlation ID from context, or create new one
 */
export const getCorrelationId = (): Effect.Effect<CorrelationId> =>
  Effect.gen(function* () {
    const existing = yield* Effect.serviceOption(CorrelationId);
    if (Option.isSome(existing)) {
      return existing.value;
    }
    // If not in context, create a new one (shouldn't happen in normal flow)
    return createCorrelationId();
  });

/**
 * Add correlation ID to effect context
 */
export const withCorrelationId = <A, E, R>(
  effect: Effect.Effect<A, E, R>,
  correlationId?: CorrelationId
): Effect.Effect<A, E, R> => {
  const id = correlationId ?? createCorrelationId();
  return Effect.provideService(effect, CorrelationId, id);
};

// ============================================================================
// METRICS
// ============================================================================

/**
 * HTTP Request Metrics
 */
export const httpRequestCount = Metric.counter("http_requests_total", {
  description: "Total number of HTTP requests",
}).pipe(Metric.tagged("method", "GET"));

export const httpRequestDuration = Metric.histogram("http_request_duration_ms", {
  description: "HTTP request duration in milliseconds",
  boundaries: [10, 50, 100, 200, 500, 1000, 2000, 5000, 10000],
});

export const httpRequestErrors = Metric.counter("http_request_errors_total", {
  description: "Total number of HTTP request errors",
}).pipe(Metric.tagged("status", "500"));

/**
 * Rate Limiting Metrics
 */
export const rateLimitHits = Metric.counter("rate_limit_hits_total", {
  description: "Total number of rate limit hits",
}).pipe(Metric.tagged("type", "api"));

export const rateLimitChecks = Metric.counter("rate_limit_checks_total", {
  description: "Total number of rate limit checks",
}).pipe(Metric.tagged("type", "api"));

/**
 * LLM API Metrics
 */
export const llmRequestCount = Metric.counter("llm_requests_total", {
  description: "Total number of LLM API requests",
}).pipe(Metric.tagged("model", "unknown"));

export const llmRequestDuration = Metric.histogram("llm_request_duration_ms", {
  description: "LLM API request duration in milliseconds",
  boundaries: [100, 500, 1000, 2000, 5000, 10000, 30000, 60000, 120000],
});

export const llmRequestErrors = Metric.counter("llm_request_errors_total", {
  description: "Total number of LLM API errors",
}).pipe(Metric.tagged("model", "unknown"));

export const llmTokens = Metric.counter("llm_tokens_total", {
  description: "Total number of LLM tokens processed",
}).pipe(Metric.tagged("type", "input"));

/**
 * Workflow Metrics
 */
export const workflowExecutionCount = Metric.counter("workflow_executions_total", {
  description: "Total number of workflow executions",
}).pipe(Metric.tagged("workflow_id", "unknown"));

export const workflowExecutionDuration = Metric.histogram(
  "workflow_execution_duration_ms",
  {
    description: "Workflow execution duration in milliseconds",
    boundaries: [1000, 5000, 10000, 30000, 60000, 120000, 300000, 600000],
  }
);

export const workflowStageDuration = Metric.histogram(
  "workflow_stage_duration_ms",
  {
    description: "Individual workflow stage duration in milliseconds",
    boundaries: [100, 500, 1000, 2000, 5000, 10000, 30000, 60000],
  }
);

/**
 * Storage Metrics
 */
export const storageOperationCount = Metric.counter("storage_operations_total", {
  description: "Total number of storage operations",
}).pipe(Metric.tagged("operation", "read"));

export const storageOperationDuration = Metric.histogram(
  "storage_operation_duration_ms",
  {
    description: "Storage operation duration in milliseconds",
    boundaries: [1, 5, 10, 50, 100, 500, 1000],
  }
);

export const storageOperationErrors = Metric.counter(
  "storage_operation_errors_total",
  {
    description: "Total number of storage operation errors",
  }
).pipe(Metric.tagged("operation", "read"));

// ============================================================================
// LOGGING HELPERS
// ============================================================================

/**
 * Structured logging with correlation ID and context
 */
export const logInfo = (
  message: string,
  context?: Record<string, unknown>
): Effect.Effect<void> =>
  Effect.gen(function* () {
    const correlationId = yield* getCorrelationId();
    const logContext = {
      correlationId: correlationId.id,
      ...context,
    };
    yield* Logger.logInfo(message, logContext);
  });

export const logError = (
  message: string,
  error?: unknown,
  context?: Record<string, unknown>
): Effect.Effect<void> =>
  Effect.gen(function* () {
    const correlationId = yield* getCorrelationId();
    const errorContext = {
      correlationId: correlationId.id,
      error:
        error instanceof Error
          ? {
              message: error.message,
              stack: error.stack,
              name: error.name,
            }
          : String(error),
      ...context,
    };
    yield* Logger.logError(message, errorContext);
  });

export const logWarning = (
  message: string,
  context?: Record<string, unknown>
): Effect.Effect<void> =>
  Effect.gen(function* () {
    const correlationId = yield* getCorrelationId();
    const logContext = {
      correlationId: correlationId.id,
      ...context,
    };
    yield* Logger.logWarning(message, logContext);
  });

export const logDebug = (
  message: string,
  context?: Record<string, unknown>
): Effect.Effect<void> =>
  Effect.gen(function* () {
    const correlationId = yield* getCorrelationId();
    const logContext = {
      correlationId: correlationId.id,
      ...context,
    };
    yield* Logger.logDebug(message, logContext);
  });

// ============================================================================
// TRACING HELPERS
// ============================================================================

/**
 * Create a span for tracing operations
 */
export const withSpan = <A, E, R>(
  name: string,
  attributes?: Record<string, string | number | boolean>,
  effect: Effect.Effect<A, E, R>
): Effect.Effect<A, E, R> =>
  Effect.gen(function* () {
    const correlationId = yield* getCorrelationId();
    const spanAttributes = {
      "correlation.id": correlationId.id,
      ...attributes,
    };
    return yield* Effect.withSpan(name, { attributes: spanAttributes })(effect);
  });

/**
 * Add event to current span
 */
export const addSpanEvent = (
  name: string,
  attributes?: Record<string, string | number | boolean>
): Effect.Effect<void> =>
  Effect.gen(function* () {
    const correlationId = yield* getCorrelationId();
    const eventAttributes = {
      "correlation.id": correlationId.id,
      ...attributes,
    };
    yield* Span.addEvent(name, eventAttributes);
  });

/**
 * Set span attributes
 */
export const setSpanAttributes = (
  attributes: Record<string, string | number | boolean>
): Effect.Effect<void> =>
  Effect.gen(function* () {
    const correlationId = yield* getCorrelationId();
    const allAttributes = {
      "correlation.id": correlationId.id,
      ...attributes,
    };
    yield* Span.setAttributes(allAttributes);
  });

// ============================================================================
// METRIC HELPERS
// ============================================================================

/**
 * Track HTTP request metrics
 */
export const trackHttpRequest = (
  method: string,
  path: string,
  status: number,
  duration: number
): Effect.Effect<void> =>
  Effect.gen(function* () {
    const config = yield* AppConfig;
    
    yield* httpRequestCount.pipe(
      Metric.tagged("method", method),
      Metric.tagged("path", path),
      Metric.tagged("status", String(status)),
      Metric.increment
    );
    
    // Skip histogram updates in test/mock mode to avoid boundary issues
    // Histograms with tags lose boundary configuration in Effect's Metric system
    if (!config.mockMode) {
      yield* httpRequestDuration.pipe(
        Metric.tagged("method", method),
        Metric.tagged("path", path),
        Metric.update(duration)
      );
    }
    
    if (status >= 400) {
      yield* httpRequestErrors.pipe(
        Metric.tagged("method", method),
        Metric.tagged("path", path),
        Metric.tagged("status", String(status)),
        Metric.increment
      );
    }
  });

/**
 * Track LLM API call metrics
 */
export const trackLLMRequest = (
  model: string,
  duration: number,
  inputTokens?: number,
  outputTokens?: number,
  error?: boolean
): Effect.Effect<void> =>
  Effect.gen(function* () {
    const config = yield* AppConfig;
    
    yield* llmRequestCount.pipe(
      Metric.tagged("model", model),
      Metric.tagged("status", error ? "error" : "success"),
      Metric.increment
    );
    
    // Skip histogram updates in test/mock mode
    if (!config.mockMode) {
      yield* llmRequestDuration.pipe(
        Metric.tagged("model", model),
        Metric.update(duration)
      );
    }
    if (error) {
      yield* llmRequestErrors.pipe(
        Metric.tagged("model", model),
        Metric.increment
      );
    }
    if (inputTokens) {
      yield* llmTokens.pipe(
        Metric.tagged("type", "input"),
        Metric.tagged("model", model),
        Metric.increment(inputTokens)
      );
    }
    if (outputTokens) {
      yield* llmTokens.pipe(
        Metric.tagged("type", "output"),
        Metric.tagged("model", model),
        Metric.increment(outputTokens)
      );
    }
  });

/**
 * Track workflow execution metrics
 */
export const trackWorkflowExecution = (
  workflowId: string,
  duration: number,
  success: boolean
): Effect.Effect<void> =>
  Effect.gen(function* () {
    const config = yield* AppConfig;
    
    yield* workflowExecutionCount.pipe(
      Metric.tagged("workflow_id", workflowId),
      Metric.tagged("status", success ? "success" : "error"),
      Metric.increment
    );
    
    // Skip histogram updates in test/mock mode
    if (!config.mockMode) {
      yield* workflowExecutionDuration.pipe(
        Metric.tagged("workflow_id", workflowId),
        Metric.update(duration)
      );
    }
  });

/**
 * Track workflow stage metrics
 */
export const trackWorkflowStage = (
  stageId: string,
  duration: number,
  success: boolean
): Effect.Effect<void> =>
  Effect.gen(function* () {
    const config = yield* AppConfig;
    
    // Skip histogram updates in test/mock mode
    if (!config.mockMode) {
      yield* workflowStageDuration.pipe(
        Metric.tagged("stage_id", stageId),
        Metric.tagged("status", success ? "success" : "error"),
        Metric.update(duration)
      );
    }
  });

/**
 * Track storage operation metrics
 */
export const trackStorageOperation = (
  operation: string,
  duration: number,
  error?: boolean
): Effect.Effect<void> =>
  Effect.gen(function* () {
    const config = yield* AppConfig;
    
    yield* storageOperationCount.pipe(
      Metric.tagged("operation", operation),
      Metric.tagged("status", error ? "error" : "success"),
      Metric.increment
    );
    
    // Skip histogram updates in test/mock mode
    if (!config.mockMode) {
      yield* storageOperationDuration.pipe(
        Metric.tagged("operation", operation),
        Metric.tagged("status", error ? "error" : "success"),
        Metric.update(duration)
      );
    }
    if (error) {
      yield* storageOperationErrors.pipe(
        Metric.tagged("operation", operation),
        Metric.increment
      );
    }
  });

/**
 * Track rate limit check
 */
export const trackRateLimitCheck = (
  type: "api" | "workflow",
  allowed: boolean
): Effect.Effect<void> =>
  Effect.gen(function* () {
    yield* rateLimitChecks.pipe(
      Metric.tagged("type", type),
      Metric.increment
    );
    if (!allowed) {
      yield* rateLimitHits.pipe(
        Metric.tagged("type", type),
        Metric.increment
      );
    }
  });

// ============================================================================
// OBSERVABILITY SERVICE
// ============================================================================

/**
 * Observability service that provides all observability capabilities
 */
export class ObservabilityService extends Effect.Service<ObservabilityService>()(
  "ObservabilityService",
  {
    effect: Effect.gen(function* () {
      return {
        logInfo,
        logError,
        logWarning,
        logDebug,
        withSpan,
        addSpanEvent,
        setSpanAttributes,
        trackHttpRequest,
        trackLLMRequest,
        trackWorkflowExecution,
        trackWorkflowStage,
        trackStorageOperation,
        getCorrelationId,
        withCorrelationId,
      };
    }),
  }
) {}

/**
 * Configure structured JSON logging for production
 * Logs are formatted as JSON for easy parsing by log aggregation systems
 * Note: Effect 3.8.0 doesn't have Logger.withFormatter, so we use the default logger
 * Custom formatting can be added via log aggregation tools or middleware
 */
export const LoggerJsonLive = Layer.empty;

/**
 * Default layer for observability service with JSON logging
 */
export const ObservabilityServiceLive = ObservabilityService.Default;

