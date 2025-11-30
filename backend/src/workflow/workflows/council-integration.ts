/**
 * LLM Council Workflow Integration
 * Bridges workflow system with application services and configuration
 */

import { Effect, Either, Layer, Runtime } from "effect"
import type { WorkflowResult, ProgressCallback } from "../core/workflow"
import { executeWorkflow } from "../core/executor"
import { createLLMCouncilWorkflow } from "./llm-council"
import { createLiquidTemplateEngine } from "../core/template-engine"
import type { TemplateEngine } from "../core/template"
import type { WorkflowServices } from "../core/context"
import { OpenRouterClient } from "../../openrouter"
import { StorageService } from "../../storage"
import { AppConfig } from "../../config"
import { StageExecutionError, WorkflowDefinitionError } from "../core/errors"
import {
  withSpan,
  trackWorkflowExecution,
  logInfo,
  logError,
} from "../../observability"
import { ProductionRuntime } from "../../runtime"

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
  return withSpan(
    "workflow.execute",
    {
      "workflow.type": "llm-council",
      "workflow.query_length": userQuery.length,
    },
    Effect.gen(function* () {
      const startTime = Date.now();
      
      yield* logInfo("Workflow execution starting", {
        workflowType: "llm-council",
        queryLength: userQuery.length,
      });

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
      const result = yield* Effect.either(
        executeWorkflow(
          workflow,
          userQuery,
          services,
          onProgress
        )
      );

      const duration = Date.now() - startTime;

      if (Either.isLeft(result)) {
        yield* trackWorkflowExecution(workflow.id, duration, false);
        yield* logError("Workflow execution failed", result.left, {
          workflowId: workflow.id,
          duration,
        });
        return yield* Effect.fail(result.left);
      }

      yield* trackWorkflowExecution(workflow.id, duration, true);
      yield* logInfo("Workflow execution completed", {
        workflowId: workflow.id,
        duration,
        stageCount: workflow.stages.length,
      });

      return result.right;
    })
  )
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

/**
 * Execute the complete LLM Council workflow using production runtime
 * This uses the centralized production runtime instead of hardcoded layers
 */
export const executeCouncilWorkflow = (
  userQuery: string,
  onProgress?: WorkflowProgressCallback
): Promise<WorkflowResult> => {
  return Runtime.runPromise(ProductionRuntime)(
    Effect.gen(function* () {
      const openRouter = yield* OpenRouterClient
      const storage = yield* StorageService
      const config = yield* AppConfig

      const result = yield* runFullCouncilWorkflow(
        userQuery,
        openRouter,
        storage,
        config,
        onProgress
      )

      return result
    })
  )
}
