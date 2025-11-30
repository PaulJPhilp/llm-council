/**
 * Comprehensive Authentication & Authorization Tests
 */

import * as Http from "@effect/platform/HttpServer";
import { Effect } from "effect";
import { describe, expect, it } from "vitest";
import { AuthService } from "./auth";
import { TestLayer } from "./runtime.test";
import { AuthenticationError, AuthorizationError } from "./auth";

// Helper to convert native Request to HttpRequest
const createHttpRequest = (request: Request) => {
  // Http.request.fromWeb returns an Effect, so we need to run it
  return Effect.runSync(
    Effect.gen(function* () {
      return yield* Http.request.fromWeb(request);
    })
  );
};

describe("AuthService", () => {
  describe("extractUserFromRequest", () => {
    it("should extract user from Bearer token", async () => {
      const nativeRequest = new Request("http://localhost:8001/api/conversations", {
        method: "GET",
        headers: {
          Authorization: "Bearer test-token-123",
        },
      });

      const request = createHttpRequest(nativeRequest);
      
      const result = await Effect.runPromise(
        Effect.gen(function* () {
          const auth = yield* AuthService;
          return yield* auth.extractUserFromRequest(request);
        }).pipe(Effect.provide(TestLayer))
      );

      expect(result.userId).toBeDefined();
      expect(result.userId.length).toBeGreaterThan(0);
    });

    it("should extract user from ApiKey token", async () => {
      const nativeRequest = new Request("http://localhost:8001/api/conversations", {
        method: "GET",
        headers: {
          Authorization: "ApiKey test-api-key-456",
        },
      });

      const request = createHttpRequest(nativeRequest);
      
      const result = await Effect.runPromise(
        Effect.gen(function* () {
          const auth = yield* AuthService;
          return yield* auth.extractUserFromRequest(request);
        }).pipe(Effect.provide(TestLayer))
      );

      expect(result.userId).toBeDefined();
    });

    it("should fail with missing Authorization header", async () => {
      const nativeRequest = new Request("http://localhost:8001/api/conversations", {
        method: "GET",
      });

      const request = createHttpRequest(nativeRequest);

      const result = await Effect.runPromise(
        Effect.gen(function* () {
          const auth = yield* AuthService;
          return yield* auth.extractUserFromRequest(request);
        }).pipe(Effect.either, Effect.provide(TestLayer))
      );

      expect(result._tag).toBe("Left");
      if (result._tag === "Left") {
        expect(result.left).toBeInstanceOf(AuthenticationError);
        expect(result.left.code).toBe("missing_token");
      }
    });

    it("should fail with invalid Authorization header format", async () => {
      const nativeRequest = new Request("http://localhost:8001/api/conversations", {
        method: "GET",
        headers: {
          Authorization: "InvalidFormat",
        },
      });

      const request = createHttpRequest(nativeRequest);

      const result = await Effect.runPromise(
        Effect.gen(function* () {
          const auth = yield* AuthService;
          return yield* auth.extractUserFromRequest(request);
        }).pipe(Effect.either, Effect.provide(TestLayer))
      );

      expect(result._tag).toBe("Left");
      if (result._tag === "Left") {
        expect(result.left).toBeInstanceOf(AuthenticationError);
        expect(result.left.code).toBe("invalid_token");
      }
    });

    it("should fail with empty token", async () => {
      const nativeRequest = new Request("http://localhost:8001/api/conversations", {
        method: "GET",
        headers: {
          Authorization: "Bearer ",
        },
      });

      const request = createHttpRequest(nativeRequest);

      const result = await Effect.runPromise(
        Effect.gen(function* () {
          const auth = yield* AuthService;
          return yield* auth.extractUserFromRequest(request);
        }).pipe(Effect.either, Effect.provide(TestLayer))
      );

      expect(result._tag).toBe("Left");
      if (result._tag === "Left") {
        expect(result.left).toBeInstanceOf(AuthenticationError);
        expect(result.left.code).toBe("invalid_token");
      }
    });

    it("should fail with unsupported authentication scheme", async () => {
      const nativeRequest = new Request("http://localhost:8001/api/conversations", {
        method: "GET",
        headers: {
          Authorization: "Basic dXNlcjpwYXNz",
        },
      });

      const request = createHttpRequest(nativeRequest);

      const result = await Effect.runPromise(
        Effect.gen(function* () {
          const auth = yield* AuthService;
          return yield* auth.extractUserFromRequest(request);
        }).pipe(Effect.either, Effect.provide(TestLayer))
      );

      expect(result._tag).toBe("Left");
      if (result._tag === "Left") {
        expect(result.left).toBeInstanceOf(AuthenticationError);
        expect(result.left.code).toBe("invalid_token");
      }
    });
  });

  describe("authorizeResource", () => {
    it("should allow access when user owns the resource", async () => {
      const result = await Effect.runPromise(
        Effect.gen(function* () {
          const auth = yield* AuthService;
          return yield* auth.authorizeResource(
            "user-123",
            "conversation",
            "conv-456",
            "user-123" // Same user owns the resource
          );
        }).pipe(Effect.either, Effect.provide(TestLayer))
      );

      expect(result._tag).toBe("Right");
    });

    it("should deny access when user does not own the resource", async () => {
      const result = await Effect.runPromise(
        Effect.gen(function* () {
          const auth = yield* AuthService;
          return yield* auth.authorizeResource(
            "user-123",
            "conversation",
            "conv-456",
            "user-789" // Different user owns the resource
          );
        }).pipe(Effect.either, Effect.provide(TestLayer))
      );

      expect(result._tag).toBe("Left");
      if (result._tag === "Left") {
        expect(result.left).toBeInstanceOf(AuthorizationError);
        expect(result.left.resource).toBe("conversation");
        expect(result.left.resourceId).toBe("conv-456");
      }
    });

    it("should include resource details in error message", async () => {
      const result = await Effect.runPromise(
        Effect.gen(function* () {
          const auth = yield* AuthService;
          return yield* auth.authorizeResource(
            "user-123",
            "conversation",
            "conv-456",
            "user-789"
          );
        }).pipe(Effect.either, Effect.provide(TestLayer))
      );

      if (result._tag === "Left") {
        expect(result.left.message).toContain("user-123");
        expect(result.left.message).toContain("conversation");
        expect(result.left.message).toContain("conv-456");
      }
    });
  });
});

