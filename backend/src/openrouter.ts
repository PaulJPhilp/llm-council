import { Chunk, Effect, Either, Schema, Stream } from "effect";
import { AppConfig } from "./config";
import { OpenRouterError } from "./errors";
import {
  logInfo,
  logError,
  trackLLMRequest,
  withSpan,
  addSpanEvent,
} from "./observability";

// Type definitions
export type ChatMessage = {
  role: "user" | "assistant" | "system";
  content: string;
};

export type OpenRouterResponse = {
  content: string | null;
  reasoning_details?: unknown;
};

// Effect Schema for OpenRouter API response
const OpenRouterChoiceSchema = Schema.Struct({
  message: Schema.Struct({
    content: Schema.NullOr(Schema.String),
    reasoning_details: Schema.optional(Schema.Unknown),
  }),
});

const OpenRouterAPISchema = Schema.Struct({
  choices: Schema.Array(OpenRouterChoiceSchema),
});

/**
 * OpenRouter API client service
 * Handles communication with OpenRouter API using Effect patterns
 */
export class OpenRouterClient extends Effect.Service<OpenRouterClient>()(
  "OpenRouterClient",
  {
    effect: Effect.gen(function* () {
      const config = yield* AppConfig;

      /**
       * Query a single model via OpenRouter API
       * @param model - The model identifier
       * @param messages - Array of chat messages
       * @param maxTokens - Optional max tokens (defaults to config.defaultMaxTokens)
       */
      const queryModel = (
        model: string,
        messages: ChatMessage[],
        maxTokens?: number
      ) =>
        withSpan(
          "llm.query",
          {
            "llm.model": model,
            "llm.max_tokens": maxTokens ?? config.defaultMaxTokens,
          },
          Effect.gen(function* () {
            const tokenLimit = maxTokens ?? config.defaultMaxTokens;
            const startTime = Date.now();
            const inputTokens = Math.round(
              JSON.stringify(messages).length / 4
            ); // Rough estimate: ~4 chars per token

            yield* logInfo("LLM query starting", {
              model,
              maxTokens: tokenLimit,
              estimatedInputTokens: inputTokens,
            });

            yield* addSpanEvent("llm.query.start", {
              "llm.model": model,
              "llm.estimated_input_tokens": inputTokens,
            });

          const payload = {
            model,
            messages,
            max_tokens: tokenLimit,
          };

          const response = yield* Effect.tryPromise({
            try: () =>
              fetch(config.openRouterApiUrl, {
                method: "POST",
                headers: {
                  Authorization: `Bearer ${config.openRouterApiKey}`,
                  "Content-Type": "application/json",
                },
                body: JSON.stringify(payload),
                signal: AbortSignal.timeout(config.apiTimeoutMs),
              }),
            catch: (error) => {
              const errorMessage =
                error instanceof Error ? error.message : String(error);
              
              return new OpenRouterError({
                model,
                message: errorMessage,
                cause: error,
              });
            },
          }).pipe(
            Effect.tapError((error) =>
              Effect.gen(function* () {
                const duration = Date.now() - startTime;
                yield* logError("LLM query failed", error, {
                  model,
                  duration,
                });
                yield* trackLLMRequest(model, duration, inputTokens, undefined, true);
                yield* addSpanEvent("llm.query.error", {
                  "llm.model": model,
                  "error.message": error instanceof Error ? error.message : String(error),
                });
              })
            )
          );

          if (!response.ok) {
            // Try to get error details from response body
            const errorDetails = yield* Effect.gen(function* () {
              const errorBodyEither = yield* Effect.either(
                Effect.tryPromise({
                  try: () => response.text(),
                  catch: () => response.statusText,
                })
              );

              if (Either.isLeft(errorBodyEither)) {
                return response.statusText;
              }

              const errorBody = errorBodyEither.right;
              if (!errorBody) {
                return response.statusText;
              }

              // Try to parse JSON, fallback to substring
              const parsedEither = yield* Effect.either(
                Effect.try({
                  try: () => JSON.parse(errorBody),
                  catch: () => null,
                })
              );

              if (Either.isRight(parsedEither) && parsedEither.right) {
                const parsed = parsedEither.right;
                return (
                  parsed.error?.message ||
                  parsed.message ||
                  response.statusText
                );
              }

              return errorBody.substring(0, 200) || response.statusText;
            });

            const duration = Date.now() - startTime;
            
            yield* logError("LLM query HTTP error", new Error(errorDetails), {
              model,
              status: response.status,
              duration,
            });

            yield* trackLLMRequest(model, duration, inputTokens, undefined, true);

            yield* addSpanEvent("llm.query.http_error", {
              "llm.model": model,
              "http.status": response.status,
              "error.message": errorDetails,
            });

            return yield* Effect.fail(
              new OpenRouterError({
                model,
                message: `HTTP ${response.status}: ${errorDetails}`,
              })
            );
          }

          const data = yield* Effect.tryPromise({
            try: () => response.json(),
            catch: (error) =>
              new OpenRouterError({
                model,
                message: `Failed to parse response: ${
                  error instanceof Error ? error.message : String(error)
                }`,
              }),
          });

          // Validate with Effect Schema
          const validatedData = yield* Schema.decodeUnknown(OpenRouterAPISchema)(data).pipe(
            Effect.mapError((error) =>
              new OpenRouterError({
                model,
                message: `Invalid API response: ${String(error)}`,
              })
            )
          );

          const message = validatedData.choices[0].message;
          const duration = Date.now() - startTime;
          const responseLength = message.content?.length || 0;
          const outputTokens = Math.round(responseLength / 4); // Rough estimate

          yield* logInfo("LLM query completed", {
            model,
            duration,
            inputTokens,
            outputTokens,
            responseLength,
          });

          yield* trackLLMRequest(
            model,
            duration,
            inputTokens,
            outputTokens,
            false
          );

          yield* addSpanEvent("llm.query.complete", {
            "llm.model": model,
            "llm.input_tokens": inputTokens,
            "llm.output_tokens": outputTokens,
          });

          return {
            content: message.content,
            reasoning_details: message.reasoning_details,
          } as OpenRouterResponse;
        })
      );

      /**
       * Query multiple models in parallel using Effect streams
       */
      const queryModelsParallel = (
        models: readonly string[],
        messages: ChatMessage[]
      ) =>
        withSpan(
          "llm.query.parallel",
          {
            "llm.model_count": models.length,
            "llm.models": models.join(","),
          },
          Effect.gen(function* () {
            const startTime = Date.now();
            
            yield* logInfo("Parallel LLM queries starting", {
              modelCount: models.length,
              models: models.join(", "),
            });

            yield* addSpanEvent("llm.query.parallel.start", {
              "llm.model_count": models.length,
            });

          const results = yield* Stream.fromIterable(models).pipe(
            Stream.mapEffect((model) =>
              Effect.either(queryModel(model, messages)).pipe(
                Effect.map((result) => [model, result] as const)
              )
            ),
            Stream.runCollect
          );

          // Process results and collect errors for logging
          const errors: Array<[string, unknown]> = [];
          const resultMap = Chunk.toReadonlyArray(results).reduce(
            (acc, [model, result]) => {
              if (Either.isLeft(result)) {
                const error = result.left;
                errors.push([model, error]);
                acc[model] = null;
              } else {
                acc[model] = result.right;
              }
              return acc;
            },
            {} as Record<string, OpenRouterResponse | null>
          );

          // Log errors
          for (const [model, error] of errors) {
            yield* logError("Parallel LLM query failed", error, {
              model,
            });
          }

          const duration = Date.now() - startTime;
          const successCount = Object.values(resultMap).filter((r) => r !== null).length;
          const failureCount = Object.values(resultMap).filter((r) => r === null).length;
          
          yield* logInfo("Parallel LLM queries completed", {
            duration,
            successCount,
            failureCount,
            totalModels: models.length,
          });

          yield* addSpanEvent("llm.query.parallel.complete", {
            "llm.success_count": successCount,
            "llm.failure_count": failureCount,
            "llm.total_duration": duration,
          });

          return resultMap;
        })
      );

      return {
        queryModel,
        queryModelsParallel,
      };
    }),
  }
) {}
