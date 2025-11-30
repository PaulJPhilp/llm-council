import { Effect } from "effect"
import type { WorkflowContext } from "../core/context"
import { BaseStage, type StageResult } from "../core/stage"
import { StageExecutionError } from "../core/errors"
import type { ChatMessage } from "../../openrouter"

/**
 * Output from simple query stage
 * Contains response from a single model
 */
export interface SimpleQueryOutput {
  readonly model: string
  readonly response: string | null
  readonly reasoning?: unknown
}

/**
 * Configuration for simple query stage
 */
export interface SimpleQueryConfig {
  readonly model: string
  readonly systemPrompt?: string
  readonly userPromptTemplate?: string
}

/**
 * Stage that sends a query to a single model
 * Used for linear workflows with one node per level
 */
export class SimpleQueryStage extends BaseStage<
  ReadonlyMap<string, StageResult>,
  SimpleQueryOutput
> {
  private model_: string
  private systemPrompt_: string
  private userPromptTemplate_: string

  constructor(
    id: string,
    name: string,
    config: SimpleQueryConfig,
    dependencies: readonly string[] = []
  ) {
    super(id, name, "simple-query", dependencies)
    this.model_ = config.model
    this.systemPrompt_ = config.systemPrompt || ""
    this.userPromptTemplate_ = config.userPromptTemplate || "{{ userQuery }}"
  }

  execute(
    ctx: WorkflowContext,
    dependencies: ReadonlyMap<string, StageResult>
  ): Effect.Effect<StageResult<SimpleQueryOutput>, StageExecutionError> {
    const self = this
    return Effect.gen(function* () {
      const openRouter = ctx.services.openRouter
      const templates = ctx.services.templates

      // Get user query from context or from previous stage
      let userQuery = ctx.userQuery

      // If we have dependencies, use the last dependency's output
      // In a linear workflow, there should be exactly one dependency
      if (dependencies.size > 0) {
        // Get the first (and only) dependency result in a linear chain
        const depEntries = Array.from(dependencies.entries())
        const [depId, depResult] = depEntries[depEntries.length - 1]
        
        // Use the response from the previous stage as input
        if (depResult.data && typeof depResult.data === "object") {
          const prevOutput = depResult.data as SimpleQueryOutput
          if (prevOutput.response) {
            userQuery = prevOutput.response
          }
        }
      }

      // Render the user prompt template if provided
      let userPrompt = userQuery
      if (self.userPromptTemplate_ && self.userPromptTemplate_ !== userQuery) {
        userPrompt = yield* templates.render(self.userPromptTemplate_, {
          userQuery,
          previousResults: Array.from(dependencies.values())
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

      // Query the model
      const response = yield* openRouter
        .queryModel(self.model_, messages)
        .pipe(
          Effect.catchAll((error) =>
            Effect.fail(
              new StageExecutionError({
                stageId: self.id,
                message: `Failed to query model ${self.model_}: ${error.message}`,
                cause: error
              })
            )
          )
        )

      return self.success({
        model: self.model_,
        response: response?.content || null,
        reasoning: response?.reasoning_details
      })
    })
  }
}

/**
 * Factory function to create a simple query stage
 */
export function createSimpleQueryStage(
  id: string,
  name: string,
  config: SimpleQueryConfig,
  dependencies: readonly string[] = []
): SimpleQueryStage {
  return new SimpleQueryStage(id, name, config, dependencies)
}

