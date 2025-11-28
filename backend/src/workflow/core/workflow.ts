import type { Stage, StageResult } from "./stage"

/**
 * Configuration options for workflow execution
 */
export interface WorkflowConfig {
  /**
   * Overall timeout for entire workflow in milliseconds
   */
  readonly timeout?: number

  /**
   * Maximum number of retries for individual stages
   */
  readonly maxRetries?: number

  /**
   * Enable Server-Sent Events streaming of progress
   */
  readonly streamingEnabled?: boolean

  /**
   * Other custom configuration options
   */
  readonly [key: string]: unknown
}

/**
 * Complete workflow definition
 * Contains metadata and list of stages to execute
 */
export interface WorkflowDefinition {
  /**
   * Unique identifier for this workflow
   * Used to reference and select workflows
   */
  readonly id: string

  /**
   * Human-readable name for this workflow
   */
  readonly name: string

  /**
   * Semantic version of this workflow
   */
  readonly version: string

  /**
   * List of stages in this workflow
   * Stages can be in any order - execution order determined by dependencies
   */
  readonly stages: readonly Stage[]

  /**
   * Optional configuration for workflow execution
   */
  readonly config?: WorkflowConfig

  /**
   * Optional description of what this workflow does
   */
  readonly description?: string
}

/**
 * Result of executing a workflow
 * Contains all stage results and accumulated metadata
 */
export interface WorkflowResult {
  /**
   * ID of the workflow that was executed
   */
  readonly workflowId: string

  /**
   * Version of the workflow that was executed
   */
  readonly workflowVersion: string

  /**
   * Map of stage ID to its result
   */
  readonly stageResults: ReadonlyMap<string, StageResult>

  /**
   * Metadata accumulated during execution
   */
  readonly metadata: ReadonlyMap<string, unknown>

  /**
   * Total execution time in milliseconds
   */
  readonly executionTimeMs: number

  /**
   * ISO timestamp of when execution started
   */
  readonly startedAt: string

  /**
   * ISO timestamp of when execution completed
   */
  readonly completedAt: string
}

/**
 * Event emitted during workflow execution
 * Used for progress tracking and streaming
 */
export interface WorkflowProgressEvent {
  /**
   * Type of event: stage_start, stage_complete, stage_error, workflow_complete
   */
  readonly type: "stage_start" | "stage_complete" | "stage_error" | "workflow_complete"

  /**
   * ID of the stage (if applicable)
   */
  readonly stageId?: string

  /**
   * Stage data/result (if applicable)
   */
  readonly data?: unknown

  /**
   * Stage metadata (if applicable)
   */
  readonly metadata?: Record<string, unknown>

  /**
   * Error message (if type is stage_error)
   */
  readonly error?: string

  /**
   * Timestamp of this event
   */
  readonly timestamp: string
}

/**
 * Callback type for receiving workflow progress events
 */
export type ProgressCallback = (event: WorkflowProgressEvent) => void | Promise<void>

/**
 * Summary of workflow execution
 * Used for logging and monitoring
 */
export interface WorkflowExecutionSummary {
  readonly workflowId: string
  readonly workflowVersion: string
  readonly status: "success" | "failure"
  readonly totalDuration: number
  readonly stageCount: number
  readonly stagesCompleted: number
  readonly stagesFailed: number
  readonly error?: string
  readonly startedAt: string
  readonly completedAt: string
}
