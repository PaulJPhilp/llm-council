# Effect Runtime Patterns

This document explains the two-runtime pattern used in this codebase for managing Effect dependencies.

## Overview

We maintain **two separate Effect runtimes**:

1. **Production Runtime** (`runtime.ts`) - For production application code
2. **Test Runtime** (`runtime.test.ts`) - For tests with mock services

This separation ensures:
- **Production code** uses real services (OpenRouter API, file storage, etc.)
- **Tests** use mock services for speed, determinism, and isolation
- **No hardcoded layers** scattered throughout the codebase
- **Centralized dependency management**

## Production Runtime

**Location**: `backend/src/runtime.ts`

**Usage**: Use for all production application code that needs to run Effects with real services.

```typescript
import { ProductionRuntime } from "./runtime";
import { Runtime } from "effect";

// Instead of:
// Effect.runPromise(effect.pipe(Effect.provide(Layer.mergeAll(...))))

// Use:
Runtime.runPromise(ProductionRuntime)(effect)
```

**Services Provided**:
- `AppConfig` - Real configuration from environment variables
- `StorageService` - Real file-based storage
- `OpenRouterClient` - Real OpenRouter API client
- `AuthService` - Real authentication service
- `ObservabilityService` - Real logging, metrics, tracing
- `RateLimitService` - Real rate limiting service

## Test Runtime

**Location**: `backend/src/runtime.test.ts`

**Usage**: Use for all tests that need to run Effects with mock services.

```typescript
import { TestRuntime } from "./runtime.test";
import { Runtime } from "effect";

// Instead of:
// Effect.runPromise(effect.pipe(Effect.provide(Layer.mergeAll(...))))

// Use:
Runtime.runPromise(TestRuntime)(effect)
```

**Services Provided**:
- `AppConfig` - Test configuration (mock mode enabled, test data directory)
- `StorageService` - Real storage but with test data directory
- `OpenRouterClient` - **Mock client** (no real API calls)
- `AuthService` - Real auth service (can be overridden per test)
- `ObservabilityService` - Real observability (logging still works in tests)
- `RateLimitService` - Real service but disabled via config

## When to Use Each Runtime

### Use Production Runtime When:
- ✅ Running production application code
- ✅ Code that needs real services (API calls, file I/O)
- ✅ Integration with external systems
- ✅ Any code that executes in production

**Example**:
```typescript
// backend/src/workflow/workflows/council-integration.ts
import { ProductionRuntime } from "../../runtime";

export const executeCouncilWorkflow = (query: string) => {
  return Runtime.runPromise(ProductionRuntime)(
    Effect.gen(function* () {
      const openRouter = yield* OpenRouterClient; // Real API
      const storage = yield* StorageService; // Real storage
      // ... workflow execution
    })
  );
};
```

### Use Test Runtime When:
- ✅ Running unit tests
- ✅ Running integration tests
- ✅ Any test that needs Effect services
- ✅ Tests that should be fast and deterministic

**Example**:
```typescript
// backend/src/workflow/workflows/llm-council.test.ts
import { TestRuntime } from "../../runtime.test";

it("should execute workflow", async () => {
  const result = await Runtime.runPromise(TestRuntime)(
    executeWorkflow(workflow, "test query", services)
  );
  expect(result).toBeDefined();
});
```

### Don't Need Runtime When:
- ❌ Tests that pass mock services directly as parameters
- ❌ Pure functions that don't use Effect services
- ❌ Code that already has services provided via parameters

**Example** (no runtime needed):
```typescript
// This test passes mock services directly - no runtime needed
it("should execute stage", async () => {
  const mockServices = { openRouter: mockClient, ... };
  const result = await Effect.runPromise(
    stage.execute(context, mockServices) // Services passed directly
  );
});
```

## Custom Test Layers

For tests that need specific mock behavior, use `createTestLayer`:

```typescript
import { createTestLayer, TestRuntime } from "./runtime.test";
import { Runtime } from "effect";

// Create custom layer with specific mocks
const customLayer = createTestLayer({
  openRouter: customMockOpenRouter,
  storage: customMockStorage,
});

const customRuntime = Runtime.make(customLayer);

// Use in test
const result = await Runtime.runPromise(customRuntime)(effect);
```

## Migration Guide

### Before (Hardcoded Layers):
```typescript
const layer = Layer.mergeAll(
  AppConfig.Default,
  StorageService.Default,
  OpenRouterClient.Default
);

return Effect.runPromise(
  effect.pipe(Effect.provide(layer))
);
```

### After (Centralized Runtime):
```typescript
import { ProductionRuntime } from "./runtime";

return Runtime.runPromise(ProductionRuntime)(effect);
```

## Benefits

1. **Centralized Configuration**: All service dependencies in one place
2. **Easy Testing**: Switch to test runtime with mocks automatically
3. **No Hardcoded Layers**: Eliminates scattered layer definitions
4. **Type Safety**: Runtime ensures all required services are provided
5. **Consistency**: Same pattern used throughout codebase

## Anti-Patterns

❌ **Don't** create ad-hoc layers in application code:
```typescript
// BAD
const myLayer = Layer.mergeAll(AppConfig.Default, ...);
Effect.runPromise(effect.pipe(Effect.provide(myLayer)));
```

✅ **Do** use the centralized runtime:
```typescript
// GOOD
Runtime.runPromise(ProductionRuntime)(effect);
```

❌ **Don't** use production runtime in tests:
```typescript
// BAD - will make real API calls!
Runtime.runPromise(ProductionRuntime)(testEffect);
```

✅ **Do** use test runtime in tests:
```typescript
// GOOD - uses mocks
Runtime.runPromise(TestRuntime)(testEffect);
```

