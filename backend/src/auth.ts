import * as Http from "@effect/platform/HttpServer";
import { Data, Effect, Layer, Option } from "effect";
import { AppConfig } from "./config";

/**
 * Authentication errors
 */
export class AuthenticationError extends Data.TaggedError(
  "AuthenticationError"
)<{
  readonly message: string;
  readonly code: "missing_token" | "invalid_token" | "expired_token";
}> {}

export class AuthorizationError extends Data.TaggedError("AuthorizationError")<{
  readonly message: string;
  readonly resource: string;
  readonly resourceId: string;
}> {}

/**
 * User identity extracted from request
 */
export interface UserIdentity {
  readonly userId: string;
  readonly email?: string;
}

/**
 * Authentication service
 * Handles token validation and user identity extraction
 */
export class AuthService extends Effect.Service<AuthService>()("AuthService", {
  effect: Effect.gen(function* () {
    const config = yield* AppConfig;

    /**
     * Extract user identity from Authorization header
     * Supports:
     * - Bearer token: "Bearer <token>"
     * - API key: "ApiKey <key>"
     *
     * For now, uses simple API key validation. Can be extended to JWT/OAuth.
     */
    const extractUserFromRequest = (
      request: Http.request.HttpRequest
    ): Effect.Effect<UserIdentity, AuthenticationError> =>
      Effect.gen(function* () {
        const authHeaderOption = yield* Http.request.header(
          request,
          "Authorization"
        );
        const authHeader = Option.isSome(authHeaderOption)
          ? authHeaderOption.value
          : null;

        if (!authHeader) {
          return yield* Effect.fail(
            new AuthenticationError({
              message: "Missing Authorization header",
              code: "missing_token",
            })
          );
        }

        // Parse Bearer token or ApiKey
        const parts = authHeader.split(" ");
        if (parts.length !== 2) {
          return yield* Effect.fail(
            new AuthenticationError({
              message: "Invalid Authorization header format",
              code: "invalid_token",
            })
          );
        }

        const [scheme, token] = parts;

        // For development: accept any non-empty token
        // In production, validate against database or JWT
        if (scheme === "Bearer" || scheme === "ApiKey") {
          if (!token || token.length === 0) {
            return yield* Effect.fail(
              new AuthenticationError({
                message: "Empty token",
                code: "invalid_token",
              })
            );
          }

          // Simple validation: use token as userId for now
          // In production, decode JWT or lookup API key in database
          // For now, we'll use a simple hash or the token itself as userId
          const userId = token.length > 20 ? token.substring(0, 20) : token;

          return {
            userId,
            email: undefined, // Can be extracted from JWT in production
          };
        }

        return yield* Effect.fail(
          new AuthenticationError({
            message: `Unsupported authentication scheme: ${scheme}`,
            code: "invalid_token",
          })
        );
      });

    /**
     * Verify user has access to a resource
     * For conversations, checks ownership
     */
    const authorizeResource = (
      userId: string,
      resourceType: "conversation",
      resourceId: string,
      resourceOwnerId: string
    ): Effect.Effect<void, AuthorizationError> =>
      Effect.gen(function* () {
        if (userId !== resourceOwnerId) {
          return yield* Effect.fail(
            new AuthorizationError({
              message: `User ${userId} does not have access to ${resourceType} ${resourceId}`,
              resource: resourceType,
              resourceId,
            })
          );
        }
      });

    return {
      extractUserFromRequest,
      authorizeResource,
    };
  }),
}) {}

import { BaseServicesLayer } from "./runtime";

/**
 * Auth service layer with AppConfig provided
 * Used by standalone function exports for backward compatibility
 * New code should use ProductionRuntime instead
 */
export const AuthServiceLive = AuthService.Default.pipe(
  Layer.provide(AppConfig.Default)
);

/**
 * Standalone function for extracting user from HTTP request
 */
export const extractUserFromRequest = (
  request: Http.request.HttpRequest
): Effect.Effect<UserIdentity, AuthenticationError> =>
  Effect.gen(function* () {
    const auth = yield* AuthService;
    return yield* auth.extractUserFromRequest(request);
  });

/**
 * Standalone function for authorization check
 */
export const authorizeResource = (
  userId: string,
  resourceType: "conversation",
  resourceId: string,
  resourceOwnerId: string
): Promise<void> =>
  Effect.runPromise(
    Effect.gen(function* () {
      const auth = yield* AuthService;
      return yield* auth.authorizeResource(
        userId,
        resourceType,
        resourceId,
        resourceOwnerId
      );
    }).pipe(Effect.provide(AuthServiceLive))
  );
