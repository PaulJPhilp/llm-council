/**
 * Comprehensive Observability Service Tests
 */

import { Effect } from "effect";
import { describe, expect, it } from "vitest";
import {
  CorrelationId,
  addSpanEvent,
  createCorrelationId,
  getCorrelationId,
  logError,
  logInfo,
  trackHttpRequest,
  trackLLMRequest,
  trackStorageOperation,
  trackWorkflowExecution,
  withCorrelationId,
  withSpan,
} from "./observability";
import { TestLayer } from "./runtime.test";

describe("ObservabilityService", () => {
  describe("Correlation ID", () => {
    it("should create a new correlation ID", () => {
      const id = createCorrelationId();
      expect(id.id).toBeDefined();
      expect(typeof id.id).toBe("string");
      expect(id.id.length).toBeGreaterThan(0);
    });

    it("should create unique correlation IDs", () => {
      const id1 = createCorrelationId();
      const id2 = createCorrelationId();
      expect(id1.id).not.toBe(id2.id);
    });

    it("should get correlation ID from context", async () => {
      const correlationId = createCorrelationId();

      const result = await Effect.runPromise(
        Effect.gen(function* () {
          return yield* getCorrelationId();
        }).pipe(
          Effect.provideService(CorrelationId, correlationId),
          Effect.provide(TestLayer)
        )
      );

      expect(result.id).toBe(correlationId.id);
    });

    it("should create new correlation ID if not in context", async () => {
      const result = await Effect.runPromise(
        Effect.gen(function* () {
          return yield* getCorrelationId();
        }).pipe(Effect.provide(TestLayer))
      );

      expect(result.id).toBeDefined();
    });

    it("should propagate correlation ID through effect chain", async () => {
      const correlationId = createCorrelationId();

      const result = await Effect.runPromise(
        withCorrelationId(
          Effect.gen(function* () {
            const id = yield* getCorrelationId();
            return id.id;
          }),
          correlationId
        ).pipe(Effect.provide(TestLayer))
      );

      expect(result).toBe(correlationId.id);
    });
  });

  describe("Logging", () => {
    it("should log info messages", async () => {
      const result = await Effect.runPromise(
        logInfo("Test message", { key: "value" }).pipe(
          Effect.either,
          Effect.provide(TestLayer)
        )
      );

      // Should succeed (logging doesn't fail)
      expect(result._tag).toBe("Right");
    });

    it("should log error messages", async () => {
      const error = new Error("Test error");
      const result = await Effect.runPromise(
        logError("Test error message", error, { context: "test" }).pipe(
          Effect.either,
          Effect.provide(TestLayer)
        )
      );

      // Should succeed (logging doesn't fail)
      expect(result._tag).toBe("Right");
    });

    it("should include metadata in logs", async () => {
      const result = await Effect.runPromise(
        logInfo("Test with metadata", {
          userId: "user-123",
          action: "test",
          timestamp: Date.now(),
        }).pipe(Effect.either, Effect.provide(TestLayer))
      );

      expect(result._tag).toBe("Right");
    });
  });

  describe("Metrics", () => {
    it("should track HTTP requests", async () => {
      const result = await Effect.runPromise(
        trackHttpRequest("GET", "/api/conversations", 200, 150).pipe(
          Effect.either,
          Effect.provide(TestLayer)
        )
      );

      expect(result._tag).toBe("Right");
    });

    it("should track LLM requests", async () => {
      const result = await Effect.runPromise(
        trackLLMRequest("test-model", 2000, false).pipe(
          Effect.either,
          Effect.provide(TestLayer)
        )
      );

      expect(result._tag).toBe("Right");
    });

    it("should track workflow executions", async () => {
      const result = await Effect.runPromise(
        trackWorkflowExecution("test-workflow", 5000, false).pipe(
          Effect.either,
          Effect.provide(TestLayer)
        )
      );

      expect(result._tag).toBe("Right");
    });

    it("should track storage operations", async () => {
      const result = await Effect.runPromise(
        trackStorageOperation("create", 50, false).pipe(
          Effect.either,
          Effect.provide(TestLayer)
        )
      );

      expect(result._tag).toBe("Right");
    });

    it("should track errors in metrics", async () => {
      const result = await Effect.runPromise(
        trackHttpRequest("GET", "/api/conversations", 500, 100).pipe(
          Effect.either,
          Effect.provide(TestLayer)
        )
      );

      expect(result._tag).toBe("Right");
    });
  });

  describe("Tracing", () => {
    it("should create spans", async () => {
      const result = await Effect.runPromise(
        withSpan(
          "test.operation",
          {
            "test.key": "value",
            "test.number": 42,
          },
          Effect.succeed("result")
        ).pipe(Effect.provide(TestLayer))
      );

      expect(result).toBe("result");
    });

    it("should add events to spans", async () => {
      const result = await Effect.runPromise(
        Effect.gen(function* () {
          yield* addSpanEvent("test.event", {
            "event.data": "value",
          });
          return "result";
        }).pipe(Effect.provide(TestLayer))
      );

      expect(result).toBe("result");
    });

    it("should propagate span context", async () => {
      const result = await Effect.runPromise(
        withSpan(
          "parent.operation",
          {},
          Effect.gen(function* () {
            // Nested span
            return yield* withSpan(
              "child.operation",
              {},
              Effect.succeed("nested result")
            );
          })
        ).pipe(Effect.provide(TestLayer))
      );

      expect(result).toBe("nested result");
    });
  });

  describe("Integration", () => {
    it("should maintain correlation ID through multiple operations", async () => {
      const correlationId = createCorrelationId();

      const result = await Effect.runPromise(
        withCorrelationId(
          Effect.gen(function* () {
            // Log with correlation ID
            yield* logInfo("Operation 1", { step: 1 });

            // Track metric with correlation ID
            yield* trackHttpRequest("GET", "/test", 200, 100);

            // Create span with correlation ID
            return yield* withSpan(
              "test.operation",
              {},
              Effect.gen(function* () {
                const id = yield* getCorrelationId();
                return id.id;
              })
            );
          }),
          correlationId
        ).pipe(Effect.provide(TestLayer))
      );

      expect(result).toBe(correlationId.id);
    });
  });
});
