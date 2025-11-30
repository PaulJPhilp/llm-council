import { Effect } from "effect";
import type { ChatMessage } from "../../openrouter";
import type { WorkflowContext } from "../core/context";
import { StageExecutionError } from "../core/errors";
import { BaseStage, type StageResult } from "../core/stage";
import type { ParallelQueryOutput } from "./parallel-query";
import type { PeerRankingOutput } from "./peer-ranking";
import { logInfo, logError } from "../../observability";

/**
 * Output from synthesis stage
 */
export interface SynthesisOutput {
  readonly finalAnswer: string;
  readonly reasoning?: unknown;
  readonly chairmanModel: string;
}

/**
 * Configuration for synthesis stage
 */
export interface SynthesisConfig {
  readonly chairmanModel: string;
  readonly synthesisPromptTemplate?: string;
}

/**
 * Stage that synthesizes a final answer from all stage results
 * The "chairman" model generates the final conclusion based on
 * all responses and peer rankings
 */
export class SynthesisStage extends BaseStage<
  ReadonlyMap<string, StageResult>,
  SynthesisOutput
> {
  private chairmanModel_: string;
  private synthesisPromptTemplate_: string;

  constructor(config: SynthesisConfig) {
    super("synthesis", "Synthesis Stage", "synthesis", [
      "parallel-query",
      "peer-ranking",
    ]);
    this.chairmanModel_ = config.chairmanModel;
    this.synthesisPromptTemplate_ = config.synthesisPromptTemplate || "";
  }

  execute(
    ctx: WorkflowContext,
    dependencies: ReadonlyMap<string, StageResult>
  ): Effect.Effect<StageResult<SynthesisOutput>, StageExecutionError> {
    const self = this;
    return Effect.gen(function* () {
      const openRouter = ctx.services.openRouter;
      const templates = ctx.services.templates;

      // Get results from previous stages
      const parallelQueryResult = dependencies.get("parallel-query");
      if (!parallelQueryResult) {
        return yield* Effect.fail(
          new StageExecutionError({
            stageId: self.id,
            message: "Required dependency 'parallel-query' not found",
          })
        );
      }

      const peerRankingResult = dependencies.get("peer-ranking");
      if (!peerRankingResult) {
        return yield* Effect.fail(
          new StageExecutionError({
            stageId: self.id,
            message: "Required dependency 'peer-ranking' not found",
          })
        );
      }

      const queries = parallelQueryResult.data as ParallelQueryOutput;
      const ranking = peerRankingResult.data as PeerRankingOutput;

      // Format the responses for the chairman
      const responsesText = queries.queries
        .filter((q) => q.response)
        .map((q) => {
          const label = Object.entries(ranking.labelToModel).find(
            ([_, m]) => m === q.model
          )?.[0];
          return `${label}:\n${q.response}`;
        })
        .join("\n\n");

      // Format the rankings for the chairman
      const rankingsText = ranking.aggregateRankings
        .map((r) => `- ${r.model}: average rank ${r.averageRank.toFixed(2)}`)
        .join("\n");

      // Build the synthesis prompt
      let synthesisPrompt = self.synthesisPromptTemplate_;
      if (!synthesisPrompt) {
        synthesisPrompt = `You are the chairman of a council of expert models.
The council has provided the following responses to the user's question:

Question: {{ userQuery }}

Individual Responses:
${responsesText}

Peer Rankings (average position across all evaluators):
${rankingsText}

Your task is to synthesize a comprehensive final answer that:
1. Takes into account all the responses from the council
2. Considers the peer rankings and their implications
3. Provides a balanced, well-reasoned conclusion
4. Is clear and concise

Please provide your final synthesis:
{{ userQuery }}`;
      }

      // Render the synthesis prompt template
      const renderedPrompt = yield* templates
        .render(synthesisPrompt, {
          userQuery: ctx.userQuery,
        })
        .pipe(
          Effect.catchAll((error) =>
            Effect.fail(
              new StageExecutionError({
                stageId: self.id,
                message: `Template rendering failed: ${error.message}`,
                cause: error,
              })
            )
          )
        );

      const messages: ChatMessage[] = [
        {
          role: "user",
          content: renderedPrompt,
        },
      ];

       // Get the synthesis from the chairman model with higher token limit
       const chairmanMaxTokens = (
         ctx.services.config as { chairmanMaxTokens?: number }
       ).chairmanMaxTokens;
       const stageStartTime = Date.now();
       yield* logInfo("Workflow synthesis starting", {
         stageId: self.id,
         chairmanModel: self.chairmanModel_,
         maxTokens: chairmanMaxTokens || "default",
       });
       const response = yield* openRouter
         .queryModel(self.chairmanModel_, messages, chairmanMaxTokens)
         .pipe(
          Effect.catchAll((error) =>
            Effect.fail(
              new StageExecutionError({
                stageId: self.id,
                message: `Chairman model query failed: ${
                  error instanceof Error ? error.message : String(error)
                }`,
                cause: error,
              })
            )
          )
        );

       if (!response.content) {
         const stageDuration = Date.now() - stageStartTime;
         yield* logError("Workflow synthesis failed - chairman model did not provide response", undefined, {
           stageId: self.id,
           duration: stageDuration,
           chairmanModel: self.chairmanModel_,
         });
         return yield* Effect.fail(
           new StageExecutionError({
             stageId: self.id,
             message: `Chairman model (${self.chairmanModel_}) did not provide a response`,
           })
         );
       }

       const stageDuration = Date.now() - stageStartTime;
       const responseLength = response.content.length;
       yield* logInfo("Workflow synthesis completed", {
         stageId: self.id,
         duration: stageDuration,
         responseLength,
         estimatedTokens: Math.round(responseLength / 4),
         chairmanModel: self.chairmanModel_,
       });

       return self.success({
         finalAnswer: response.content,
         reasoning: response.reasoning_details,
         chairmanModel: self.chairmanModel_,
       });
    });
  }
}

/**
 * Factory function for creating SynthesisStage
 */
export function createSynthesisStage(config: SynthesisConfig): SynthesisStage {
  return new SynthesisStage(config);
}
