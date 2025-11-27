import { Config, Effect } from "effect";
import { ConfigError } from "./errors";

/**
 * Application configuration service
 * Provides typed access to environment variables and constants
 */
export class AppConfig extends Effect.Service<AppConfig>()("AppConfig", {
  sync: () => ({
    // OpenRouter API configuration
    openRouterApiKey: Config.string("OPENROUTER_API_KEY").pipe(
      Config.mapError(
        (_error) =>
          new ConfigError({
            key: "OPENROUTER_API_KEY",
            message: "OpenRouter API key is required",
          })
      )
    ),

    openRouterApiUrl: Config.string("OPENROUTER_API_URL").pipe(
      Config.withDefault("https://openrouter.ai/api/v1/chat/completions")
    ),

    // Council model configuration
    councilModels: Config.array(Config.string("COUNCIL_MODELS")).pipe(
      Config.withDefault([
        "openai/gpt-5.1",
        "google/gemini-3-pro-preview",
        "anthropic/claude-sonnet-4.5",
        "x-ai/grok-4",
      ])
    ),

    chairmanModel: Config.string("CHAIRMAN_MODEL").pipe(
      Config.withDefault("google/gemini-3-pro-preview")
    ),

    // Storage configuration
    dataDir: Config.string("DATA_DIR").pipe(
      Config.withDefault("data/conversations")
    ),

    // Server configuration
    port: Config.number("PORT").pipe(Config.withDefault(8001)),

    // Request timeouts (in milliseconds)
    apiTimeoutMs: Config.number("API_TIMEOUT_MS").pipe(
      Config.withDefault(120_000) // 2 minutes
    ),

    titleGenerationTimeoutMs: Config.number("TITLE_GENERATION_TIMEOUT_MS").pipe(
      Config.withDefault(30_000) // 30 seconds
    ),
  }),
}) {}
