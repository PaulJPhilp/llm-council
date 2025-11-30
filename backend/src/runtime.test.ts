/**
 * Test Runtime Configuration
 * Provides test runtime with mock services for fast, deterministic tests
 */

import { Effect, Layer, Runtime } from "effect";
import { AuthService } from "./auth";
import { AppConfig } from "./config";
import { ObservabilityServiceLive, logInfo } from "./observability";
import { OpenRouterClient, type ChatMessage } from "./openrouter";
import { createMockOpenRouterClient } from "./openrouter.mock";
import { RateLimitServiceLive } from "./rate-limit";
import { StorageService } from "./storage";

/**
 * Test configuration - uses mock mode and test data directory
 */
// Test configuration object - matches the return type of AppConfig service's effect
const testConfig = {
  openRouterApiKey: "test-key",
  openRouterApiUrl: "https://test.openrouter.ai/api/v1/chat/completions",
  councilModels: ["test-model-1", "test-model-2"],
  chairmanModel: "test-chairman",
  dataDir: "data/test-conversations",
  port: 0, // Not used in tests
  apiTimeoutMs: 5000, // Shorter timeout for tests
  titleGenerationTimeoutMs: 1000,
  defaultMaxTokens: 100,
  chairmanMaxTokens: 200,
  mockMode: true, // Enable mock mode for tests
  rateLimitEnabled: false, // Disable rate limiting in tests
  rateLimitWindowMs: 60000,
  rateLimitMaxRequests: 100,
  rateLimitMaxWorkflowExecutions: 10,
  httpRequestTimeoutMs: 30000,
  httpKeepAliveTimeoutMs: 5000,
  httpMaxConnections: 100,
  httpMaxRequestSizeBytes: 1024 * 1024, // 1 MB for tests
} as const;

/**
 * Test config layer - provides test configuration directly
 * Uses Layer.succeed with the service tag to provide the config value
 */
const TestConfigLayer = Layer.succeed(AppConfig, testConfig);

/**
 * Test observability layer - uses live observability (logging/metrics still work in tests)
 * Note: Histogram metrics are skipped in mock mode to avoid boundary issues
 * Effect.withSpan requires Tracer service, which is provided by default Effect runtime
 * Logger is also provided by default Effect runtime
 * Requires TestConfigLayer because ObservabilityService uses AppConfig
 */
const TestObservabilityLayer = ObservabilityServiceLive.pipe(
  Layer.provide(TestConfigLayer)
);

/**
 * Test storage layer - uses test data directory
 * Requires TestConfigLayer (StorageService uses AppConfig)
 * Also requires TestObservabilityLayer (StorageService methods use withSpan/logError)
 */
const TestStorageLayer = StorageService.Default.pipe(
  Layer.provide(Layer.mergeAll(TestConfigLayer, TestObservabilityLayer))
);

/**
 * Test OpenRouter layer - uses mock client
 * Creates a mock OpenRouterClient service that wraps the mock client
 * Requires TestConfigLayer and TestObservabilityLayer for logInfo
 */
const TestOpenRouterLayer = Layer.effect(
  OpenRouterClient,
  // @ts-expect-error - Layer.effect expects service class type, but we're providing service value type
  // The service value type (plain object) is correct, but TypeScript confuses it with the service class type
  Effect.gen(function* () {
    const mockClient = createMockOpenRouterClient();

    const queryModel = (
      model: string,
      messages: ChatMessage[],
      maxTokens?: number
    ) =>
      Effect.gen(function* () {
        yield* logInfo("Mock LLM query starting", { model });
        const response = yield* Effect.tryPromise({
          try: () => mockClient.queryModel(model, messages),
          catch: (error) => error,
        });
        yield* logInfo("Mock LLM query completed", { model });
        return response;
      });

    const queryModelsParallel = (
      models: readonly string[],
      messages: ChatMessage[]
    ) =>
      Effect.gen(function* () {
        yield* logInfo("Mock parallel LLM queries starting", {
          modelCount: models.length,
        });
        const responses = yield* Effect.tryPromise({
          try: () => mockClient.queryModelsParallel([...models], messages),
          catch: (error) => error,
        });
        yield* logInfo("Mock parallel LLM queries completed", {
          modelCount: models.length,
        });
        return responses;
      });

    return {
      queryModel,
      queryModelsParallel,
    };
  })
).pipe(Layer.provide(Layer.mergeAll(TestConfigLayer, TestObservabilityLayer)));

/**
 * Test auth layer - uses default auth service with test config provided
 */
const TestAuthLayer = AuthService.Default.pipe(Layer.provide(TestConfigLayer));

/**
 * Test rate limit layer - uses live service but disabled via config
 */
const TestRateLimitLayer = RateLimitServiceLive.pipe(
  Layer.provide(TestConfigLayer)
);

/**
 * Complete test runtime layer
 * Combines all test services with mocks where appropriate
 * Exported for use in tests that need to provide the layer directly
 */
export const TestLayer = Layer.mergeAll(
  TestConfigLayer,
  TestStorageLayer,
  TestOpenRouterLayer,
  TestAuthLayer,
  TestObservabilityLayer,
  TestRateLimitLayer
);

/**
 * Test runtime - use for running test effects
 * Example: Runtime.runPromise(TestRuntime)(effect)
 *
 * Note: Runtime.make creates a runtime with the provided layer.
 * Effect's default services (Tracer, Logger, etc.) should be automatically available,
 * but there seems to be an issue with runtime initialization causing "locals" errors.
 *
 * TODO: Investigate why Runtime.make doesn't properly initialize Effect's default services.
 * This might be a bug in Effect 3.8.0 or require a different runtime setup approach.
 */
export const TestRuntime = Runtime.make(TestLayer);

/**
 * Create a custom test layer with specific overrides
 * Useful for tests that need specific mock behavior
 *
 * @example
 * ```typescript
 * const customLayer = createTestLayer({
 *   openRouter: customMockOpenRouter,
 *   storage: customMockStorage
 * });
 * const customRuntime = Runtime.make(customLayer);
 * ```
 */
export interface TestLayerOverrides {
  openRouter?: OpenRouterClient;
  storage?: StorageService;
  auth?: AuthService;
  config?: AppConfig;
}

export function createTestLayer(overrides: TestLayerOverrides = {}) {
  return Layer.mergeAll(
    overrides.config
      ? Layer.succeed(AppConfig, overrides.config)
      : TestConfigLayer,
    overrides.storage
      ? Layer.succeed(StorageService, overrides.storage)
      : TestStorageLayer,
    overrides.openRouter
      ? Layer.succeed(OpenRouterClient, overrides.openRouter)
      : TestOpenRouterLayer,
    overrides.auth ? Layer.succeed(AuthService, overrides.auth) : TestAuthLayer,
    TestObservabilityLayer,
    TestRateLimitLayer
  );
}
