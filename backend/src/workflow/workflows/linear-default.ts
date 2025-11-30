/**
 * Default Linear Workflow Definition
 * Strictly linear workflow with a single node at each level
 * Each stage depends on the previous stage, creating a simple chain
 */

import type { WorkflowDefinition } from "../core/workflow"
import { createSimpleQueryStage } from "../stages/simple-query"

/**
 * Configuration for the default linear workflow
 */
export interface LinearDefaultConfig {
  /**
   * List of models to use, one per stage
   * Each model will be used in sequence
   */
  readonly models: readonly string[]

  /**
   * Optional system prompt for all stages
   */
  readonly systemPrompt?: string

  /**
   * Optional custom prompt template for each stage
   * Can use {{ userQuery }} and {{ previousResults }}
   */
  readonly promptTemplate?: string
}

/**
 * Create the default linear workflow definition
 * Creates a strictly linear workflow with one node per level
 *
 * @param config Configuration with models and optional prompts
 * @returns Complete workflow definition ready for execution
 */
export function createLinearDefaultWorkflow(
  config: LinearDefaultConfig
): WorkflowDefinition {
  const stages = config.models.map((model, index) => {
    const stageId = `stage-${index + 1}`
    const stageName = `Stage ${index + 1}`
    
    // First stage has no dependencies, subsequent stages depend on previous
    const dependencies = index === 0 ? [] : [`stage-${index}`]

    return createSimpleQueryStage(
      stageId,
      stageName,
      {
        model,
        systemPrompt: config.systemPrompt,
        userPromptTemplate: config.promptTemplate
      },
      dependencies
    )
  })

  return {
    id: "linear-default",
    name: "Default Linear Workflow",
    version: "1.0.0",
    description:
      "Strictly linear workflow with a single node at each level. Each stage processes the output from the previous stage.",
    stages,
    config: {
      timeout: 300000, // 5 minutes total timeout
      maxRetries: 1,
      streamingEnabled: true
    }
  }
}

