# Backend Architecture Review: Ensemble (Effect Platform HTTP + Effect-TS)

**Review Date**: 2025-01-27  
**Reviewer**: Senior Backend Architect  
**Stack**: Effect Platform HTTP + Effect-TS (Business Logic) + Bun (Runtime)  
**Version**: 2.0.0

---

## 0. Context Summary

**System Overview**:  
Ensemble is a **generalized workflow-based AI system** where users can execute configurable multi-stage workflows with LLMs. The backend provides a workflow execution engine that supports arbitrary DAG-based workflows (stages with dependencies). The system includes pre-built workflows like the "LLM Council" (3-stage deliberation with anonymized peer review) and "Linear Default" (simple sequential chain), but users can configure custom workflows. The backend serves as an API for a React frontend that visualizes workflows as DAGs.

**Key Backend Flows**:
1. **List workflows** (`GET /api/workflows`) - List available workflow definitions with metadata
2. **Get workflow** (`GET /api/workflows/:id`) - Get workflow definition with DAG visualization
3. **Execute workflow** (`POST /api/conversations/:id/execute/stream`) - Execute workflow with SSE streaming
4. **Create conversation** (`POST /api/conversations`) - Initialize new conversation (requires auth)
5. **List conversations** (`GET /api/conversations`) - Metadata-only listing (filtered by user, requires auth)
6. **Get conversation** (`GET /api/conversations/:id`) - Full conversation history (requires auth + ownership)

**Non-Negotiables**:
- ✅ **Correctness & Error Handling**: Typed errors via Effect, comprehensive HTTP status mapping
- ✅ **Performance**: Parallel queries with rate limiting and resource bounds
- ✅ **Observability**: Structured logging, metrics, distributed tracing with correlation IDs
- ✅ **Security**: Bearer token/API key authentication, user-scoped conversations, resource authorization
- ✅ **DX/Testability**: Effect services with separate production/test runtimes, mock services for tests

**Infrastructure**:
- **Data Store**: File-based JSON storage (`data/conversations/*.json`)
- **Runtime**: Bun server (Node.js-compatible)
- **External APIs**: OpenRouter API for LLM queries
- **No queues/background jobs**: All operations synchronous/streaming

---

## 1. Overview

### Strengths

✅ **Effect-Native Stack**: Complete Effect Platform HTTP integration, no framework boundaries  
✅ **Type-Safe Error Handling**: Tagged errors (`Data.TaggedError`) with comprehensive HTTP status mapping  
✅ **Dependency Injection**: Effect.Service pattern with centralized Layer composition  
✅ **Parallel Execution**: Proper use of `Effect.all` and streams for concurrent LLM queries  
✅ **Configuration Management**: Effect Config service with typed, validated config  
✅ **Graceful Degradation**: Continues with successful responses if some models fail  
✅ **Effect Schema Validation**: Runtime schema validation for all external inputs and storage data  
✅ **Comprehensive Observability**: Structured logging, metrics, and distributed tracing  
✅ **Security**: Authentication, authorization, rate limiting, input validation  
✅ **Resource Management**: Request timeouts, body size limits, connection pooling  

### Primary Risks

⚠️ **Runtime Boundary Inconsistency**: Routes call standalone functions that use `Effect.runPromise` with hardcoded layers, instead of using Effect services directly  
⚠️ **Standalone Function Anti-Pattern**: Backward-compatibility functions create new runtimes per call instead of using centralized `ProductionRuntime`  
⚠️ **Error Handling in Routes**: Routes wrap standalone functions in `Effect.tryPromise`, losing type safety and error context  
⚠️ **Test Coverage**: HTTP endpoint tests need update for Effect Platform HTTP  

---

## 2. Architecture: Effect Platform HTTP vs Effect Services

### Findings

**✅ Clear Separation of Concerns**
- `http/app.ts` (Effect Platform HTTP routes) handles HTTP concerns: request parsing, response formatting, CORS
- `council.ts`, `openrouter.ts`, `storage.ts` (Effect services) handle business logic
- Routes return `Effect<HttpResponse>` directly, Effect Platform handles execution

**⚠️ Boundary Issues**

1. **Standalone Function Anti-Pattern** (`storage.ts:490-550`, `council.ts:612-654`)
   ```typescript
   // Current: Routes call standalone functions that create new runtimes
   export const createConversation = (conversationId: string, userId: string) =>
     Effect.runPromise(
       Effect.gen(function* () {
         const storage = yield* StorageService;
         return yield* storage.createConversation(conversationId, userId);
       }).pipe(Effect.provide(StorageServiceLive))
     );
   ```
   - **Problem**: Each call creates a new runtime with `Effect.runPromise`
   - **Problem**: Routes wrap these in `Effect.tryPromise`, losing error types
   - **Problem**: Hardcoded layers (`StorageServiceLive`) instead of using `ProductionRuntime`
   - **Impact**: No request context (correlation IDs, user identity) in Effect programs
   - **Impact**: Inefficient resource management (new runtime per call)

2. **Route Handler Pattern** (`http/app.ts:332-343`)
   ```typescript
   const listConversationsRoute = Http.router.get(
     "/api/conversations",
     Effect.gen(function* () {
       const request = yield* Http.request.HttpRequest;
       const user = yield* extractUserFromRequest(request);
       const conversations = yield* Effect.tryPromise({
         try: () => listConversations(user.userId),  // ❌ Calls standalone function
         catch: (error) => error,
       });
       return Http.response.json(conversations as ConversationMetadata[]);
     })
   );
   ```
   - **Problem**: Routes call standalone Promise-returning functions instead of Effect services
   - **Problem**: `Effect.tryPromise` loses error type information
   - **Problem**: No access to Effect Context (correlation IDs, observability)
   - **Should be**: Routes should use Effect services directly via `yield* StorageService`

3. **Workflow Execution Pattern** (`http/app.ts:458-550`)
   ```typescript
   const executeWorkflowRoute = Http.router.post(
     "/api/conversations/:conversationId/execute/stream",
     Effect.gen(function* () {
       // ... validation ...
       // Uses executeCouncilWorkflow which uses ProductionRuntime ✅
       // But still wrapped in ReadableStream with Effect.runPromise
     })
   );
   ```
   - **Mixed**: `executeCouncilWorkflow` correctly uses `ProductionRuntime`
   - **Problem**: SSE stream uses `Effect.runPromise` in ReadableStream callbacks
   - **Impact**: Stream callbacks run outside Effect Context

4. **No Request Context Propagation**
   - Correlation IDs are created in middleware but not propagated to standalone functions
   - User identity extracted in routes but not available in Effect services
   - Observability context (spans, metrics) not available in standalone function calls

### Recommendations

**High Priority**:
1. **Refactor routes to use Effect services directly** (`http/app.ts`):
   ```typescript
   const listConversationsRoute = Http.router.get(
     "/api/conversations",
     Effect.gen(function* () {
       const request = yield* Http.request.HttpRequest;
       const user = yield* extractUserFromRequest(request);
       const storage = yield* StorageService;  // ✅ Use service directly
       const conversations = yield* storage.listConversations(user.userId);
       return Http.response.json(conversations);
     }).pipe(Effect.catchAll((error) => Effect.succeed(mapErrorToHttp(error))))
   );
   ```
   - Remove `Effect.tryPromise` wrappers
   - Use `yield* StorageService` instead of standalone functions
   - Effect Platform HTTP automatically provides services via Layer

2. **Deprecate standalone functions** (`storage.ts`, `council.ts`):
   - Mark as `@deprecated` with migration path
   - Update all route handlers to use services directly
   - Remove after migration complete

3. **Fix SSE stream execution** (`http/app.ts:517-550`):
   ```typescript
   // Current: Effect.runPromise in ReadableStream callback
   // Better: Use Effect Platform's streaming support or provide context
   const stream = new ReadableStream({
     async start(controller) {
       // Provide ProductionLayer to maintain context
       const result = await Runtime.runPromise(ProductionRuntime)(
         executeCouncilWorkflow(body.content, (event) => {
           // Stream events
         })
       );
     }
   });
   ```

**Medium Priority**:
4. **Centralize runtime provisioning**:
   - Effect Platform HTTP should automatically provide `ProductionLayer` to all routes
   - Verify `Http.serve(app)` provides services correctly
   - Document how services are injected into route handlers

---

## 3. Effect Usage: Errors, Layers, Concurrency

### Findings

**✅ Typed Error Channels**
- All services use typed error channels: `Effect.Effect<A, DomainError, Env>`
- Error types: `ValidationError`, `AuthenticationError`, `AuthorizationError`, `ConversationNotFoundError`, `StorageError`, `OpenRouterError`, `RateLimitError`, `TimeoutError`
- Errors propagate through Effect chains without losing type information

**✅ Error → HTTP Mapping**
- `mapErrorToHttp`: Comprehensive error-to-HTTP status mapping
  - 400: `ValidationError`, `Schema.ParseError`
  - 401: `AuthenticationError`
  - 403: `AuthorizationError`
  - 404: `ConversationNotFoundError`
  - 413: Request too large
  - 429: `RateLimitError`
  - 500: `StorageError`, unexpected errors
  - 502: `OpenRouterError`
  - 504: `TimeoutError`

**✅ Layer Composition**
- `BaseServicesLayer`: Shared AppConfig
- `CoreServicesLayer`: Storage + OpenRouter + Auth
- `ProductionLayer`: All production services
- Service-specific `.Live` exports use shared base layers (no duplication)
- `ProductionRuntime`: Centralized runtime for production code
- `TestRuntime`: Separate runtime with mock services for tests

**⚠️ Resource Management Issues**

1. **Standalone Functions Create New Runtimes** (`storage.ts:490-550`)
   - Each call to `createConversation`, `getConversation`, etc. creates a new runtime
   - No connection pooling or resource reuse
   - Should use shared `ProductionRuntime` or Effect Platform's automatic provisioning

2. **SSE Stream Resource Management** (`http/app.ts:517-550`)
   - ReadableStream callbacks use `Effect.runPromise` which may not clean up resources
   - Stream cancellation may not propagate to Effect programs
   - Consider using Effect Platform's streaming support

**✅ Concurrency & Scheduling**
- Parallel LLM queries use `Effect.all` with proper error handling
- Workflow stages execute in topological order (DAG-based)
- No unbounded parallelism on untrusted inputs
- Rate limiting prevents resource exhaustion

### Recommendations

**High Priority**:
1. **Eliminate standalone function runtimes**:
   - Refactor routes to use Effect services directly
   - Remove `Effect.runPromise` from standalone functions
   - Use Effect Platform's automatic service provisioning

**Medium Priority**:
2. **Improve SSE stream resource management**:
   - Use Effect Platform's streaming support if available
   - Ensure stream cancellation propagates to Effect programs
   - Add cleanup handlers for interrupted streams

---

## 4. Configuration, Secrets, and Environment

### Findings

**✅ Configuration Management**
- `AppConfig` service uses Effect Config with typed, validated config
- All config accessed via service, not `process.env` scattered everywhere
- Config loading failures are fail-fast with clear messaging
- Defaults provided for optional config

**✅ Secrets Handling**
- API keys loaded from environment variables via Effect Config
- Secrets never logged (redacted in logs)
- Secrets only accessed in server context (not in client bundles)

**✅ Environment Separation**
- Config supports environment-specific values via environment variables
- Test configuration separate from production (`TestConfigLayer`)
- Mock mode flag for development/testing

### Recommendations

**Low Priority**:
1. **Consider secret management service**:
   - For production, consider AWS Secrets Manager, HashiCorp Vault, etc.
   - Effect Config can integrate with secret management services

---

## 5. Domain Modeling & Service Design

### Findings

**✅ Service Boundaries**
- Services are cohesive: `StorageService` handles persistence, `OpenRouterClient` handles LLM queries, `AuthService` handles authentication
- No "God services" - each service has clear responsibility
- Services depend on abstractions, not concrete implementations

**✅ Domain Types and Schemas**
- Well-defined domain types: `Conversation`, `ConversationMetadata`, `Stage1Response`, `Stage2Response`, `Stage3Response`
- Effect Schema validation for all inputs and outputs
- External DTOs (HTTP requests/responses) mapped to domain types

**✅ Pure vs Effectful Code**
- Pure functions: `parseRankingFromText`, `calculateAggregateRankings`
- I/O operations clearly effectful (file operations, network requests)
- Clear separation makes testing easier

**⚠️ Service Design Issues**

1. **Standalone Functions Break Service Boundaries** (`storage.ts:490-550`)
   - Standalone functions bypass service layer
   - Routes can't access service methods directly
   - Creates unnecessary Promise boundaries

### Recommendations

**High Priority**:
1. **Refactor routes to use services directly**:
   - Remove standalone function layer
   - Routes should `yield* StorageService` directly
   - Maintains service boundaries and Effect Context

---

## 6. Security, Auth, and Permissions

### Findings

**✅ Authentication**
- Bearer token/API key authentication via `AuthService`
- User identity extracted in routes via `extractUserFromRequest`
- Authentication errors properly typed and mapped to 401

**✅ Authorization**
- Resource-based authorization (conversation ownership)
- Authorization checks performed in backend (not just client)
- Permission failures modeled as `AuthorizationError` and mapped to 403

**✅ Input Validation & Sanitization**
- All inputs validated with Effect Schema before hitting core logic
- Route parameters validated: `ConversationIdSchema`, `WorkflowIdSchema`
- Request bodies validated: `ExecuteWorkflowBodySchema`
- Length constraints prevent DoS (maxLength: 255 for IDs, 100000 for content)

**✅ Sensitive Data Handling**
- User-scoped data access (conversations filtered by user ID)
- No sensitive data in logs (secrets redacted)
- Limited surface area on what is returned to clients

**✅ Rate Limiting**
- Token bucket algorithm with sliding window
- User-based rate limiting (when authenticated)
- IP-based rate limiting (fallback for unauthenticated)
- Separate limits for API endpoints and workflow executions

### Recommendations

**Medium Priority**:
1. **JWT/OAuth Integration**:
   - Current authentication is basic (token validation)
   - Consider JWT validation for production
   - OAuth integration for third-party auth

---

## 7. Observability: Logging, Metrics, Tracing

### Findings

**✅ Logging**
- Centralized logging service (`ObservabilityService`) used by Effect programs
- Structured JSON logs with timestamps, levels, messages, context
- Correlation IDs included in all log entries
- Secrets redacted in logs

**✅ Metrics**
- HTTP request metrics (count, duration, status codes)
- LLM request metrics (count, duration, model)
- Workflow execution metrics (count, duration, stage-level)
- Storage operation metrics (count, duration)
- Rate limit metrics (hits, checks)

**✅ Distributed Tracing**
- Span creation for major operations (`withSpan`)
- Span events for important milestones (`addSpanEvent`)
- Correlation IDs propagated across services

**⚠️ Observability Gaps**

1. **Standalone Functions Lose Context** (`storage.ts:490-550`)
   - Standalone functions don't have access to correlation IDs
   - Observability context not propagated to Promise-based functions
   - Metrics and tracing may not capture all operations

2. **SSE Stream Observability** (`http/app.ts:517-550`)
   - Stream events may not be traced
   - Progress callbacks may not have observability context

### Recommendations

**High Priority**:
1. **Fix observability in standalone functions**:
   - Refactor to use Effect services directly
   - Correlation IDs and spans will automatically propagate

**Medium Priority**:
2. **Improve SSE stream observability**:
   - Ensure progress callbacks have correlation IDs
   - Add spans for stream lifecycle events

---

## 8. Testing & DX

### Findings

**✅ Test Runtime**
- `TestRuntime`: Separate runtime with mock services
- `TestLayer`: Test-specific layer with mocks
- `createTestLayer`: Helper for custom test layer overrides

**✅ Mock Services**
- `createMockOpenRouterClient`: Mock LLM client for tests
- Test configuration (mock mode enabled, rate limiting disabled)
- Test data directory isolation

**✅ Test Patterns**
- All tests use `Runtime.runPromise(TestRuntime)` for consistency
- Tests can override specific services via `createTestLayer`
- Integration tests use real storage with test data directory

**⚠️ Test Coverage Issues**

1. **HTTP Endpoint Tests Need Update** (`main.test.ts:22`)
   - Tests still reference old Hono patterns
   - Need to update for Effect Platform HTTP test utilities
   - Current tests marked with TODO

2. **Standalone Function Tests**
   - Tests for standalone functions may not cover all error cases
   - Should test Effect services directly instead

### Recommendations

**High Priority**:
1. **Update HTTP endpoint tests** (`main.test.ts`):
   - Use Effect Platform HTTP test utilities
   - Test routes as Effect programs with test runtime
   - Verify error mapping and status codes

**Medium Priority**:
2. **Add integration tests for routes**:
   - Test full request/response cycle
   - Verify authentication/authorization
   - Test rate limiting and error handling

---

## 9. Prioritized Action Plan

### Critical (Blockers)

1. **Priority**: Critical | **Theme**: Architecture  
   **Action**: Refactor routes to use Effect services directly instead of standalone functions  
   **Effort**: Medium  
   **Files**: `http/app.ts` - Update all routes to `yield* StorageService` instead of calling standalone functions  
   **Impact**: Eliminates runtime boundary issues, enables proper observability, improves resource management

2. **Priority**: Critical | **Theme**: Architecture  
   **Action**: Deprecate and remove standalone function exports  
   **Effort**: Medium  
   **Files**: `storage.ts`, `council.ts` - Mark functions as deprecated, remove after route migration  
   **Impact**: Simplifies architecture, eliminates anti-patterns

### High Priority

3. **Priority**: High | **Theme**: Testing  
   **Action**: Update HTTP endpoint tests for Effect Platform HTTP  
   **Effort**: Medium  
   **Files**: `main.test.ts` - Rewrite tests to use Effect Platform HTTP test utilities  
   **Impact**: Enables proper testing of HTTP layer

4. **Priority**: High | **Theme**: Observability  
   **Action**: Fix SSE stream observability and resource management  
   **Effort**: Medium  
   **Files**: `http/app.ts:517-550` - Ensure correlation IDs and spans propagate to stream callbacks  
   **Impact**: Complete observability coverage

### Medium Priority

5. **Priority**: Medium | **Theme**: Security  
   **Action**: Implement JWT/OAuth authentication  
   **Effort**: Large  
   **Files**: `auth.ts` - Add JWT validation, OAuth integration  
   **Impact**: Production-ready authentication

6. **Priority**: Medium | **Theme**: Architecture  
   **Action**: Verify Effect Platform HTTP service provisioning  
   **Effort**: Small  
   **Files**: `server.ts`, `http/app.ts` - Document and verify how services are injected  
   **Impact**: Clarifies architecture, ensures correct usage

### Low Priority

7. **Priority**: Low | **Theme**: Infrastructure  
   **Action**: Consider database migration for production scale  
   **Effort**: Large  
   **Files**: `storage.ts` - Migrate from file-based to PostgreSQL/MySQL  
   **Impact**: Better scalability and reliability

8. **Priority**: Low | **Theme**: Infrastructure  
   **Action**: Add background job system for long-running operations  
   **Effort**: Large  
   **Files**: New - Add queue system, background job processing  
   **Impact**: Better handling of long-running workflows

---

## 10. Conclusion

The backend demonstrates **strong architectural patterns** with Effect Platform HTTP and Effect-TS:

✅ **Effect-Native Stack**: Complete integration, no framework boundaries  
✅ **Comprehensive Security**: Authentication, authorization, rate limiting, input validation  
✅ **Full Observability**: Structured logging, metrics, distributed tracing  
✅ **Type Safety**: Full TypeScript with Effect error handling  
✅ **Testability**: Separate production/test runtimes with mock services  
✅ **Resource Management**: Timeouts, size limits, connection pooling  

**Primary Issue**: The use of standalone Promise-returning functions creates runtime boundary problems and breaks observability. Routes should use Effect services directly.

**Overall Assessment**: ✅ **Excellent foundation** with one critical architectural issue to address. Once routes are refactored to use Effect services directly, the backend will be production-ready with clean architecture boundaries.

---

**Next Steps**:
1. Refactor routes to use Effect services directly (Critical)
2. Update HTTP endpoint tests (High)
3. Deprecate standalone functions (Critical)
4. Consider JWT/OAuth for production (Medium)

