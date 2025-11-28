import { Effect } from "effect"
import type { WorkflowContext } from "./context"
import { StageValidationError, StageExecutionError } from "./errors"

/**
 * Result returned from stage execution
 */
export interface StageResult<T = unknown> {
  readonly data: T
  readonly metadata?: Record<string, unknown>
}

/**
 * Base interface for all workflow stages
 *
 * @template TInput - Type of input to this stage
 * @template TOutput - Type of output from this stage
 */
export interface Stage<TInput = unknown, TOutput = unknown> {
  /**
   * Unique identifier for this stage
   */
  readonly id: string

  /**
   * Human-readable name for this stage
   */
  readonly name: string

  /**
   * Type of stage (e.g., "parallel-query", "peer-ranking", "synthesis")
   */
  readonly type: string

  /**
   * IDs of stages this stage depends on
   * Used to build execution DAG
   */
  readonly dependencies: readonly string[]

  /**
   * Execute this stage within a workflow context
   */
  execute(
    ctx: WorkflowContext,
    input: TInput
  ): Effect.Effect<StageResult<TOutput>, StageExecutionError>

  /**
   * Validate stage configuration
   */
  validate(): Effect.Effect<void, StageValidationError>

  /**
   * Optional: custom event prefix for SSE streaming
   * Default: stage.id
   */
  readonly streamEventPrefix?: string
}

/**
 * Base class for implementing stages
 * Provides common validation and helper methods
 *
 * @template TInput - Type of input to this stage
 * @template TOutput - Type of output from this stage
 */
export abstract class BaseStage<TInput = unknown, TOutput = unknown> implements Stage<TInput, TOutput> {
  constructor(
    readonly id: string,
    readonly name: string,
    readonly type: string,
    readonly dependencies: readonly string[] = [],
    readonly streamEventPrefix?: string
  ) {}

  /**
   * Execute the stage - must be implemented by subclasses
   */
  abstract execute(
    ctx: WorkflowContext,
    input: TInput
  ): Effect.Effect<StageResult<TOutput>, StageExecutionError>

  /**
   * Default validation - checks required fields
   * Can be overridden by subclasses for custom validation
   */
  validate(): Effect.Effect<void, StageValidationError> {
    return Effect.sync(() => {
      if (!this.id) {
        throw new StageValidationError({
          stageId: this.id,
          message: "Stage must have an id",
          field: "id"
        })
      }

      if (!this.name) {
        throw new StageValidationError({
          stageId: this.id,
          message: "Stage must have a name",
          field: "name"
        })
      }

      if (!this.type) {
        throw new StageValidationError({
          stageId: this.id,
          message: "Stage must have a type",
          field: "type"
        })
      }
    })
  }

  /**
   * Helper to wrap stage execution with error handling
   */
  protected executeWithErrorHandling<A>(
    effect: Effect.Effect<StageResult<A>, StageExecutionError>
  ): Effect.Effect<StageResult<A>, StageExecutionError> {
    return effect.pipe(
      Effect.catchAll((error) => {
        // Already a StageExecutionError
        if (error._tag === "StageExecutionError") {
          return Effect.fail(error)
        }

        // Wrap other errors
        return Effect.fail(
          new StageExecutionError({
            stageId: this.id,
            message: error instanceof Error ? error.message : String(error),
            cause: error
          })
        )
      })
    )
  }

  /**
   * Helper to create successful stage results
   */
  protected success<A>(data: A, metadata?: Record<string, unknown>): StageResult<A> {
    return { data, metadata }
  }
}

/**
 * Metadata about a stage for registry/discovery
 */
export interface StageMetadata {
  readonly type: string
  readonly name: string
  readonly description?: string
  readonly supportsParallel?: boolean
  readonly supportsAnonymization?: boolean
}

/**
 * Factory function type for creating stages
 */
export type StageFactory<T extends Stage = Stage> = (
  config: Record<string, unknown>
) => Effect.Effect<T, StageValidationError>
