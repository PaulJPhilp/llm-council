import { Effect } from "effect"
import type { WorkflowContext } from "../core/context"
import { BaseStage, type StageResult } from "../core/stage"
import { StageExecutionError } from "../core/errors"
import type { ChatMessage } from "../../openrouter"
import type { ParallelQueryOutput } from "./parallel-query"

/**
 * Individual ranking from one model
 */
export interface ModelRanking {
  readonly model: string
  readonly rawEvaluation: string
  readonly parsedRanking: readonly string[]
}

/**
 * Aggregate ranking statistics
 */
export interface AggregateRankingStats {
  readonly model: string
  readonly averageRank: number
  readonly rankingCount: number
}

/**
 * Output from peer ranking stage
 */
export interface PeerRankingOutput {
  readonly labelToModel: Record<string, string>
  readonly rankings: readonly ModelRanking[]
  readonly aggregateRankings: readonly AggregateRankingStats[]
}

/**
 * Configuration for peer ranking stage
 */
export interface PeerRankingConfig {
  readonly models: readonly string[]
  readonly rankingPromptTemplate?: string
}

/**
 * Parse ranking from evaluation text
 * Looks for "FINAL RANKING:" section with numbered list
 */
export function parseRankingFromText(text: string): string[] {
  const lines = text.split("\n")
  let inRankingSection = false
  const ranking: string[] = []

  for (const line of lines) {
    const trimmed = line.trim()

    if (trimmed.startsWith("FINAL RANKING")) {
      inRankingSection = true
      continue
    }

    if (inRankingSection) {
      if (trimmed === "") {
        // Empty line might end ranking section
        continue
      }

      // Match numbered list items: "1. Response A", "2. Response B", etc.
      const match = trimmed.match(/^\d+\.\s*(Response [A-Z])/)
      if (match) {
        ranking.push(match[1])
      } else if (!trimmed.match(/^\d+\./)) {
        // Stop if we hit non-numbered content
        break
      }
    }
  }

  return ranking
}

/**
 * Calculate aggregate rankings from individual model rankings
 */
export function calculateAggregateRankings(
  rankings: readonly ModelRanking[],
  labelToModel: Record<string, string>
): AggregateRankingStats[] {
  // Map model to list of ranks
  const modelRanks: Record<string, number[]> = {}

  for (const ranking of rankings) {
    for (let i = 0; i < ranking.parsedRanking.length; i++) {
      const label = ranking.parsedRanking[i]
      const model = labelToModel[label]
      if (model) {
        if (!modelRanks[model]) {
          modelRanks[model] = []
        }
        modelRanks[model].push(i + 1) // Rank starts at 1
      }
    }
  }

  // Calculate aggregate statistics
  const aggregates: AggregateRankingStats[] = []
  for (const [model, ranks] of Object.entries(modelRanks)) {
    const sum = ranks.reduce((a, b) => a + b, 0)
    aggregates.push({
      model,
      averageRank: sum / ranks.length,
      rankingCount: ranks.length
    })
  }

  // Sort by average rank (lower is better)
  aggregates.sort((a, b) => a.averageRank - b.averageRank)

  return aggregates
}

/**
 * Stage that collects rankings from peer models
 * Models anonymously rank responses from Stage 1
 * Used in Stage 2 to get peer evaluations
 */
export class PeerRankingStage extends BaseStage<
  ReadonlyMap<string, StageResult>,
  PeerRankingOutput
> {
  private models_: readonly string[]
  private rankingPromptTemplate_: string

  constructor(config: PeerRankingConfig) {
    super(
      "peer-ranking",
      "Peer Ranking Stage",
      "peer-ranking",
      ["parallel-query"]
    )
    this.models_ = config.models
    this.rankingPromptTemplate_ = config.rankingPromptTemplate || ""
  }

  execute(
    ctx: WorkflowContext,
    dependencies: ReadonlyMap<string, StageResult>
  ): Effect.Effect<StageResult<PeerRankingOutput>, StageExecutionError> {
    const self = this
    return Effect.gen(function* () {
        const openRouter = ctx.services.openRouter
        const templates = ctx.services.templates

        // Extract parallel-query result from dependencies
        const parallelQueryResult = dependencies.get("parallel-query")
        if (!parallelQueryResult) {
          return yield* Effect.fail(
            new StageExecutionError({
              stageId: self.id,
              message: "Required dependency 'parallel-query' not found"
            })
          )
        }
        const queries = parallelQueryResult.data as ParallelQueryOutput

        // Create anonymized labels for responses
        const successfulQueries = queries.queries.filter((q) => q.response)
        const labels = Array.from(
          { length: successfulQueries.length },
          (_, i) => String.fromCharCode(65 + i) // A, B, C, ...
        )

        // Create mapping from label to model name
        const labelToModel: Record<string, string> = {}
        labels.forEach((label, i) => {
          labelToModel[`Response ${label}`] = successfulQueries[i].model
        })

        // Build the ranking prompt
        const responsesText = successfulQueries
          .map((query, i) => `Response ${labels[i]}:\n${query.response}`)
          .join("\n\n")

        // Get user query from context
        const userQuery = ctx.userQuery

        let rankingPrompt = self.rankingPromptTemplate_
        if (!rankingPrompt) {
          rankingPrompt = `You are evaluating different responses to the following question:

Question: {{ userQuery }}

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

Example format:
Response A provides good detail but misses Y...
Response B is accurate but lacks depth...

FINAL RANKING:
1. Response B
2. Response A

Now provide your evaluation and ranking:`
        }

        // Render the ranking prompt template
        const renderedPrompt = yield* templates.render(rankingPrompt, {
          userQuery
        }).pipe(
          Effect.catchAll((error) =>
            Effect.fail(
              new StageExecutionError({
                stageId: self.id,
                message: `Template rendering failed: ${error.message}`,
                cause: error
              })
            )
          )
        )

        const messages: ChatMessage[] = [
          {
            role: "user",
            content: renderedPrompt
          }
        ]

        // Get rankings from all council models in parallel
        const responses = yield* openRouter.queryModelsParallel(
          self.models_,
          messages
        )

        // Format results
        const rankings: ModelRanking[] = []
        for (const [model, response] of Object.entries(responses)) {
          if (response !== null) {
            const fullText = response.content || ""
            const parsed = parseRankingFromText(fullText)
            rankings.push({
              model,
              rawEvaluation: fullText,
              parsedRanking: parsed
            })
          }
        }

        if (rankings.length === 0) {
          return yield* Effect.fail(
            new StageExecutionError({
              stageId: self.id,
              message: "No models provided rankings"
            })
          )
        }

        // Calculate aggregate rankings
        const aggregateRankings = calculateAggregateRankings(
          rankings,
          labelToModel
        )

        return self.success({
          labelToModel,
          rankings: rankings as readonly ModelRanking[],
          aggregateRankings: aggregateRankings as readonly AggregateRankingStats[]
        })
      })
  }
}

/**
 * Factory function for creating PeerRankingStage
 */
export function createPeerRankingStage(
  config: PeerRankingConfig
): PeerRankingStage {
  return new PeerRankingStage(config)
}
