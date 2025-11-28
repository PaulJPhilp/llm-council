import { Effect, Layer } from "effect";
import { AppConfig } from "./config";
import { CouncilError } from "./errors";
import { OpenRouterClient, type ChatMessage, type OpenRouterResponse } from "./openrouter";
import { OpenRouterError } from "./errors";
import { createMockOpenRouterClient } from "./openrouter.mock";
import {
  type Stage1Response,
  type Stage2Response,
  type Stage3Response,
  StorageService,
} from "./storage";

export type LabelToModelMap = {
  [label: string]: string;
};

export type AggregateRanking = {
  model: string;
  average_rank: number;
  rankings_count: number;
};

export type CouncilMetadata = {
  label_to_model: LabelToModelMap;
  aggregate_rankings: AggregateRanking[];
};

// Regex patterns for parsing rankings
const RESPONSE_PATTERN = /Response [A-Z]/;
const NUMBERED_RESPONSE_PATTERN = /\d+\.\s*Response [A-Z]/g;
const ALL_RESPONSES_PATTERN = /Response [A-Z]/g;

/**
 * Council service for orchestrating the 3-stage LLM council process
 * Uses Effect patterns for concurrency, error handling, and dependency injection
 */
export class CouncilService extends Effect.Service<CouncilService>()(
  "CouncilService",
  {
    effect: Effect.gen(function* () {
      const config = yield* AppConfig;

      // Use mock client if mock mode is enabled
      let openRouter: { queryModel: (m: string, msgs: ChatMessage[]) => Effect.Effect<OpenRouterResponse, OpenRouterError | never>; queryModelsParallel: (m: string[], msgs: ChatMessage[]) => Effect.Effect<Record<string, OpenRouterResponse | null>, OpenRouterError | never> };
      if (config.mockMode) {
        console.log("🎭 Mock mode enabled - using fake LLM responses");
        const mockClient = createMockOpenRouterClient();
        openRouter = {
          queryModel: (model: string, messages: ChatMessage[]) =>
            Effect.tryPromise({
              try: () => mockClient.queryModel(model, messages),
              catch: (error) => new OpenRouterError({
                model,
                message: `Mock queryModel failed: ${error instanceof Error ? error.message : String(error)}`,
                cause: error,
              }),
            }),
          queryModelsParallel: (models: string[], messages: ChatMessage[]) =>
            Effect.tryPromise({
              try: () => mockClient.queryModelsParallel(models, messages),
              catch: (error) => new OpenRouterError({
                model: "mock-parallel",
                message: `Mock queryModelsParallel failed: ${error instanceof Error ? error.message : String(error)}`,
                cause: error,
              }),
            }),
        };
      } else {
        openRouter = yield* OpenRouterClient;
      }

      // Convert readonly array to mutable for use with queryModelsParallel
      const councilModelsArray = Array.from(config.councilModels);

      // const _storage = yield* StorageService;

      /**
       * Stage 1: Collect individual responses from all council models
       */
      const stage1CollectResponses = (userQuery: string) =>
        Effect.gen(function* () {
          const messages = [{ role: "user" as const, content: userQuery }];

          // Query all models in parallel using Effect streams
          const responses = yield* openRouter.queryModelsParallel(
            councilModelsArray,
            messages
          );

          // Format results - only include successful responses
          const stage1Results: Stage1Response[] = [];
          for (const [model, response] of Object.entries(responses)) {
            if (response?.content) {
              stage1Results.push({
                model,
                response: response.content,
              });
            }
          }

          if (stage1Results.length === 0) {
            return yield* Effect.fail(
              new CouncilError({
                stage: 1,
                message: "No models responded successfully in Stage 1",
              })
            );
          }

          return stage1Results;
        });

      /**
       * Stage 2: Each model ranks the anonymized responses
       */
      const stage2CollectRankings = (
        userQuery: string,
        stage1Results: Stage1Response[]
      ) =>
        Effect.gen(function* () {
          // Create anonymized labels for responses (Response A, Response B, etc.)
          const labels = Array.from(
            { length: stage1Results.length },
            (_, i) => String.fromCharCode(65 + i) // A, B, C, ...
          );

          // Create mapping from label to model name
          const labelToModel: LabelToModelMap = {};
          labels.forEach((label, i) => {
            labelToModel[`Response ${label}`] = stage1Results[i].model;
          });

          // Build the ranking prompt
          const responsesText = stage1Results
            .map((result, i) => `Response ${labels[i]}:\n${result.response}`)
            .join("\n\n");

          const rankingPrompt = `You are evaluating different responses to the following question:

Question: ${userQuery}

Here are the responses from different models (anonymized):

${responsesText}

Your task:
1. First, evaluate each response individually. For each response, explain what it does well and what it does poorly.
2. Then, at the very end of your response, provide a final ranking.

IMPORTANT: Your final ranking MUST be formatted EXACTLY as follows:
- Start with the line "FINAL RANKING:" (all caps, with colon)
- Then list the responses from best to worst as a numbered list
- Each line should be: number, period, space, then ONLY the response label (e.g., "1. Response A")
- Do not add any other text or explanations in the ranking section

Example of the correct format for your ENTIRE response:

Response A provides good detail on X but misses Y...
Response B is accurate but lacks depth on Z...
Response C offers the most comprehensive answer...

FINAL RANKING:
1. Response C
2. Response A
3. Response B

Now provide your evaluation and ranking:`;

          const messages = [{ role: "user" as const, content: rankingPrompt }];

          // Get rankings from all council models in parallel
          const responses = yield* openRouter.queryModelsParallel(
            councilModelsArray,
            messages
          );

          // Format results
          const stage2Results: Stage2Response[] = [];
          for (const [model, response] of Object.entries(responses)) {
            if (response !== null) {
              const fullText = response.content || "";
              const parsed = parseRankingFromText(fullText);
              stage2Results.push({
                model,
                ranking: fullText,
                parsed_ranking: parsed,
              });
            }
          }

          return [stage2Results, labelToModel] as const;
        });

      /**
       * Stage 3: Chairman synthesizes final response
       */
      const stage3SynthesizeFinal = (
        userQuery: string,
        stage1Results: Stage1Response[],
        stage2Results: Stage2Response[]
      ) =>
        Effect.gen(function* () {
          // Build comprehensive context for chairman
          const stage1Text = stage1Results
            .map(
              (result) => `Model: ${result.model}\nResponse: ${result.response}`
            )
            .join("\n\n");

          const stage2Text = stage2Results
            .map(
              (result) => `Model: ${result.model}\nRanking: ${result.ranking}`
            )
            .join("\n\n");

          const chairmanPrompt = `You are the Chairman of an LLM Council. Multiple AI models have provided responses to a user's question, and then ranked each other's responses.

Original Question: ${userQuery}

STAGE 1 - Individual Responses:
${stage1Text}

STAGE 2 - Peer Rankings:
${stage2Text}

Your task as Chairman is to synthesize all of this information into a single, comprehensive, accurate answer to the user's original question. Consider:
- The individual responses and their insights
- The peer rankings and what they reveal about response quality
- Any patterns of agreement or disagreement

Provide a clear, well-reasoned final answer that represents the council's collective wisdom:`;

          const messages = [{ role: "user" as const, content: chairmanPrompt }];

          // Query the chairman model
          const response = yield* openRouter.queryModel(
            config.chairmanModel,
            messages
          );

          if (!response?.content) {
            return yield* Effect.fail(
              new CouncilError({
                stage: 3,
                message: "Chairman model failed to generate synthesis",
              })
            );
          }

          return {
            model: config.chairmanModel,
            response: response.content,
          } as Stage3Response;
        });

      /**
       * Parse the FINAL RANKING section from the model's response
       */
      const parseRankingFromText = (rankingText: string): string[] => {
        // Look for "FINAL RANKING:" section
        if (rankingText.includes("FINAL RANKING:")) {
          const parts = rankingText.split("FINAL RANKING:");
          if (parts.length >= 2) {
            const rankingSection = parts[1];

            // Try to extract numbered list format (e.g., "1. Response A")
            const numberedMatches = rankingSection.match(
              NUMBERED_RESPONSE_PATTERN
            );
            if (numberedMatches && numberedMatches.length > 0) {
              // Extract just the "Response X" part
              return numberedMatches
                .map((m) => {
                  const match = m.match(RESPONSE_PATTERN);
                  return match ? match[0] : "";
                })
                .filter((x) => x !== "");
            }

            // Fallback: Extract all "Response X" patterns in order
            const matches = rankingSection.match(ALL_RESPONSES_PATTERN);
            if (matches && matches.length > 0) {
              return matches;
            }
          }
        }

        // Fallback: try to find any "Response X" patterns in order
        const matches = rankingText.match(/Response [A-Z]/g);
        return matches ? matches : [];
      };

      /**
       * Calculate aggregate rankings across all models
       */
      const calculateAggregateRankings = (
        stage2Results: Stage2Response[],
        labelToModel: LabelToModelMap
      ): AggregateRanking[] => {
        // Track positions for each model
        const modelPositions: Record<string, number[]> = {};

        for (const ranking of stage2Results) {
          const parsedRanking = ranking.parsed_ranking;

          for (let position = 0; position < parsedRanking.length; position++) {
            const label = parsedRanking[position];
            if (label in labelToModel) {
              const modelName = labelToModel[label];
              if (!modelPositions[modelName]) {
                modelPositions[modelName] = [];
              }
              modelPositions[modelName].push(position + 1);
            }
          }
        }

        // Calculate average position for each model
        const aggregate: AggregateRanking[] = [];
        for (const [model, positions] of Object.entries(modelPositions)) {
          if (positions.length > 0) {
            const avgRank =
              positions.reduce((a, b) => a + b, 0) / positions.length;
            aggregate.push({
              model,
              average_rank: Math.round(avgRank * 100) / 100,
              rankings_count: positions.length,
            });
          }
        }

        // Sort by average rank (lower is better)
        aggregate.sort((a, b) => a.average_rank - b.average_rank);

        return aggregate;
      };

      /**
       * Generate a short title for a conversation based on the first user message
       */
      const generateConversationTitle = (userQuery: string) =>
        Effect.gen(function* () {
          const titlePrompt = `Generate a very short title (3-5 words maximum) that summarizes the following question.
The title should be concise and descriptive. Do not use quotes or punctuation in the title.

Question: ${userQuery}

Title:`;

          const messages = [{ role: "user" as const, content: titlePrompt }];

          // Use gemini-2.5-flash for title generation (fast and cheap)
          const response = yield* openRouter.queryModel(
            "google/gemini-2.5-flash",
            messages
          );

          if (!response?.content) {
            return "New Conversation"; // Fallback
          }

          let title = response.content.trim();

          // Clean up the title - remove quotes
          title = title.replace(/^["']|["']$/g, "");

          // Truncate if too long
          if (title.length > 50) {
            title = `${title.substring(0, 47)}...`;
          }

          return title;
        });

      /**
       * Run the complete 3-stage council process
       */
      const runFullCouncil = (userQuery: string) =>
        Effect.gen(function* () {
          // Stage 1: Collect individual responses
          const stage1Results = yield* stage1CollectResponses(userQuery);

          // Stage 2: Collect rankings
          const [stage2Results, labelToModel] = yield* stage2CollectRankings(
            userQuery,
            stage1Results
          );

          // Calculate aggregate rankings
          const aggregateRankings = calculateAggregateRankings(
            stage2Results,
            labelToModel
          );

          // Stage 3: Synthesize final answer
          const stage3Result = yield* stage3SynthesizeFinal(
            userQuery,
            stage1Results,
            stage2Results
          );

          // Prepare metadata
          const metadata: CouncilMetadata = {
            label_to_model: labelToModel,
            aggregate_rankings: aggregateRankings,
          };

          return [
            stage1Results,
            stage2Results,
            stage3Result,
            metadata,
          ] as const;
        });

      return {
        stage1CollectResponses,
        stage2CollectRankings,
        stage3SynthesizeFinal,
        parseRankingFromText,
        calculateAggregateRankings,
        generateConversationTitle,
        runFullCouncil,
      };
    }),
  }
) {}

// Create a default layer that provides all required services
// Create a default layer that provides all required services
const BaseLayer = AppConfig.Default;
const ServicesLayer = Layer.mergeAll(
  StorageService.Default,
  OpenRouterClient.Default
).pipe(Layer.provide(BaseLayer));

const DependenciesLayer = Layer.merge(ServicesLayer, BaseLayer);

export const CouncilServiceLive = CouncilService.Default.pipe(
  Layer.provide(DependenciesLayer)
);

// Standalone function exports for backward compatibility
export const parseRankingFromText = (rankingText: string): string[] =>
  Effect.runSync(
    Effect.gen(function* () {
      const council = yield* CouncilService;
      return council.parseRankingFromText(rankingText);
    }).pipe(Effect.provide(CouncilServiceLive))
  );

export const calculateAggregateRankings = (
  stage2Results: Stage2Response[],
  labelToModel: LabelToModelMap
): AggregateRanking[] =>
  Effect.runSync(
    Effect.gen(function* () {
      const council = yield* CouncilService;
      return council.calculateAggregateRankings(stage2Results, labelToModel);
    }).pipe(Effect.provide(CouncilServiceLive))
  );

export const generateConversationTitle = (content: string) =>
  Effect.runPromise(
    Effect.gen(function* () {
      const council = yield* CouncilService;
      return yield* council.generateConversationTitle(content);
    }).pipe(Effect.provide(CouncilServiceLive))
  );

export const runFullCouncil = (userQuery: string) =>
  Effect.runPromise(
    Effect.gen(function* () {
      const council = yield* CouncilService;
      return yield* council.runFullCouncil(userQuery);
    }).pipe(Effect.provide(CouncilServiceLive))
  );

export const stage1CollectResponses = (userQuery: string) =>
  Effect.runPromise(
    Effect.gen(function* () {
      const council = yield* CouncilService;
      return yield* council.stage1CollectResponses(userQuery);
    }).pipe(Effect.provide(CouncilServiceLive))
  );

export const stage2CollectRankings = (
  userQuery: string,
  stage1Results: Stage1Response[]
) =>
  Effect.runPromise(
    Effect.gen(function* () {
      const council = yield* CouncilService;
      return yield* council.stage2CollectRankings(userQuery, stage1Results);
    }).pipe(Effect.provide(CouncilServiceLive))
  );

export const stage3SynthesizeFinal = (
  userQuery: string,
  stage1Results: Stage1Response[],
  stage2Results: Stage2Response[]
) =>
  Effect.runPromise(
    Effect.gen(function* () {
      const council = yield* CouncilService;
      return yield* council.stage3SynthesizeFinal(
        userQuery,
        stage1Results,
        stage2Results
      );
    }).pipe(Effect.provide(CouncilServiceLive))
  );
