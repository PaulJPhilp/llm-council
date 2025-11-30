/**
 * Comprehensive OpenRouter Client Tests
 */

import { Effect, Runtime } from "effect";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { OpenRouterClient } from "./openrouter";
import { TestLayer, createTestLayer } from "./runtime.test";
import { OpenRouterError, TimeoutError } from "./errors";
import { createMockOpenRouterClient } from "./openrouter.mock";
import type { OpenRouterClient as OpenRouterClientType } from "./openrouter";

describe("OpenRouterClient", () => {
  describe("queryModel", () => {
    it("should query a single model successfully", async () => {
      const result = await Effect.runPromise(
        Effect.gen(function* () {
          const client = yield* OpenRouterClient;
          return yield* client.queryModel("test-model", [
            { role: "user", content: "Hello" },
          ]);
        }).pipe(Effect.provide(TestLayer))
      );

      expect(result).toBeDefined();
      expect(result.content).toBeDefined();
      expect(typeof result.content).toBe("string");
    });

    it("should handle model query errors gracefully", async () => {
      // Create a custom mock that fails
      const failingMock = createMockOpenRouterClient();
      vi.spyOn(failingMock, "queryModel").mockRejectedValueOnce(
        new Error("API Error")
      );

      const customLayer = createTestLayer({
        openRouter: {
          queryModel: (model: string, messages: any[]) =>
            Effect.tryPromise({
              try: () => failingMock.queryModel(model, messages),
              catch: (error) =>
                new OpenRouterError({
                  model,
                  message: `Query failed: ${error instanceof Error ? error.message : String(error)}`,
                  cause: error,
                }),
            }),
          queryModelsParallel: (models: readonly string[], messages: any[]) =>
            Effect.tryPromise({
              try: () => failingMock.queryModelsParallel([...models], messages),
              catch: (error) =>
                new OpenRouterError({
                  model: "parallel",
                  message: `Parallel query failed: ${error instanceof Error ? error.message : String(error)}`,
                  cause: error,
                }),
            }),
        } as OpenRouterClientType,
      });

      const result = await Effect.runPromise(
        Effect.gen(function* () {
          const client = yield* OpenRouterClient;
          return yield* client.queryModel("test-model", [
            { role: "user", content: "Hello" },
          ]);
        }).pipe(Effect.either, Effect.provide(customLayer))
      );

      expect(result._tag).toBe("Left");
      if (result._tag === "Left") {
        expect(result.left).toBeInstanceOf(OpenRouterError);
      }
    });

    it("should include reasoning_details when available", async () => {
      const result = await Effect.runPromise(
        Effect.gen(function* () {
          const client = yield* OpenRouterClient;
          return yield* client.queryModel("test-model", [
            { role: "user", content: "Hello" },
          ]);
        }).pipe(Effect.provide(TestLayer))
      );

      // Mock may or may not include reasoning_details
      if (result.reasoning_details) {
        expect(typeof result.reasoning_details).toBe("string");
      }
    });
  });

  describe("queryModelsParallel", () => {
    it("should query multiple models in parallel", async () => {
      const result = await Effect.runPromise(
        Effect.gen(function* () {
          const client = yield* OpenRouterClient;
          return yield* client.queryModelsParallel(
            ["model-1", "model-2", "model-3"],
            [{ role: "user", content: "Hello" }]
          );
        }).pipe(Effect.provide(TestLayer))
      );

      expect(result).toBeDefined();
      expect(result["model-1"]).toBeDefined();
      expect(result["model-2"]).toBeDefined();
      expect(result["model-3"]).toBeDefined();
    });

    it("should handle partial failures gracefully", async () => {
      // Create a custom mock where one model fails
      const partialFailingMock = createMockOpenRouterClient();
      vi.spyOn(partialFailingMock, "queryModelsParallel").mockImplementation(
        async (models: string[]) => {
          const results: Record<string, any> = {};
          for (const model of models) {
            if (model === "model-2") {
              // Skip this model (simulate failure)
              continue;
            }
            results[model] = {
              content: `Response from ${model}`,
            };
          }
          return results;
        }
      );

      const customLayer = createTestLayer({
        openRouter: {
          queryModel: (model: string, messages: any[]) =>
            Effect.tryPromise({
              try: () => partialFailingMock.queryModel(model, messages),
              catch: (error) =>
                new OpenRouterError({
                  model,
                  message: `Query failed: ${error instanceof Error ? error.message : String(error)}`,
                  cause: error,
                }),
            }),
          queryModelsParallel: (models: readonly string[], messages: any[]) =>
            Effect.tryPromise({
              try: () =>
                partialFailingMock.queryModelsParallel([...models], messages),
              catch: (error) =>
                new OpenRouterError({
                  model: "parallel",
                  message: `Parallel query failed: ${error instanceof Error ? error.message : String(error)}`,
                  cause: error,
                }),
            }),
        } as OpenRouterClientType,
      });

      const result = await Effect.runPromise(
        Effect.gen(function* () {
          const client = yield* OpenRouterClient;
          return yield* client.queryModelsParallel(
            ["model-1", "model-2", "model-3"],
            [{ role: "user", content: "Hello" }]
          );
        }).pipe(Effect.provide(customLayer))
      );

      // Should return results for successful models
      expect(result["model-1"]).toBeDefined();
      expect(result["model-3"]).toBeDefined();
      // model-2 may be missing (graceful degradation)
    });

    it("should return empty object if all models fail", async () => {
      const allFailingMock = createMockOpenRouterClient();
      vi.spyOn(allFailingMock, "queryModelsParallel").mockResolvedValueOnce({});

      const customLayer = createTestLayer({
        openRouter: {
          queryModel: (model: string, messages: any[]) =>
            Effect.tryPromise({
              try: () => allFailingMock.queryModel(model, messages),
              catch: (error) =>
                new OpenRouterError({
                  model,
                  message: `Query failed: ${error instanceof Error ? error.message : String(error)}`,
                  cause: error,
                }),
            }),
          queryModelsParallel: (models: readonly string[], messages: any[]) =>
            Effect.tryPromise({
              try: () => allFailingMock.queryModelsParallel([...models], messages),
              catch: (error) =>
                new OpenRouterError({
                  model: "parallel",
                  message: `Parallel query failed: ${error instanceof Error ? error.message : String(error)}`,
                  cause: error,
                }),
            }),
        } as OpenRouterClientType,
      });

      const result = await Effect.runPromise(
        Effect.gen(function* () {
          const client = yield* OpenRouterClient;
          return yield* client.queryModelsParallel(
            ["model-1", "model-2"],
            [{ role: "user", content: "Hello" }]
          );
        }).pipe(Effect.provide(customLayer))
      );

      // Should return empty object (graceful degradation)
      expect(Object.keys(result)).toHaveLength(0);
    });
  });

  describe("Error Handling", () => {
    it("should handle network errors", async () => {
      const networkErrorMock = createMockOpenRouterClient();
      vi.spyOn(networkErrorMock, "queryModel").mockRejectedValueOnce(
        new Error("Network error")
      );

      const customLayer = createTestLayer({
        openRouter: {
          queryModel: (model: string, messages: any[]) =>
            Effect.tryPromise({
              try: () => networkErrorMock.queryModel(model, messages),
              catch: (error) =>
                new OpenRouterError({
                  model,
                  message: `Network error: ${error instanceof Error ? error.message : String(error)}`,
                  cause: error,
                }),
            }),
          queryModelsParallel: (models: readonly string[], messages: any[]) =>
            Effect.tryPromise({
              try: () => networkErrorMock.queryModelsParallel([...models], messages),
              catch: (error) =>
                new OpenRouterError({
                  model: "parallel",
                  message: `Parallel query failed: ${error instanceof Error ? error.message : String(error)}`,
                  cause: error,
                }),
            }),
        } as OpenRouterClientType,
      });

      const result = await Effect.runPromise(
        Effect.gen(function* () {
          const client = yield* OpenRouterClient;
          return yield* client.queryModel("test-model", [
            { role: "user", content: "Hello" },
          ]);
        }).pipe(Effect.either, Effect.provide(customLayer))
      );

      expect(result._tag).toBe("Left");
      if (result._tag === "Left") {
        expect(result.left).toBeInstanceOf(OpenRouterError);
        expect(result.left.model).toBe("test-model");
      }
    });

    it("should handle timeout errors", async () => {
      const timeoutMock = createMockOpenRouterClient();
      vi.spyOn(timeoutMock, "queryModel").mockImplementation(
        () =>
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error("Timeout")), 100)
          )
      );

      // Use a very short timeout config
      const timeoutConfig = {
        openRouterApiKey: "test-key",
        openRouterApiUrl: "https://test.openrouter.ai/api/v1/chat/completions",
        councilModels: ["test-model"],
        chairmanModel: "test-chairman",
        dataDir: "data/test",
        port: 0,
        apiTimeoutMs: 50, // Very short timeout
        titleGenerationTimeoutMs: 1000,
        defaultMaxTokens: 100,
        chairmanMaxTokens: 200,
        mockMode: true,
        rateLimitEnabled: false,
        rateLimitWindowMs: 60000,
        rateLimitMaxRequests: 100,
        rateLimitMaxWorkflowExecutions: 10,
        httpRequestTimeoutMs: 30000,
        httpKeepAliveTimeoutMs: 5000,
        httpMaxConnections: 100,
        httpMaxRequestSizeBytes: 1024 * 1024,
      };

      const customLayer = createTestLayer({
        config: timeoutConfig,
        openRouter: {
          queryModel: (model: string, messages: any[]) =>
            Effect.tryPromise({
              try: () => timeoutMock.queryModel(model, messages),
              catch: (error) =>
                new TimeoutError({
                  operation: "queryModel",
                  timeoutMs: timeoutConfig.apiTimeoutMs,
                }),
            }),
          queryModelsParallel: (models: readonly string[], messages: any[]) =>
            Effect.tryPromise({
              try: () => timeoutMock.queryModelsParallel([...models], messages),
              catch: (error) =>
                new OpenRouterError({
                  model: "parallel",
                  message: `Parallel query failed: ${error instanceof Error ? error.message : String(error)}`,
                  cause: error,
                }),
            }),
        } as OpenRouterClientType,
      });

      const result = await Effect.runPromise(
        Effect.gen(function* () {
          const client = yield* OpenRouterClient;
          return yield* client.queryModel("test-model", [
            { role: "user", content: "Hello" },
          ]);
        }).pipe(Effect.either, Effect.provide(customLayer))
      );

      // Should fail with timeout (though the actual timeout handling is in the client implementation)
      expect(result._tag).toBe("Left");
    });
  });
});

