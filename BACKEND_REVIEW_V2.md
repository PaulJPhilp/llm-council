# Backend Architecture Review: Ensemble (v2.0 - Post-Migration)

**Review Date**: 2025-01-27  
**Reviewer**: Senior Backend Architect  
**Stack**: Effect Platform HTTP + Effect-TS (Business Logic) + Bun (Runtime)  
**Version**: 2.0.0 (Complete rewrite from Python to TypeScript, then major refactoring)

---

## 0. Executive Summary

**System Overview**:  
Ensemble is a **generalized workflow-based AI system** where users can execute configurable multi-stage workflows with LLMs. The backend provides a workflow execution engine that supports arbitrary DAG-based workflows (stages with dependencies). The system includes pre-built workflows like the "LLM Council" (3-stage deliberation with anonymized peer review) and "Linear Default" (simple sequential chain), but users can configure custom workflows. The backend serves as an API for a React frontend that visualizes workflows as DAGs.

**Architecture Status**: ✅ **Production-Ready**
- ✅ Effect Platform HTTP (migrated from Hono)
- ✅ Comprehensive authentication & authorization
- ✅ Rate limiting (API and workflow-specific)
- ✅ Structured observability (logging, metrics, tracing)
- ✅ Input validation at HTTP boundary (Effect Schema)
- ✅ Centralized layer composition
- ✅ Separate production and test runtimes
- ✅ Comprehensive error handling with HTTP status mapping
- ✅ Resource management (timeouts, size limits, connection pooling)

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

## 1. Architecture Overview

### Strengths

✅ **Effect-Native Stack**: Complete migration to Effect Platform HTTP, eliminating framework boundaries  
✅ **Type-Safe Error Handling**: Tagged errors (`Data.TaggedError`) with comprehensive HTTP status mapping  
✅ **Dependency Injection**: Effect.Service pattern with centralized Layer composition  
✅ **Parallel Execution**: Proper use of `Effect.all` and streams for concurrent LLM queries  
✅ **Configuration Management**: Effect Config service with typed, validated config  
✅ **Graceful Degradation**: Continues with successful responses if some models fail  
✅ **Effect Schema Validation**: Runtime schema validation for all external inputs and storage data  
✅ **Comprehensive Observability**: Structured logging, metrics, and distributed tracing  
✅ **Security**: Authentication, authorization, rate limiting, input validation  
✅ **Resource Management**: Request timeouts, body size limits, connection pooling  

### Architecture Pattern

**HTTP Layer** (`http/app.ts`):
- Effect Platform HTTP router
- Request validation with Effect Schema
- Authentication/authorization middleware
- Rate limiting middleware
- Observability middleware (correlation IDs, logging, metrics, tracing)
- Comprehensive error-to-HTTP mapping

**Business Logic Layer**:
- Effect services for all business operations
- Pure functions where possible
- Type-safe error propagation
- Dependency injection via Effect Context

**Runtime Layer** (`runtime.ts`, `runtime.test.ts`):
- Centralized production runtime with all live services
- Separate test runtime with mock services
- Shared base layers to eliminate duplication

---

## 2. HTTP Layer (Effect Platform)

### Current Implementation

**✅ Effect Platform HTTP Migration**
- `http/app.ts`: All routes use `Http.router.get/post`
- Handlers return `Effect<HttpResponse>`
- No framework boundaries - fully Effect-native
- Server startup via `Http.serve(app)` with `NodeHttpServer.layer`

**✅ Request Validation**
- Route parameters validated with Effect Schema (`ConversationIdSchema`, `WorkflowIdSchema`)
- Request bodies validated with Effect Schema (`ExecuteWorkflowBodySchema`)
- Length constraints prevent DoS (maxLength: 255 for IDs, 100000 for content)
- Validation errors automatically mapped to 400 Bad Request

**✅ Error Handling**
- `mapErrorToHttp`: Comprehensive error-to-HTTP status mapping
  - 400: ValidationError, Schema.ParseError
  - 401: AuthenticationError
  - 403: AuthorizationError
  - 404: ConversationNotFoundError
  - 413: Request too large
  - 429: RateLimitError
  - 500: StorageError, unexpected errors
  - 502: OpenRouterError
  - 504: TimeoutError

**✅ Middleware Stack**
1. Request size limit (early rejection)
2. Correlation ID (request tracking)
3. Rate limiting (API and workflow-specific)
4. Request timeout (prevent hanging)
5. Observability (logging, metrics, tracing)
6. CORS (response headers)

**✅ Authentication & Authorization**
- Bearer token/API key authentication
- User identity extracted from Authorization header
- Resource-based authorization (conversation ownership)
- All protected routes require authentication

---

## 3. Business Logic Layer

### Service Architecture

**✅ Effect Services**
- `AppConfig`: Configuration access
- `StorageService`: Conversation persistence
- `OpenRouterClient`: LLM API communication
- `AuthService`: Authentication and authorization
- `ObservabilityService`: Logging, metrics, tracing
- `RateLimitService`: Rate limiting with token bucket algorithm
- `CouncilService`: 3-stage council orchestration (legacy, used by workflows)

**✅ Layer Composition**
- `BaseServicesLayer`: Shared AppConfig
- `CoreServicesLayer`: Storage + OpenRouter + Auth
- `ProductionLayer`: All production services
- Service-specific `.Live` exports use shared base layers (no duplication)

**✅ Runtime Management**
- `ProductionRuntime`: Centralized runtime for production code
- `TestRuntime`: Separate runtime with mock services for tests
- All tests use `Runtime.runPromise(TestRuntime)` for consistency

### Workflow System

**✅ Workflow Engine**
- `WorkflowRegistry`: Manages available workflows
- `WorkflowExecutor`: Executes workflows with DAG-based stage ordering
- Stage dependencies resolved via topological sort
- Progress events via SSE streaming

**✅ Stage Types**
- `ParallelQueryStage`: Parallel LLM queries
- `PeerRankingStage`: Anonymized peer review
- `SynthesisStage`: Final synthesis
- `SimpleQueryStage`: Single LLM query

**✅ Template Engine**
- Liquid template support for dynamic prompts
- Template validation
- Context injection

---

## 4. Error Handling

### Current Implementation

**✅ Typed Errors**
- All domain errors extend `Data.TaggedError`
- Error types: `ValidationError`, `AuthenticationError`, `AuthorizationError`, `ConversationNotFoundError`, `StorageError`, `OpenRouterError`, `RateLimitError`, `TimeoutError`

**✅ Error Propagation**
- All application code uses Effect error channel (no try/catch)
- Errors propagate through Effect chains
- HTTP boundary maps errors to appropriate status codes

**✅ Error Mapping**
- Comprehensive `mapErrorToHttp` function
- Detailed error messages for client errors (400, 401, 403, 404)
- Generic messages for server errors (500, 502, 504)
- Schema validation errors include field paths

---

## 5. Observability

### Current Implementation

**✅ Structured Logging**
- JSON-formatted logs with timestamps, levels, messages, context
- Correlation IDs for request tracking
- Context-aware logging (user ID, conversation ID, etc.)

**✅ Metrics**
- HTTP request metrics (count, duration, status codes)
- LLM request metrics (count, duration, model)
- Workflow execution metrics (count, duration, stage-level)
- Storage operation metrics (count, duration)
- Rate limit metrics (hits, checks)

**✅ Distributed Tracing**
- Span creation for major operations
- Span events for important milestones
- Correlation IDs propagated across services

**✅ Correlation IDs**
- Automatically generated or extracted from `X-Correlation-ID` header
- Propagated through Effect Context
- Included in all log entries and traces

---

## 6. Security

### Current Implementation

**✅ Authentication**
- Bearer token support (`Authorization: Bearer <token>`)
- API key support (`Authorization: ApiKey <key>`)
- Token validation (basic implementation - can be extended for JWT/OAuth)

**✅ Authorization**
- Resource-based authorization (conversation ownership)
- User-scoped data access (conversations filtered by user ID)
- Authorization checks before resource access

**✅ Input Validation**
- All route parameters validated with Effect Schema
- Request bodies validated with Effect Schema
- Length constraints prevent DoS attacks
- Type validation prevents injection attacks

**✅ Rate Limiting**
- Token bucket algorithm with sliding window
- User-based rate limiting (when authenticated)
- IP-based rate limiting (fallback for unauthenticated)
- Separate limits for API endpoints and workflow executions
- Configurable via environment variables

**✅ Resource Management**
- Request timeouts (configurable, default 5 minutes for workflows)
- Request body size limits (configurable, default 10 MB)
- Connection pooling handled by Node.js HTTP server
- Keep-alive timeout configuration

---

## 7. Testing

### Current Implementation

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

**⚠️ Test Coverage**
- Unit tests for core logic (council, storage, workflow executor)
- Integration tests for workflows
- HTTP endpoint tests need update for Effect Platform (TODO in `main.test.ts`)

---

## 8. Remaining Issues & Recommendations

### High Priority

1. **Update HTTP Tests** (`main.test.ts:22`)
   - Tests still reference old Hono patterns
   - Need to update for Effect Platform HTTP test utilities
   - Current tests marked with TODO

### Medium Priority

1. **JWT/OAuth Integration**
   - Current authentication is basic (token validation)
   - Consider JWT validation for production
   - OAuth integration for third-party auth

2. **Database Migration**
   - Currently file-based JSON storage
   - Consider PostgreSQL/MySQL for production scale
   - Migration path for existing conversations

3. **Background Jobs**
   - Currently all operations synchronous
   - Consider queue system for long-running workflows
   - Background job processing for title generation

4. **Caching**
   - No caching layer currently
   - Consider Redis for workflow definitions, conversation metadata
   - Cache invalidation strategy

### Low Priority

1. **API Documentation**
   - OpenAPI/Swagger documentation
   - API versioning strategy (currently unversioned)
   - Rate limit documentation

2. **Monitoring & Alerting**
   - Integration with monitoring services (Datadog, New Relic, etc.)
   - Alert rules for error rates, latency
   - Dashboard for metrics visualization

3. **Performance Optimization**
   - Connection pooling configuration tuning
   - Request timeout optimization
   - LLM query batching

---

## 9. Code Quality Metrics

### Strengths

- ✅ **Type Safety**: Full TypeScript with strict mode, no `any` types
- ✅ **Error Handling**: All errors typed and handled via Effect
- ✅ **Testability**: Dependency injection enables easy mocking
- ✅ **Maintainability**: Clear separation of concerns, centralized configuration
- ✅ **Security**: Authentication, authorization, input validation, rate limiting
- ✅ **Observability**: Comprehensive logging, metrics, tracing

### Areas for Improvement

- ⚠️ **Test Coverage**: HTTP endpoint tests need update
- ⚠️ **Documentation**: API documentation could be improved
- ⚠️ **Performance**: No caching, all operations synchronous

---

## 10. Conclusion

The backend has undergone a **comprehensive refactoring** and is now **production-ready** with:

✅ **Effect-Native Architecture**: Complete migration to Effect Platform HTTP  
✅ **Comprehensive Security**: Authentication, authorization, rate limiting, input validation  
✅ **Full Observability**: Structured logging, metrics, distributed tracing  
✅ **Type Safety**: Full TypeScript with Effect error handling  
✅ **Testability**: Separate production/test runtimes with mock services  
✅ **Resource Management**: Timeouts, size limits, connection pooling  

**Remaining Work**:
- Update HTTP endpoint tests for Effect Platform
- Consider database migration for production scale
- Add API documentation
- Consider background job system for long-running operations

**Overall Assessment**: ✅ **Excellent** - The backend demonstrates strong architectural patterns, comprehensive error handling, and production-ready features. The migration to Effect Platform has eliminated framework boundaries and created a fully type-safe, composable system.

---

**Next Steps**:
1. Update HTTP endpoint tests
2. Add API documentation
3. Consider database migration strategy
4. Plan for background job system

