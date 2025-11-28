/**
 * Core workflow engine abstractions and types
 * Provides the foundation for building configurable multi-stage workflows
 */

// Error types
export * from "./errors"

// Stage interface and base class
export * from "./stage"

// Template engine abstractions
export * from "./template"
export { createLiquidTemplateEngine, liquidTemplateEngine } from "./template-engine"

// Workflow context and execution context
export * from "./context"

// Workflow definition and result types
export * from "./workflow"

// Executor for running workflows
export { executeWorkflow } from "./executor"
