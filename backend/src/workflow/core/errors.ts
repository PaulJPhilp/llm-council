import { Data } from "effect"

/**
 * Base error for workflow execution
 */
export class WorkflowError extends Data.TaggedError("WorkflowError")<{
  readonly message: string
  readonly context?: Record<string, unknown>
}> {}

/**
 * Stage validation failed
 */
export class StageValidationError extends Data.TaggedError("StageValidationError")<{
  readonly stageId: string
  readonly message: string
  readonly field?: string
}> {}

/**
 * Stage execution failed
 */
export class StageExecutionError extends Data.TaggedError("StageExecutionError")<{
  readonly stageId: string
  readonly message: string
  readonly cause?: unknown
}> {}

/**
 * Workflow contains circular dependencies
 */
export class CycleDetectedError extends Data.TaggedError("CycleDetectedError")<{
  readonly message: string
  readonly stages?: string[]
}> {}

/**
 * Invalid workflow definition
 */
export class WorkflowDefinitionError extends Data.TaggedError("WorkflowDefinitionError")<{
  readonly message: string
  readonly missingDependency?: string
}> {}

/**
 * Template rendering failed
 */
export class TemplateError extends Data.TaggedError("TemplateError")<{
  readonly templateName: string
  readonly message: string
  readonly cause?: unknown
}> {}

/**
 * Aggregation failed
 */
export class AggregationError extends Data.TaggedError("AggregationError")<{
  readonly aggregatorId: string
  readonly message: string
  readonly cause?: unknown
}> {}

/**
 * Generic execution context error
 */
export class ExecutionContextError extends Data.TaggedError("ExecutionContextError")<{
  readonly message: string
  readonly stageId?: string
}> {}
