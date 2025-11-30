/**
 * Rate Limiting Service
 * Implements token bucket rate limiting using Effect patterns
 */

import { Effect, Layer, Ref } from "effect";
import { AppConfig } from "./config";
import { RateLimitError } from "./errors";
import { Clock } from "effect";
import { BaseServicesLayer } from "./runtime";

/**
 * Rate limit entry tracking request count and window start
 */
interface RateLimitEntry {
  readonly count: number;
  readonly windowStart: number;
}

/**
 * Rate limit service for tracking and enforcing request limits
 */
export class RateLimitService extends Effect.Service<RateLimitService>()(
  "RateLimitService",
  {
    effect: Effect.gen(function* () {
      const config = yield* AppConfig;
      const clock = yield* Clock;

      // In-memory store for rate limit tracking
      // Key: identifier (user ID or IP), Value: RateLimitEntry
      const store = yield* Ref.make(new Map<string, RateLimitEntry>());

      /**
       * Clean up expired entries lazily (called during checks)
       */
      const cleanupExpiredEntries = Effect.gen(function* () {
        const now = yield* clock.currentTimeMillis;
        const entries = yield* Ref.get(store);
        const active = new Map<string, RateLimitEntry>();

        for (const [key, entry] of entries.entries()) {
          const age = now - entry.windowStart;
          if (age < config.rateLimitWindowMs) {
            active.set(key, entry);
          }
        }

        yield* Ref.set(store, active);
      });

      /**
       * Check if a request should be rate limited
       * @param identifier - User ID or IP address
       * @param limit - Maximum requests allowed in window
       * @param windowMs - Time window in milliseconds
       * @returns Effect that fails with RateLimitError if limit exceeded
       */
      const checkRateLimit = (
        identifier: string,
        limit: number,
        windowMs: number
      ): Effect.Effect<void, RateLimitError> =>
        Effect.gen(function* () {
          if (!config.rateLimitEnabled) {
            return; // Rate limiting disabled
          }

          // Clean up expired entries before checking
          yield* cleanupExpiredEntries;

          const now = yield* clock.currentTimeMillis;
          const entries = yield* Ref.get(store);

          const entry = entries.get(identifier);

          if (!entry) {
            // First request from this identifier
            yield* Ref.update(store, (map) => {
              const updated = new Map(map);
              updated.set(identifier, {
                count: 1,
                windowStart: now,
              });
              return updated;
            });
            return;
          }

          const age = now - entry.windowStart;

          if (age >= windowMs) {
            // Window expired, reset
            yield* Ref.update(store, (map) => {
              const updated = new Map(map);
              updated.set(identifier, {
                count: 1,
                windowStart: now,
              });
              return updated;
            });
            return;
          }

          // Check if limit exceeded
          if (entry.count >= limit) {
            const retryAfter = Math.ceil((windowMs - age) / 1000);
            return yield* Effect.fail(
              new RateLimitError({
                message: `Rate limit exceeded: ${limit} requests per ${windowMs}ms`,
                identifier,
                limit,
                windowMs,
                retryAfter,
              })
            );
          }

          // Increment count
          yield* Ref.update(store, (map) => {
            const updated = new Map(map);
            updated.set(identifier, {
              count: entry.count + 1,
              windowStart: entry.windowStart,
            });
            return updated;
          });
        });

      /**
       * Check rate limit for general API requests
       */
      const checkApiRateLimit = (identifier: string) =>
        checkRateLimit(
          identifier,
          config.rateLimitMaxRequests,
          config.rateLimitWindowMs
        );

      /**
       * Check rate limit for workflow executions (more restrictive)
       */
      const checkWorkflowRateLimit = (identifier: string) =>
        checkRateLimit(
          identifier,
          config.rateLimitMaxWorkflowExecutions,
          config.rateLimitWindowMs
        );

      return {
        checkApiRateLimit,
        checkWorkflowRateLimit,
        checkRateLimit,
      };
    }),
  }
) {}

/**
 * Rate limit service layer with AppConfig provided
 * Used by ProductionLayer and standalone function exports
 */
export const RateLimitServiceLive = RateLimitService.Default.pipe(
  Layer.provide(BaseServicesLayer)
);

