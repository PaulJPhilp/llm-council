import { Chunk, Effect, Either, Stream } from "effect";
import { z } from "zod";
import { AppConfig } from "./config";
import { OpenRouterError } from "./errors";

// Type definitions
export type ChatMessage = {
  role: "user" | "assistant" | "system";
  content: string;
};

export type OpenRouterResponse = {
  content: string | null;
  reasoning_details?: unknown;
};

// Zod schema for OpenRouter API response
const OpenRouterChoiceSchema = z.object({
  message: z.object({
    content: z.string().nullable(),
    reasoning_details: z.unknown().optional(),
  }),
});

const OpenRouterAPISchema = z.object({
  choices: z.array(OpenRouterChoiceSchema),
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
       */
      const queryModel = (model: string, messages: ChatMessage[]) =>
        Effect.gen(function* () {
          const payload = {
            model,
            messages,
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
            catch: (error) =>
              new OpenRouterError({
                model,
                message: error instanceof Error ? error.message : String(error),
                cause: error,
              }),
          });

          if (!response.ok) {
            return yield* Effect.fail(
              new OpenRouterError({
                model,
                message: `HTTP ${response.status}: ${response.statusText}`,
              })
            );
          }

          const data = yield* Effect.tryPromise({
            try: () => response.json(),
            catch: (error) =>
              new OpenRouterError({
                model,
                message: `Failed to parse response: ${error instanceof Error ? error.message : String(error)}`,
              }),
          });

          const validatedData = yield* Effect.try({
            try: () => OpenRouterAPISchema.parse(data),
            catch: (error) =>
              new OpenRouterError({
                model,
                message: `Invalid API response: ${error instanceof Error ? error.message : String(error)}`,
              }),
          });

          const message = validatedData.choices[0].message;

          return {
            content: message.content,
            reasoning_details: message.reasoning_details,
          } as OpenRouterResponse;
        });

      /**
       * Query multiple models in parallel using Effect streams
       */
      const queryModelsParallel = (
        models: readonly string[],
        messages: ChatMessage[]
      ) =>
        Effect.gen(function* () {
          const results = yield* Stream.fromIterable(models).pipe(
            Stream.mapEffect((model) =>
              Effect.either(queryModel(model, messages)).pipe(
                Effect.map((result) => [model, result] as const)
              )
            ),
            Stream.runCollect
          );

          return Chunk.toReadonlyArray(results).reduce(
            (acc, [model, result]) => {
              acc[model] = Either.isLeft(result) ? null : result.right;
              return acc;
            },
            {} as Record<string, OpenRouterResponse | null>
          );
        });

      return {
        queryModel,
        queryModelsParallel,
      };
    }),
  }
) {}
