import { Effect } from "effect"
import type { WorkflowContext } from "../core/context"
import { BaseStage, type StageResult } from "../core/stage"
import { StageExecutionError } from "../core/errors"
import type { ChatMessage } from "../../openrouter"

/**
 * Output from parallel query stage
 * Contains responses from multiple models
 */
export interface ParallelQueryOutput {
  readonly queries: ReadonlyArray<{
    readonly model: string
    readonly response: string | null
    readonly reasoning?: unknown
  }>
  readonly successCount: number
  readonly failureCount: number
}

/**
 * Configuration for parallel query stage
 */
export interface ParallelQueryConfig {
  readonly models: readonly string[]
  readonly systemPrompt?: string
  readonly userPromptTemplate?: string
}

/**
 * Stage that sends queries to multiple models in parallel
 * Used in Stage 1 to collect initial responses
 */
export class ParallelQueryStage extends BaseStage<
  ReadonlyMap<string, StageResult>,
  ParallelQueryOutput
> {
  private models_: readonly string[]
  private systemPrompt_: string
  private userPromptTemplate_: string

  constructor(config: ParallelQueryConfig) {
    super(
      "parallel-query",
      "Parallel Query Stage",
      "parallel-query",
      []
    )
    this.models_ = config.models
    this.systemPrompt_ = config.systemPrompt || ""
    this.userPromptTemplate_ = config.userPromptTemplate || "{{ userQuery }}"
  }

  execute(
    ctx: WorkflowContext,
    _dependencies: ReadonlyMap<string, StageResult>
  ): Effect.Effect<StageResult<ParallelQueryOutput>, StageExecutionError> {
    const self = this
    return Effect.gen(function* () {
        const openRouter = ctx.services.openRouter
        const templates = ctx.services.templates

        // Extract user query from context (no dependencies for stage 1)
        const userQuery = ctx.userQuery

        // Render the user prompt template if provided
        let userPrompt = userQuery
        if (self.userPromptTemplate_ && self.userPromptTemplate_ !== userQuery) {
          userPrompt = yield* templates.render(self.userPromptTemplate_, {
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
        }

        // Build messages
        const messages: ChatMessage[] = []
        if (self.systemPrompt_) {
          messages.push({
            role: "system",
            content: self.systemPrompt_
          })
        }
        messages.push({
          role: "user",
          content: userPrompt
        })

        // Query all models in parallel
        const responses = yield* openRouter.queryModelsParallel(
          self.models_,
          messages
        )

        // Format results
        const queries: Array<{
          readonly model: string
          readonly response: string | null
          readonly reasoning?: unknown
        }> = []

        let successCount = 0
        let failureCount = 0

        for (const model of self.models_) {
          const response = responses[model]
          if (response) {
            successCount++
            queries.push({
              model,
              response: response.content,
              reasoning: response.reasoning_details
            })
          } else {
            failureCount++
            queries.push({
              model,
              response: null
            })
          }
        }

        if (successCount === 0) {
          return yield* Effect.fail(
            new StageExecutionError({
              stageId: self.id,
              message: "No models responded successfully"
            })
          )
        }

        return self.success({
          queries: queries as ReadonlyArray<{
            readonly model: string
            readonly response: string | null
            readonly reasoning?: unknown
          }>,
          successCount,
          failureCount
        })
      })
  }
}

/**
 * Factory function for creating ParallelQueryStage
 */
export function createParallelQueryStage(
  config: ParallelQueryConfig
): ParallelQueryStage {
  return new ParallelQueryStage(config)
}
