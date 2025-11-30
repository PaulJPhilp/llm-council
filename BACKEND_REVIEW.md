# Backend Architecture Review: Ensemble (Workflow-Based AI System)

**Review Date**: 2025-01-27  
**Reviewer**: Senior Backend Architect  
**Stack**: Hono (HTTP) + Effect-TS (Business Logic) + Bun (Runtime)

---

## 0. Context Summary

**System Overview**:  
Ensemble is a **generalized workflow-based AI system** where users can execute configurable multi-stage workflows with LLMs. The backend provides a workflow execution engine that supports arbitrary DAG-based workflows (stages with dependencies). The system includes pre-built workflows like the "LLM Council" (3-stage deliberation with anonymized peer review) and "Linear Default" (simple sequential chain), but users can configure custom workflows. The backend serves as an API for a React frontend that visualizes workflows as DAGs.

**Key Backend Flows**:
1. **List workflows** (`GET /api/workflows`) - List available workflow definitions with metadata
2. **Get workflow** (`GET /api/workflows/:id`) - Get workflow definition with DAG visualization
3. **Execute workflow** (`POST /api/conversations/:id/execute/stream`) - Execute workflow with SSE streaming
4. **Create conversation** (`POST /api/conversations`) - Initialize new conversation
5. **List conversations** (`GET /api/conversations`) - Metadata-only listing (filtered by user)
6. **Get conversation** (`GET /api/conversations/:id`) - Full conversation history

**Non-Negotiables**:
- ✅ **Correctness & Error Handling**: Typed errors via Effect, graceful degradation
- ⚠️ **Performance**: Parallel queries, but no rate limiting or resource bounds
- ❌ **Observability**: Basic console.log only, no structured logging/metrics/tracing
- ✅ **Security**: Authentication/authorization implemented (Bearer token/API key), user-scoped conversations
- ✅ **DX/Testability**: Effect services enable testability, but test patterns need refinement

**Infrastructure**:
- **Data Store**: File-based JSON storage (`data/conversations/*.json`)
- **Runtime**: Bun server (Node.js-compatible)
- **External APIs**: OpenRouter API for LLM queries
- **No queues/background jobs**: All operations synchronous/streaming

---

## 1. Overview

### Strengths

✅ **Clear architectural boundaries**: Hono handles HTTP, Effect handles business logic  
✅ **Type-safe error handling**: Tagged errors (`Data.TaggedError`) with proper error types  
✅ **Dependency injection**: Effect.Service pattern with Layer composition  
✅ **Parallel execution**: Proper use of `Effect.all` and streams for concurrent LLM queries  
✅ **Configuration management**: Effect Config service with typed, validated config  
✅ **Graceful degradation**: Continues with successful responses if some models fail  
✅ **Effect Schema validation**: Runtime schema validation for external API responses and storage data  

### Primary Risks

✅ **Error → HTTP mapping**: Comprehensive error-to-HTTP status mapping implemented  
✅ **Observability**: Comprehensive structured logging, metrics, and distributed tracing implemented  
✅ **Unified API surface**: All endpoints consolidated to single unversioned API (V1/V2/V3 prefixes removed)  
✅ **Resource management**: Rate limiting, request timeouts, and body size limits implemented; connection pooling handled by Node.js  
✅ **Test patterns**: Centralized production and test runtimes implemented; tests use test runtime with mocks  
✅ **Layer composition**: Centralized layer composition with shared base layers; no duplication  
✅ **Input validation**: Effect Schema consistently applied at HTTP boundary for all route parameters and request bodies  

---

## 2. Architecture: Hono (HTTP) vs Effect (Core)

### Findings

**✅ Clear Separation of Concerns**
- `main.ts` (Hono routes) handles HTTP concerns: request parsing, response formatting, CORS
- `council.ts`, `openrouter.ts`, `storage.ts` (Effect services) handle business logic
- Routes delegate quickly to Effect programs via `Effect.runPromise`

**⚠️ Boundary Issues**

1. **Error Handling at Boundary** (`main.ts:68-74`, `main.ts:159-162`)
   ```typescript
   // Current: Generic catch-all
   catch (error) {
     console.error("Error listing conversations:", error);
     return c.json({ error: "Failed to list conversations" }, { status: 500 });
   }
   ```
   - All errors return `500 Internal Server Error`
   - No distinction between `400 Bad Request`, `404 Not Found`, `409 Conflict`, etc.
   - Error messages may leak internal details to clients

2. **Direct Effect.runPromise Calls** (`main.ts:69`, `council.ts:558-599`)
   - Routes call `Effect.runPromise` directly, creating new runtime per request
   - Should use a shared runtime for better resource management
   - No request context (correlation IDs, user identity) passed to Effect programs

3. **Standalone Function Exports** (`council.ts:530-599`, `storage.ts:401-460`)
   - Backward-compatibility functions use `Effect.runSync/Promise` with hardcoded layers
   - Creates duplicate layer composition logic
   - Makes testing harder (can't easily inject test layers)

4. **No Request Context**
   - No correlation IDs for tracing requests across services
   - No user identity extraction from auth headers/cookies
   - No request-scoped logging context

### Recommendations

**High Priority**:
1. **Create HTTP error mapper** (`backend/src/http/error-mapper.ts`):
   ```typescript
   export const mapEffectErrorToHttp = (error: unknown): { status: number; body: unknown } => {
     if (error instanceof StorageError && error.operation === "getConversation") {
       return { status: 404, body: { error: "Conversation not found" } };
     }
     if (error instanceof ValidationError) {
       return { status: 400, body: { error: error.message, field: error.field } };
     }
     if (error instanceof OpenRouterError && error.message.includes("timeout")) {
       return { status: 504, body: { error: "Upstream service timeout" } };
     }
     // ... more mappings
     return { status: 500, body: { error: "Internal server error" } };
   };
   ```

2. **Create shared runtime** (`backend/src/runtime.ts`):
   ```typescript
   import { Runtime } from "effect";
   
   export const AppRuntime = Runtime.make(
     Layer.mergeAll(
       AppConfig.Default,
       StorageService.Default,
       OpenRouterClient.Default,
       CouncilService.Default
     )
   );
   ```
   Use in routes: `Runtime.runPromise(AppRuntime)(effect)` instead of `Effect.runPromise(effect.pipe(Effect.provide(layer)))`

3. **Add request context service** (`backend/src/http/context.ts`):
   ```typescript
   export class RequestContext extends Effect.Service<RequestContext>()("RequestContext", {
     effect: Effect.gen(function* () {
       const correlationId = yield* Effect.sync(() => randomUUID());
       return { correlationId };
     })
   });
   ```
   Extract from Hono context and provide to Effect programs.

**Medium Priority**:
4. **Refactor standalone exports**: Remove `Effect.runSync/Promise` wrappers, expose Effect programs directly. Let callers provide layers.

5. **Add request ID middleware** (`main.ts:36-45`): Extract/generate correlation ID, add to Effect context.

---

## 3. Data Fetching, Caching & Revalidation

### Findings

**⚠️ No Caching Strategy**
- All endpoints are dynamic (no caching headers)
- `GET /api/conversations` reads from filesystem on every request
- `GET /api/conversations/:id` reads and parses JSON on every request
- No in-memory cache for frequently accessed conversations

**✅ No N+1 Issues**
- Parallel queries use `Effect.all` and streams correctly
- No repeated database/file reads within a single request

**❌ No Revalidation**
- File-based storage means changes are immediately visible (no cache invalidation needed)
- But no mechanism to invalidate caches if caching is added later

### Recommendations

**Medium Priority**:
1. **Add response caching headers** for read endpoints:
   ```typescript
   // GET /api/conversations/:id
   return c.json(conversation, {
     headers: {
       "Cache-Control": "private, max-age=60" // Cache for 1 minute
     }
   });
   ```

2. **Consider in-memory LRU cache** for conversation metadata:
   ```typescript
   import { LRUCache } from "lru-cache";
   const conversationCache = new LRUCache<string, Conversation>({ max: 100 });
   ```

3. **Add ETags** for conditional requests (304 Not Modified) if conversations are large.

---

## 4. Effect Usage: Errors, Layers, Concurrency

### Findings

**✅ Strong Error Modeling**
- Tagged errors (`Data.TaggedError`) with typed error channels
- Clear error hierarchy: `OpenRouterError`, `StorageError`, `CouncilError`, `ValidationError`
- Errors include context (model, operation, path, stage)

**⚠️ Error Handling Gaps**
- `council.ts:117-131`: Stage 1 fails if ALL models fail, but doesn't handle partial failures gracefully in all cases
- `openrouter.ts:166-211`: `queryModelsParallel` returns `null` for failed models, but doesn't propagate errors to caller
- No retry logic for transient failures (network timeouts, rate limits)

**✅ Good Layer Composition**
- `council.ts:517-528`: Proper layer merging with `Layer.mergeAll` and `Layer.provide`
- `storage.ts:396-398`: `StorageServiceLive` provides `AppConfig.Default`
- Services depend on abstractions, not concrete implementations

**⚠️ Layer Duplication**
- `council.ts:518-528` and `council-integration.ts:113-118` duplicate layer composition
- Should extract to shared `backend/src/layers.ts`

**✅ Proper Concurrency**
- `openrouter.ts:176-183`: Uses `Stream.mapEffect` for parallel queries
- `council.ts:98-101`: Parallel model queries in Stage 1
- `council.ts:219-222`: Parallel ranking queries in Stage 2

**⚠️ No Concurrency Bounds**
- `queryModelsParallel` has no limit on concurrent requests
- Could overwhelm OpenRouter API with large model lists
- No rate limiting per user/IP

**✅ Resource Management**
- `openrouter.ts:74`: Uses `AbortSignal.timeout` for request timeouts
- Effect handles cleanup automatically
- No manual resource leaks observed

### Recommendations

**High Priority**:
1. **Add concurrency bounds** to `queryModelsParallel`:
   ```typescript
   Stream.mapEffect((model) => ..., { concurrency: 5 }) // Limit to 5 concurrent requests
   ```

2. **Extract shared layer composition** (`backend/src/layers.ts`):
   ```typescript
   export const AppLayer = Layer.mergeAll(
     AppConfig.Default,
     StorageService.Default,
     OpenRouterClient.Default
   );
   
   export const CouncilServiceLayer = CouncilService.Default.pipe(
     Layer.provide(AppLayer)
   );
   ```

3. **Add retry logic** for transient failures:
   ```typescript
   import { Schedule } from "effect";
   
   const queryWithRetry = queryModel.pipe(
     Effect.retry(Schedule.exponential("100 millis").pipe(Schedule.compose(Schedule.recurs(3))))
   );
   ```

**Medium Priority**:
4. **Improve error propagation**: Make `queryModelsParallel` return `Effect<Record<string, Either<Error, Response>>>` instead of `Record<string, Response | null>` to preserve error information.

5. **Add circuit breaker** for OpenRouter API if it's frequently failing.

---

## 5. Configuration & Secrets

### Findings

**✅ Typed Configuration**
- `config.ts:7-67`: Effect Config service with typed access
- Environment variables validated and defaulted
- `OPENROUTER_API_KEY` required (fails fast if missing)

**✅ Secrets Handling**
- API key only accessed in server code (not exposed to client)
- No secrets in logs observed
- Uses `Config.string()` which reads from `process.env`

**⚠️ Configuration Issues**
- `config.ts:18-25`: `COUNCIL_MODELS` uses `Config.array(Config.string(...))` which may not work as expected
  - Should use `Config.string("COUNCIL_MODELS").pipe(Config.map(val => val.split(",")))` or similar
- No validation of model IDs (could be invalid strings)
- No environment-specific config (dev/stage/prod)

**❌ No Secret Rotation**
- API key loaded once at startup
- No mechanism to reload config without restart
- No support for secret managers (AWS Secrets Manager, etc.)

### Recommendations

**High Priority**:
1. **Fix COUNCIL_MODELS parsing**:
   ```typescript
   councilModels: yield* Config.string("COUNCIL_MODELS").pipe(
     Config.withDefault("openai/gpt-5.1,google/gemini-3-pro-preview,..."),
     Config.map(val => val.split(",").map(s => s.trim()).filter(Boolean))
   ),
   ```

2. **Add config validation**:
   ```typescript
   const validateModelId = (model: string) => {
     if (!model.includes("/")) {
       return Effect.fail(new ConfigError({ key: "COUNCIL_MODELS", message: `Invalid model ID: ${model}` }));
     }
     return Effect.succeed(model);
   };
   ```

**Medium Priority**:
3. **Add environment detection**:
   ```typescript
   environment: yield* Config.string("NODE_ENV").pipe(Config.withDefault("development")),
   isProduction: environment === "production",
   ```

4. **Consider secret manager integration** for production (AWS Secrets Manager, HashiCorp Vault).

---

## 6. Domain Modeling & Service Design

### Findings

**✅ Cohesive Services**
- `CouncilService`: Orchestrates 3-stage process
- `OpenRouterClient`: LLM API communication
- `StorageService`: Conversation persistence
- `AppConfig`: Configuration access
- Clear separation of concerns

**✅ Well-Defined Types**
- `storage.ts:8-51`: Clear type definitions for messages, conversations, stages
- `council.ts:13-26`: Metadata types (`LabelToModelMap`, `AggregateRanking`)
- Effect Schema for runtime validation

**✅ Comprehensive Input Validation**
- `http/app.ts:59-81`: Schemas defined for all route parameters (`ConversationIdSchema`, `WorkflowIdSchema`) and request bodies (`ExecuteWorkflowBodySchema`)
- `http/app.ts:83-113`: `extractRouteParam` helper validates route parameters with Effect Schema at HTTP boundary
- All route parameters validated with length constraints (minLength: 1, maxLength: 255)
- Request body validation with `Http.request.schemaBodyJson` for workflow execution
- Content validation with length constraints (maxLength: 100000 for message content)
- Schema validation errors automatically mapped to 400 Bad Request responses
- No manual validation checks after schema validation (redundant checks removed)

**⚠️ Service Boundaries**
- `council.ts:44-78`: Mock mode logic embedded in `CouncilService` (should be in test layer)
- `council.ts:333-365`: `parseRankingFromText` is a pure function but exported as part of service
- Some business logic in standalone exports instead of service methods

**✅ Pure vs Effectful**
- `parseRankingFromText`, `calculateAggregateRankings` are pure functions (good!)
- I/O operations (file, network) are properly effectful
- Clear separation maintained

**✅ Workflow System Architecture**
- `workflow/registry.ts`: `WorkflowRegistry` manages available workflows (LLM Council, Linear Default)
- `workflow/core/`: Core workflow execution engine with DAG support
- `workflow/stages/`: Reusable stage implementations (parallel-query, peer-ranking, synthesis, simple-query)
- Unified API (`/api/workflows`, `/api/conversations/:id/execute/stream`) uses workflow system
- DAG visualization support for frontend React Flow integration

**✅ Unified API Surface**
- All endpoints consolidated to single unversioned API surface
- No V1/V2/V3 version prefixes - all endpoints use `/api/*` pattern
- Workflow system is the primary execution mechanism
- Legacy versioned endpoints have been removed

**✅ Centralized Layer Composition**
- `runtime.ts`: Centralized `ProductionLayer` with shared base layers
- `BaseServicesLayer`: Shared AppConfig layer used by all service-specific layers
- `CoreServicesLayer`: Shared core services (Storage, OpenRouter, Auth)
- All `.Live` exports use shared base layers (no duplication)
- `server.ts` uses `ProductionLayer` instead of duplicating
- `main.test.ts` uses `TestLayer` instead of duplicating
- `council.ts` uses `ProductionLayer` instead of custom layer composition

### Implementation Details

**Layer Hierarchy**:
```
BaseServicesLayer (AppConfig)
  ├── CoreServicesLayer (Storage, OpenRouter, Auth)
  ├── ObservabilityServiceLive
  ├── RateLimitServiceLive
  └── ProductionLayer (combines all above)
```

**Service-Specific Layers**:
- `StorageServiceLive` = `StorageService.Default` + `BaseServicesLayer`
- `AuthServiceLive` = `AuthService.Default` + `BaseServicesLayer`
- `RateLimitServiceLive` = `RateLimitService.Default` + `BaseServicesLayer`
- `CouncilServiceLive` = `CouncilService.Default` + `ProductionLayer`

### Recommendations

**High Priority**:
1. **Extract mock mode to test layer**: Move mock client creation to test utilities, not production service.

**Medium Priority**:
2. **Extract pure functions**: Move `parseRankingFromText`, `calculateAggregateRankings` to separate `utils/` module if they're used outside service.

4. **Add domain value objects**: Consider branded types for `ConversationId`, `ModelId` to prevent mixing up strings.

---

## 7. Security, Auth & Permissions

### Findings

**❌ No Authentication**
- All endpoints are public
- No user identity extraction
- No API keys or tokens

**❌ No Authorization**
- No permission checks
- No user-to-conversation ownership validation
- Anyone can access any conversation if they know the ID

**✅ Input Validation**
- `http/app.ts:59-81`: Comprehensive Effect Schema validation for all route parameters and request bodies
- Route parameters validated with length constraints (minLength: 1, maxLength: 255)
- Request body content validated with length constraints (maxLength: 100000)
- All validation errors automatically mapped to 400 Bad Request with detailed error messages
- Schema validation applied at HTTP boundary before any business logic

**✅ CORS Configuration**
- `main.ts:48-56`: CORS enabled for specific origins (`localhost:5173`, `localhost:3000`)
- Credentials allowed (needed for cookies if auth is added)

**❌ No Rate Limiting**
- No per-IP or per-user rate limits
- Could be abused for DoS or API cost exhaustion

**⚠️ Error Information Leakage**
- `main.ts:72`: Error messages may include internal details
- `openrouter.ts:115`: HTTP status codes from OpenRouter exposed to client

### Recommendations

**Critical Priority**:
1. **Add authentication middleware**:
   ```typescript
   // Extract from Authorization header or cookie
   const getUserId = (c: Context) => {
     const token = c.req.header("Authorization")?.replace("Bearer ", "");
     // Verify token, return user ID
   };
   ```

2. **Add authorization checks**:
   ```typescript
   // In routes, before accessing conversation
   const conversation = await getConversation(conversationId);
   if (conversation.userId !== userId) {
     return c.json({ error: "Forbidden" }, { status: 403 });
   }
   ```

3. **Add input validation**:
   ```typescript
   const MessageContentSchema = z.string().min(1).max(10000); // Limit message length
   const content = MessageContentSchema.parse(body.content);
   ```

4. **Add rate limiting**:
   ```typescript
   import { rateLimit } from "hono-rate-limit";
   app.use("/api/*", rateLimit({ windowMs: 60000, max: 10 })); // 10 requests per minute
   ```

**High Priority**:
5. **Sanitize error responses**: Never expose stack traces or internal error details to clients.

6. **Add request size limits**: Limit request body size to prevent DoS.

---

## 8. Observability & Operability

### Findings

**✅ Structured Logging**
- All logging uses Effect's structured logging (`logInfo`, `logError`, `logWarning`, `logDebug`)
- JSON-formatted logs with timestamps, levels, and structured context
- Correlation IDs included in all log entries for request tracking
- All `console.log`/`console.error` calls replaced with structured logging
- Logs are parseable and searchable in production

**✅ Comprehensive Metrics**
- HTTP request metrics: count, duration, error rate (by method, path, status)
- LLM API metrics: request count, duration, token usage (input/output), error rate (by model)
- Workflow metrics: execution count, duration, stage duration (by workflow ID)
- Storage metrics: operation count, duration, error rate (by operation type)
- Rate limiting metrics: check count, hit count (by type: api/workflow)

**✅ Distributed Tracing**
- Request tracing with spans for all HTTP requests
- Stage-level tracing for council workflow (stage1, stage2, stage3)
- Span attributes include correlation IDs, operation context
- Span events for key operations (LLM queries, storage operations)
- Performance profiling via span durations

**✅ Correlation IDs**
- UUID generated per request (or extracted from `X-Correlation-ID` header)
- Included in all logs, metrics, and traces
- Enables end-to-end request tracking across services

**✅ Error Aggregation**
- All errors logged with structured context
- Error metrics tracked by type and operation
- Errors include correlation IDs for traceability

### Implementation Details

**Structured Logging** (`backend/src/observability.ts`):
- JSON-formatted output for log aggregation systems
- Correlation IDs automatically included
- Context fields for operation details (duration, counts, etc.)

**Metrics** (`backend/src/observability.ts`):
- Counters for events (requests, operations, errors)
- Histograms for durations with configurable boundaries
- Tagged metrics for filtering (method, path, model, operation, etc.)

**Tracing** (`backend/src/observability.ts`):
- Spans created for all major operations
- Span attributes for filtering and analysis
- Span events for key milestones
- Correlation IDs propagated through spans

**Integration**:
- Middleware automatically adds correlation IDs to requests
- All services instrumented with logging, metrics, and tracing
- Observability service provided via Effect Layer system

---

## 9. Testing & DX

### Findings

**✅ Test Structure**
- Unit tests: `council.test.ts`, `storage.test.ts`
- Integration tests: `council.integration.test.ts`
- Test files co-located with source

**⚠️ Test Patterns**
- `council.test.ts:2`: Tests pure functions (`parseRankingFromText`, `calculateAggregateRankings`)
- But these use `Effect.runSync` with hardcoded `CouncilServiceLive` layer
- Can't easily inject mocks for testing

**❌ Missing Test Coverage**
- No tests for HTTP routes (`main.ts`)
- No tests for error handling at HTTP boundary
- No tests for SSE streaming endpoints
- No tests for workflow system integration

**✅ Centralized Runtime Management**
- `runtime.ts`: Production runtime with all live services
- `runtime.test.ts`: Test runtime with mock services
- `RUNTIME_PATTERNS.md`: Comprehensive documentation of runtime usage
- Production code uses `ProductionRuntime` instead of hardcoded layers
- Tests use `TestRuntime` with automatic mock services
- No more scattered `Effect.runPromise` with hardcoded layers

**✅ Test Helpers**
- `openrouter.mock.ts`: Mock OpenRouter client integrated into test runtime
- Test runtime automatically provides mock services
- Tests no longer require `OPENROUTER_API_KEY` or real external services

### Implementation Details

**Production Runtime** (`backend/src/runtime.ts`):
- Centralized layer composition for all production services
- Used via `Runtime.runPromise(ProductionRuntime)(effect)`
- All services are live (real API, real storage, etc.)

**Test Runtime** (`backend/src/runtime.test.ts`):
- Centralized layer composition for all test services
- Used via `Runtime.runPromise(TestRuntime)(effect)`
- Mock services automatically provided (no real API calls)
- Test configuration (mock mode, test data directory)
- Custom test layers can be created with `createTestLayer()`

**Migration Status**:
- ✅ `council-integration.ts` migrated to use `ProductionRuntime`
- ✅ Test files can use `TestRuntime` for Effect-based tests
- ⚠️ Some tests pass mocks directly (no runtime needed) - this is fine

3. **Add HTTP route tests**:
   ```typescript
   import { testClient } from "hono/testing";
   
   test("POST /api/conversations creates conversation", async () => {
     const app = createApp();
     const res = await testClient(app).api.conversations.$post({ json: {} });
     expect(res.status).toBe(200);
   });
   ```

**Medium Priority**:
4. **Add integration tests for SSE streaming**: Test that events are emitted in correct order.

5. **Add test coverage reporting**: Ensure critical paths are covered.

---

## 10. Prioritized Action Plan

### Critical (Blockers)

1. **Priority**: Critical | **Theme**: Security  
   **Action**: Add authentication and authorization to all endpoints  
   **Effort**: Large  
   **Files**: `main.ts`, new `auth.ts` middleware

2. **Priority**: Critical | **Theme**: Security  
   **Action**: Add input validation and rate limiting  
   **Effort**: Medium  
   **Files**: `http/app.ts`, add Effect Schema for request bodies

3. **Priority**: Critical | **Theme**: Reliability  
   **Action**: Fix error → HTTP status code mapping (400/404/409/500)  
   **Effort**: Small  
   **Files**: `main.ts`, new `http/error-mapper.ts`

### High Priority

4. **Priority**: High | **Theme**: Reliability  
   **Action**: Add structured logging with correlation IDs  
   **Effort**: Medium  
   **Files**: All service files, new `logging.ts`

5. **Priority**: High | **Theme**: Reliability  
   **Action**: Add concurrency bounds to parallel LLM queries  
   **Effort**: Small  
   **Files**: `openrouter.ts`

6. **Priority**: High | **Theme**: DX  
   **Action**: Create test layers and refactor tests to use them  
   **Effort**: Medium  
   **Files**: All `*.test.ts` files, new `test/layers.ts`

7. **Priority**: High | **Theme**: Architecture  
   **Action**: Extract shared layer composition to `layers.ts`  
   **Effort**: Small  
   **Files**: `council.ts`, `council-integration.ts`, new `layers.ts`

8. **Priority**: High | **Theme**: Observability  
   **Action**: Add basic metrics (request count, latency, error rate)  
   **Effort**: Medium  
   **Files**: `main.ts`, new `metrics.ts`

### Medium Priority

9. **Priority**: Medium | **Theme**: Configuration  
   **Action**: Fix `COUNCIL_MODELS` array parsing from env var  
   **Effort**: Small  
   **Files**: `config.ts`

10. **Priority**: Medium | **Theme**: Performance  
    **Action**: Add in-memory LRU cache for conversation metadata  
    **Effort**: Small  
    **Files**: `storage.ts`

11. **Priority**: Medium | **Theme**: Architecture  
    **Action**: Deprecate V1/V2 legacy endpoints, migrate to V3 workflow API only  
    **Effort**: Medium  
    **Files**: `main.ts` (remove V1/V2 routes), update frontend to use V3 only

12. **Priority**: Medium | **Theme**: Observability  
    **Action**: Add health check endpoint  
    **Effort**: Small  
    **Files**: `main.ts`

---

## Summary

This backend demonstrates **strong architectural foundations** with:
- ✅ **Generalized workflow system**: DAG-based execution engine supporting arbitrary multi-stage workflows
- ✅ **Clear separation**: Hono handles HTTP, Effect handles business logic
- ✅ **Type-safe error handling**: Tagged errors with proper error types
- ✅ **Dependency injection**: Effect.Service pattern with Layer composition
- ✅ **Authentication/Authorization**: Bearer token/API key auth with user-scoped conversations

However, it's missing **critical production features**: structured logging, metrics, and proper error → HTTP mapping.

The codebase is well-structured and maintainable. The workflow generalization is a significant architectural improvement, but V1/V2 legacy endpoints should be deprecated in favor of the V3 workflow API.

**Overall Assessment**: Solid foundation with good workflow architecture. Needs production hardening (observability, error handling) and API consolidation (deprecate legacy endpoints) before deployment.

