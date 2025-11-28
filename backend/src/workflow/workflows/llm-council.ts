/**
 * LLM Council Workflow Definition
 * Complete 3-stage workflow for collaborative LLM reasoning
 */

import type { WorkflowDefinition } from "../core/workflow"
import {
  createParallelQueryStage,
  createPeerRankingStage,
  createSynthesisStage
} from "../stages"

/**
 * Configuration for the LLM Council workflow
 */
export interface LLMCouncilConfig {
  /**
   * List of models that form the council (for stages 1 and 2)
   */
  readonly councilModels: readonly string[]

  /**
   * Model that synthesizes the final answer (stage 3)
   */
  readonly chairmanModel: string

  /**
   * Optional custom system prompt for parallel query stage
   */
  readonly systemPrompt?: string

  /**
   * Optional custom ranking prompt template for peer ranking stage
   */
  readonly rankingPromptTemplate?: string

  /**
   * Optional custom synthesis prompt template for synthesis stage
   */
  readonly synthesisPromptTemplate?: string
}

/**
 * Create the LLM Council workflow definition
 * Assembles the 3-stage workflow with configured models
 *
 * @param config Configuration with council and chairman models
 * @returns Complete workflow definition ready for execution
 */
export function createLLMCouncilWorkflow(
  config: LLMCouncilConfig
): WorkflowDefinition {
  return {
    id: "llm-council-v1",
    name: "LLM Council Workflow",
    version: "1.0.0",
    description:
      "Three-stage deliberation system where multiple LLMs collaborate with anonymized peer review",
    stages: [
      // Stage 1: Parallel queries to all council models
      createParallelQueryStage({
        models: config.councilModels,
        systemPrompt: config.systemPrompt
      }),

      // Stage 2: Anonymized peer ranking and evaluation
      createPeerRankingStage({
        models: config.councilModels,
        rankingPromptTemplate: config.rankingPromptTemplate
      }),

      // Stage 3: Final synthesis by chairman model
      createSynthesisStage({
        chairmanModel: config.chairmanModel,
        synthesisPromptTemplate: config.synthesisPromptTemplate
      })
    ],
    config: {
      timeout: 300000, // 5 minutes total timeout
      maxRetries: 1,
      streamingEnabled: true
    }
  }
}
