import type { StageResult } from "./stage"
import type { OpenRouterClient } from "../../openrouter"
import type { StorageService } from "../../storage"
import type { AppConfig } from "../../config"
import type { TemplateEngine } from "./template"
import { ExecutionContextError } from "./errors"
import { Effect } from "effect"

/**
 * Services available to stages during execution
 */
export interface WorkflowServices {
  readonly openRouter: OpenRouterClient
  readonly storage: StorageService
  readonly config: AppConfig
  readonly templates: TemplateEngine
}

/**
 * Execution context passed to stages
 * Contains user query, results from previous stages, and services
 */
export interface WorkflowContext {
  /**
   * Original user query
   */
  readonly userQuery: string

  /**
   * Results from previously executed stages
   * Maps stage ID to its result
   */
  readonly stageResults: ReadonlyMap<string, StageResult>

  /**
   * Arbitrary metadata accumulated during execution
   * Can be used to pass data between stages
   */
  readonly metadata: ReadonlyMap<string, unknown>

  /**
   * Services available to stages
   */
  readonly services: WorkflowServices
}

/**
 * Builder for constructing WorkflowContext
 * Allows incremental construction and updates
 */
export class WorkflowContextBuilder {
  private stageResults = new Map<string, StageResult>()
  private metadata = new Map<string, unknown>()

  constructor(
    private userQuery: string,
    private services: WorkflowServices
  ) {}

  /**
   * Add or update a stage result
   */
  withStageResult(stageId: string, result: StageResult): this {
    this.stageResults.set(stageId, result)
    return this
  }

  /**
   * Add or update metadata
   */
  withMetadata(key: string, value: unknown): this {
    this.metadata.set(key, value)
    return this
  }

  /**
   * Add multiple metadata entries
   */
  withMetadataMap(map: Record<string, unknown>): this {
    for (const [key, value] of Object.entries(map)) {
      this.metadata.set(key, value)
    }
    return this
  }

  /**
   * Build the context
   */
  build(): WorkflowContext {
    return {
      userQuery: this.userQuery,
      stageResults: new Map(this.stageResults),
      metadata: new Map(this.metadata),
      services: this.services
    }
  }
}

/**
 * Helper class for immutably updating a context
 * Used when running stages sequentially
 */
export class ContextUpdater {
  /**
   * Create a new context with additional stage result
   */
  static withStageResult(
    ctx: WorkflowContext,
    stageId: string,
    result: StageResult
  ): WorkflowContext {
    const stageResults = new Map(ctx.stageResults)
    stageResults.set(stageId, result)

    return {
      ...ctx,
      stageResults: new Map(stageResults)
    }
  }

  /**
   * Create a new context with additional metadata
   */
  static withMetadata(
    ctx: WorkflowContext,
    key: string,
    value: unknown
  ): WorkflowContext {
    const metadata = new Map(ctx.metadata)
    metadata.set(key, value)

    return {
      ...ctx,
      metadata
    }
  }

  /**
   * Get a stage result by ID, fail if not found
   */
  static getStageResult(
    ctx: WorkflowContext,
    stageId: string
  ): Effect.Effect<StageResult, ExecutionContextError> {
    return Effect.sync(() => {
      const result = ctx.stageResults.get(stageId)
      if (!result) {
        throw new ExecutionContextError({
          message: `Stage result not found: ${stageId}`,
          stageId
        })
      }
      return result
    })
  }

  /**
   * Get multiple stage results by IDs
   */
  static getStageResults(
    ctx: WorkflowContext,
    stageIds: readonly string[]
  ): Effect.Effect<ReadonlyMap<string, StageResult>, ExecutionContextError> {
    return Effect.sync(() => {
      const results = new Map<string, StageResult>()

      for (const stageId of stageIds) {
        const result = ctx.stageResults.get(stageId)
        if (!result) {
          throw new ExecutionContextError({
            message: `Stage result not found: ${stageId}`,
            stageId
          })
        }
        results.set(stageId, result)
      }

      return new Map(results)
    })
  }

  /**
   * Get metadata by key, with optional default
   */
  static getMetadata<T = unknown>(
    ctx: WorkflowContext,
    key: string,
    defaultValue?: T
  ): T | undefined {
    const value = ctx.metadata.get(key)
    return value !== undefined ? (value as T) : defaultValue
  }
}
