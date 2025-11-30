/**
 * Effect Runtime Configuration
 * Provides centralized runtime management for production and test environments
 */

import { Layer, Runtime } from "effect";
import { AppConfig } from "./config";
import { StorageService } from "./storage";
import { OpenRouterClient } from "./openrouter";
import { AuthService } from "./auth";
import { ObservabilityServiceLive } from "./observability";
import { RateLimitServiceLive } from "./rate-limit";

/**
 * Base services layer - provides AppConfig
 * Used as a foundation for service-specific layers
 */
export const BaseServicesLayer = AppConfig.Default;

/**
 * Core services layer - provides storage, OpenRouter, and auth
 * These are the fundamental services needed by most application code
 */
export const CoreServicesLayer = Layer.mergeAll(
  StorageService.Default,
  OpenRouterClient.Default,
  AuthService.Default
).pipe(Layer.provide(BaseServicesLayer));

/**
 * Production runtime layer - all live services
 * Use this for production application code
 * Combines base, core, and observability services
 */
export const ProductionLayer = Layer.mergeAll(
  BaseServicesLayer,
  CoreServicesLayer,
  ObservabilityServiceLive,
  RateLimitServiceLive
);

/**
 * Production runtime - use for running production effects
 * Example: Runtime.runPromise(ProductionRuntime)(effect)
 */
export const ProductionRuntime = Runtime.make(ProductionLayer);

