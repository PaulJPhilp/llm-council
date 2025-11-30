import { Config, Effect } from "effect";

/**
 * Application configuration service
 * Provides typed access to environment variables and constants
 */
export class AppConfig extends Effect.Service<AppConfig>()("AppConfig", {
  effect: Effect.gen(function* () {
    return {
      // OpenRouter API configuration
      openRouterApiKey: yield* Config.string("OPENROUTER_API_KEY"),

      openRouterApiUrl: yield* Config.string("OPENROUTER_API_URL").pipe(
        Config.withDefault("https://openrouter.ai/api/v1/chat/completions")
      ),

      // Council model configuration
      councilModels: yield* Config.array(Config.string("COUNCIL_MODELS")).pipe(
        Config.withDefault([
          "openai/gpt-5.1",
          "google/gemini-3-pro-preview",
          "anthropic/claude-sonnet-4.5",
          "x-ai/grok-4",
        ])
      ),

      chairmanModel: yield* Config.string("CHAIRMAN_MODEL").pipe(
        Config.withDefault("google/gemini-3-pro-preview")
      ),

      // Storage configuration
      dataDir: yield* Config.string("DATA_DIR").pipe(
        Config.withDefault("data/conversations")
      ),

      // Server configuration
      port: yield* Config.number("PORT").pipe(Config.withDefault(8001)),

      // HTTP server timeouts and connection settings
      httpRequestTimeoutMs: yield* Config.number("HTTP_REQUEST_TIMEOUT_MS").pipe(
        Config.withDefault(300_000) // 5 minutes (for long-running workflow executions)
      ),
      httpKeepAliveTimeoutMs: yield* Config.number("HTTP_KEEPALIVE_TIMEOUT_MS").pipe(
        Config.withDefault(65_000) // 65 seconds (standard HTTP keep-alive)
      ),
      httpMaxConnections: yield* Config.number("HTTP_MAX_CONNECTIONS").pipe(
        Config.withDefault(1000) // Maximum concurrent connections
      ),
      httpMaxRequestSizeBytes: yield* Config.number("HTTP_MAX_REQUEST_SIZE_BYTES").pipe(
        Config.withDefault(10 * 1024 * 1024) // 10 MB max request body size
      ),

      // Request timeouts (in milliseconds)
      apiTimeoutMs: yield* Config.number("API_TIMEOUT_MS").pipe(
        Config.withDefault(120_000) // 2 minutes
      ),

      titleGenerationTimeoutMs: yield* Config.number(
        "TITLE_GENERATION_TIMEOUT_MS"
      ).pipe(
        Config.withDefault(30_000) // 30 seconds
      ),

      // Token limits for different use cases
      defaultMaxTokens: yield* Config.number("DEFAULT_MAX_TOKENS").pipe(
        Config.withDefault(2000) // Default limit for regular queries
      ),

      chairmanMaxTokens: yield* Config.number("CHAIRMAN_MAX_TOKENS").pipe(
        Config.withDefault(8000) // Higher limit for chairman synthesis (essays, long responses)
      ),

      // Mock mode for UI testing (uses fake LLM responses)
      // Accepts: true, "true", "1", "yes" as true values
      mockMode: yield* Config.string("MOCK_MODE").pipe(
        Config.withDefault("false"),
        Config.map((val) => val === "true" || val === "1" || val === "yes")
      ),

      // Rate limiting configuration
      rateLimitEnabled: yield* Config.string("RATE_LIMIT_ENABLED").pipe(
        Config.withDefault("true"),
        Config.map((val) => val === "true" || val === "1" || val === "yes")
      ),
      rateLimitWindowMs: yield* Config.number("RATE_LIMIT_WINDOW_MS").pipe(
        Config.withDefault(60_000) // 1 minute
      ),
      rateLimitMaxRequests: yield* Config.number("RATE_LIMIT_MAX_REQUESTS").pipe(
        Config.withDefault(100) // 100 requests per window
      ),
      rateLimitMaxWorkflowExecutions: yield* Config.number("RATE_LIMIT_MAX_WORKFLOW_EXECUTIONS").pipe(
        Config.withDefault(10) // 10 workflow executions per window (more expensive)
      ),
    };
  }),
}) {}
