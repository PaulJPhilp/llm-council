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

      // Request timeouts (in milliseconds)
      apiTimeoutMs: yield* Config.number("API_TIMEOUT_MS").pipe(
        Config.withDefault(120_000) // 2 minutes
      ),

      titleGenerationTimeoutMs: yield* Config.number(
        "TITLE_GENERATION_TIMEOUT_MS"
      ).pipe(
        Config.withDefault(30_000) // 30 seconds
      ),
    };
  }),
}) {}
