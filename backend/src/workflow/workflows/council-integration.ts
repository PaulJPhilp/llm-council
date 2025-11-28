/**
 * LLM Council Workflow Integration
 * Bridges workflow system with application services and configuration
 */

import { Effect } from "effect"
import type { WorkflowResult, ProgressCallback } from "../core/workflow"
import { executeWorkflow } from "../core/executor"
import { createLLMCouncilWorkflow } from "./llm-council"
import { createLiquidTemplateEngine } from "../core/template-engine"
import type { TemplateEngine } from "../core/template"
import type { WorkflowServices } from "../core/context"
import type { OpenRouterClient } from "../../openrouter"
import type { StorageService } from "../../storage"
import type { AppConfig } from "../../config"
import { StageExecutionError, WorkflowDefinitionError } from "../core/errors"

/**
 * Type for progress event callbacks during workflow execution
 * Maps to WorkflowProgressEvent from core workflow system
 */
export type WorkflowProgressCallback = ProgressCallback

/**
 * Execute the complete LLM Council workflow with application services
 *
 * @param userQuery The user's question to answer
 * @param openRouter OpenRouter client for LLM queries
 * @param storage Storage service for conversation persistence
 * @param config Application configuration
 * @param onProgress Optional callback for progress events
 * @returns Complete workflow execution result
 */
export const runFullCouncilWorkflow = (
  userQuery: string,
  openRouter: OpenRouterClient,
  storage: StorageService,
  config: AppConfig,
  onProgress?: WorkflowProgressCallback
): Effect.Effect<WorkflowResult, StageExecutionError | WorkflowDefinitionError> => {
  return Effect.gen(function* () {
    // Set up template engine
    const templates: TemplateEngine = createLiquidTemplateEngine()

    // Assemble services for workflow context
    const services: WorkflowServices = {
      openRouter,
      storage,
      config,
      templates
    }

    // Create workflow definition with configured models
    const workflow = createLLMCouncilWorkflow({
      councilModels: config.councilModels,
      chairmanModel: config.chairmanModel,
      systemPrompt:
        "You are a helpful, knowledgeable AI assistant. Provide clear, accurate, and thoughtful responses."
    })

    // Execute the workflow
    const result = yield* executeWorkflow(
      workflow,
      userQuery,
      services,
      onProgress
    )

    return result
  })
}

/**
 * Execute the LLM Council workflow with a custom progress handler
 * Useful for streaming results back to clients via SSE or WebSocket
 *
 * @param userQuery The user's question
 * @param openRouter OpenRouter client
 * @param storage Storage service
 * @param config Application configuration
 * @param onProgress Progress event handler
 * @returns Workflow result
 */
export const runFullCouncilWorkflowWithProgress = (
  userQuery: string,
  openRouter: OpenRouterClient,
  storage: StorageService,
  config: AppConfig,
  onProgress: WorkflowProgressCallback
): Effect.Effect<WorkflowResult, StageExecutionError | WorkflowDefinitionError> => {
  return runFullCouncilWorkflow(
    userQuery,
    openRouter,
    storage,
    config,
    onProgress
  )
}
