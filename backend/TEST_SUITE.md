# Comprehensive Test Suite Documentation

## Overview

The backend includes a comprehensive test suite covering all services, HTTP endpoints, and integration scenarios. All tests use Effect's `TestRuntime` for consistent dependency injection and mock services.

## Test Structure

### Unit Tests

**`storage.test.ts`** - Storage Service Tests
- ✅ Conversation CRUD operations
- ✅ User isolation and filtering
- ✅ Message management (user and assistant)
- ✅ Title updates
- ✅ Error handling (file system errors, invalid JSON)
- ✅ Complete conversation lifecycle
- ✅ Edge cases (concurrent operations, invalid data)

**`auth.test.ts`** - Authentication & Authorization Tests
- ✅ Bearer token extraction
- ✅ API key extraction
- ✅ Missing/invalid Authorization headers
- ✅ Resource authorization (ownership checks)
- ✅ Error message details

**`rate-limit.test.ts`** - Rate Limiting Tests
- ✅ Request counting and limits
- ✅ Separate limits for API vs workflows
- ✅ Identifier isolation (user/IP tracking)
- ✅ Window expiration and cleanup
- ✅ Disabled rate limiting mode
- ✅ Error details (retryAfter, limits)

**`openrouter.test.ts`** - OpenRouter Client Tests
- ✅ Single model queries
- ✅ Parallel model queries
- ✅ Graceful degradation (partial failures)
- ✅ Network error handling
- ✅ Timeout handling
- ✅ Reasoning details support

**`observability.test.ts`** - Observability Service Tests
- ✅ Correlation ID creation and propagation
- ✅ Structured logging (info, error)
- ✅ Metrics tracking (HTTP, LLM, workflow, storage)
- ✅ Distributed tracing (spans, events)
- ✅ Context propagation through effect chains

### Integration Tests

**`main.test.ts`** - HTTP Endpoint Tests
- ✅ Health check endpoint
- ✅ Conversation CRUD endpoints
- ✅ Workflow listing and retrieval
- ✅ Workflow execution endpoint validation
- ✅ Authentication failures (401)
- ✅ Authorization failures (403)
- ✅ Request validation errors (400)
- ✅ CORS headers and preflight
- ✅ Edge cases (long IDs, special characters, malformed headers)
- ✅ Rate limiting behavior

**`integration.test.ts`** - End-to-End Integration Tests
- ✅ Complete workflow execution flow
- ✅ Multi-user isolation
- ✅ Error recovery
- ✅ Concurrent request handling
- ✅ Request validation chain (size, auth, schema)
- ✅ Workflow execution with SSE streaming

### Workflow System Tests

**`workflow/core/executor.test.ts`** - Workflow Executor Tests
- ✅ Stage execution
- ✅ Dependency resolution
- ✅ Error handling
- ✅ Progress callbacks

**`workflow/stages/stages.test.ts`** - Workflow Stage Tests
- ✅ Parallel query stage
- ✅ Peer ranking stage
- ✅ Synthesis stage
- ✅ Stage output validation

**`workflow/core/template.test.ts`** - Template Engine Tests
- ✅ Liquid template rendering
- ✅ Variable substitution
- ✅ Error handling

**`workflow/workflows/llm-council.test.ts`** - LLM Council Workflow Tests
- ✅ Complete workflow execution
- ✅ Stage sequencing
- ✅ Progress events

## Test Patterns

### Using TestRuntime

All tests use `Runtime.runPromise(TestRuntime)` for consistent dependency injection:

```typescript
const result = await Runtime.runPromise(TestRuntime)(
  Effect.gen(function* () {
    const storage = yield* StorageService;
    return yield* storage.createConversation("test-id", "user-123");
  })
);
```

### Custom Test Layers

For tests needing specific mock behavior:

```typescript
import { createTestLayer } from "./runtime.test";

const customLayer = createTestLayer({
  openRouter: customMockClient,
  config: customConfig,
});

const customRuntime = Runtime.make(customLayer);
```

### HTTP Request Testing

Use the `testRequest` helper for HTTP endpoint tests:

```typescript
const testRequest = async (request: Request): Promise<Response> => {
  return Runtime.runPromise(Runtime.make(TestLayer))(
    Effect.gen(function* () {
      const httpRequest = Http.request.fromWeb(request);
      const response = yield* app.pipe(
        Effect.provideService(Http.request.HttpRequest, httpRequest)
      );
      return Http.response.toWeb(response);
    })
  );
};
```

## Test Coverage

### Services Covered
- ✅ StorageService (file-based persistence)
- ✅ AuthService (authentication & authorization)
- ✅ RateLimitService (rate limiting)
- ✅ OpenRouterClient (LLM API client)
- ✅ ObservabilityService (logging, metrics, tracing)

### HTTP Endpoints Covered
- ✅ `GET /` - Health check
- ✅ `GET /api/conversations` - List conversations
- ✅ `POST /api/conversations` - Create conversation
- ✅ `GET /api/conversations/:id` - Get conversation
- ✅ `GET /api/workflows` - List workflows
- ✅ `GET /api/workflows/:id` - Get workflow
- ✅ `POST /api/conversations/:id/execute/stream` - Execute workflow

### Error Scenarios Covered
- ✅ Authentication errors (401)
- ✅ Authorization errors (403)
- ✅ Validation errors (400)
- ✅ Not found errors (404)
- ✅ Rate limit errors (429)
- ✅ Storage errors (500)
- ✅ Network/timeout errors (502, 504)

### Edge Cases Covered
- ✅ Empty/invalid request bodies
- ✅ Missing headers
- ✅ Malformed Authorization headers
- ✅ Very long IDs (max length validation)
- ✅ Special characters in IDs
- ✅ Concurrent requests
- ✅ Partial failures (graceful degradation)

## Running Tests

```bash
cd backend

# Run all tests with watch mode
bun test

# Run all tests once (CI mode)
bun run test:run

# Run specific test file
bun test storage.test.ts

# Run with coverage
bun test --coverage

# Run with UI
bun x vitest --ui
```

## Test Data Isolation

- Each test file uses a separate test data directory
- Test directories are cleaned up before and after tests
- Tests use `TestRuntime` which provides mock services
- No real API calls are made (mock OpenRouter client)
- Rate limiting is disabled in test configuration

## Best Practices

1. **Always use TestRuntime**: Ensures consistent dependency injection
2. **Clean up test data**: Use `beforeAll` and `afterEach` to clean directories
3. **Test error paths**: Use `Effect.either` to test error scenarios
4. **Isolate tests**: Each test should be independent
5. **Use descriptive test names**: Clearly state what is being tested
6. **Test edge cases**: Include boundary conditions and error scenarios

## Future Enhancements

- [ ] Add performance/load tests
- [ ] Add contract tests for API compatibility
- [ ] Add chaos engineering tests (network failures, timeouts)
- [ ] Add security tests (SQL injection, XSS, etc.)
- [ ] Add accessibility tests for API responses
- [ ] Add contract tests for workflow definitions

