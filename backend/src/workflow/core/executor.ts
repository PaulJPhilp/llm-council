import { Effect, Graph, Option } from "effect"
import type { Stage, StageResult } from "./stage"
import type { WorkflowDefinition, WorkflowResult, WorkflowProgressEvent, ProgressCallback } from "./workflow"
import type { WorkflowContext, WorkflowServices } from "./context"
import { WorkflowContextBuilder, ContextUpdater } from "./context"
import { WorkflowDefinitionError, StageExecutionError } from "./errors"

/**
 * Build a directed graph of stages based on their dependencies
 * Nodes are stages, edges represent dependencies (A depends on B)
 */
function buildStageGraph(
  stages: readonly Stage[]
): Effect.Effect<Graph.DirectedGraph<Stage, string>, WorkflowDefinitionError> {
  return Effect.gen(function* () {
    // Create stage ID to stage map for lookup
    const stageMap = new Map<string, Stage>(stages.map((s) => [s.id, s]))

    // Validate all stages exist and have unique IDs
    if (stageMap.size !== stages.length) {
      return yield* Effect.fail(
        new WorkflowDefinitionError({
          message: "Workflow contains duplicate stage IDs"
        })
      )
    }

    // Validate all dependencies exist before building graph
    for (const stage of stages) {
      for (const depId of stage.dependencies) {
        if (!stageMap.has(depId)) {
          return yield* Effect.fail(
            new WorkflowDefinitionError({
              message: `Stage "${stage.id}" depends on unknown stage "${depId}"`,
              missingDependency: depId
            })
          )
        }
      }
    }

    // Build the graph
    const graph = yield* Effect.sync(() =>
      Graph.directed<Stage, string>((mutable) => {
        // Add all stages as nodes and track their indices
        const nodeMap = new Map<string, Graph.NodeIndex>()

        for (const stage of stages) {
          const nodeIndex = Graph.addNode(mutable, stage)
          nodeMap.set(stage.id, nodeIndex)
        }

        // Add edges for dependencies
        // Edge direction: FROM dependency TO dependent (so stage depends on its predecessors)
        for (const stage of stages) {
          const stageNodeIndex = nodeMap.get(stage.id)!

          for (const depId of stage.dependencies) {
            const depNodeIndex = nodeMap.get(depId)
            if (depNodeIndex !== undefined) {
              Graph.addEdge(mutable, depNodeIndex, stageNodeIndex, depId)
            }
          }
        }
      })
    )

    return graph
  })
}

/**
 * Execute a workflow with all its stages
 * Stages are executed in topological order based on dependencies
 */
export function executeWorkflow(
  workflow: WorkflowDefinition,
  userQuery: string,
  services: WorkflowServices,
  onProgress?: ProgressCallback
): Effect.Effect<WorkflowResult, StageExecutionError | WorkflowDefinitionError> {
  return Effect.gen(function* () {
    const startedAt = yield* Effect.sync(() => new Date().toISOString())
    const startTime = yield* Effect.sync(() => Date.now())

    // Validate workflow
    yield* validateWorkflow(workflow)

    // Build dependency graph
    const graph = yield* buildStageGraph(workflow.stages)

    // Check for cycles using Graph.isAcyclic
    const isCyclic = !Graph.isAcyclic(graph)
    if (isCyclic) {
      return yield* Effect.fail(
        new StageExecutionError({
          stageId: "workflow",
          message: "Workflow contains circular dependencies"
        })
      )
    }

    // Get topological order for execution using Graph.topo()
    const topoWalker = Graph.topo(graph)
    const executionOrder = Array.from(Graph.indices(topoWalker))

    // Initialize context
    let ctx = new WorkflowContextBuilder(userQuery, services).build()

    // Execute each stage in topological order
    for (const nodeIndex of executionOrder) {
      const stageOption = Graph.getNode(graph, nodeIndex)

      // Get stage data from node
      const stage = yield* Option.match(stageOption, {
        onNone: () =>
          Effect.fail(
            new StageExecutionError({
              stageId: "unknown",
              message: "Failed to retrieve stage from graph"
            })
          ),
        onSome: (s) => Effect.succeed(s)
      })

      // Emit stage start event
      yield* emitProgress(onProgress, {
        type: "stage_start",
        stageId: stage.id,
        timestamp: new Date().toISOString()
      })

      // Get results from dependency stages for input
      const dependencyResults = getDependencyResults(stage, ctx)

      // Execute the stage
      const result = yield* stage.execute(ctx, dependencyResults)

      // Update context with stage result
      ctx = ContextUpdater.withStageResult(ctx, stage.id, result)

      // Emit stage complete event
      yield* emitProgress(onProgress, {
        type: "stage_complete",
        stageId: stage.id,
        data: result.data,
        metadata: result.metadata,
        timestamp: new Date().toISOString()
      })
    }

    // Calculate execution time
    const endTime = yield* Effect.sync(() => Date.now())
    const executionTimeMs = endTime - startTime
    const completedAt = yield* Effect.sync(() => new Date().toISOString())

    // Emit workflow complete event
    yield* emitProgress(onProgress, {
      type: "workflow_complete",
      data: {
        stageCount: workflow.stages.length,
        executionTimeMs
      },
      timestamp: completedAt
    })

    return {
      workflowId: workflow.id,
      workflowVersion: workflow.version,
      stageResults: ctx.stageResults,
      metadata: ctx.metadata,
      executionTimeMs,
      startedAt,
      completedAt
    }
  })
}

/**
 * Get results from all dependency stages
 * Returns a map of dependency stage ID to its result
 */
function getDependencyResults(
  stage: Stage,
  ctx: WorkflowContext
): ReadonlyMap<string, StageResult> {
  const results = new Map<string, StageResult>()

  for (const depId of stage.dependencies) {
    const result = ctx.stageResults.get(depId)
    if (result) {
      results.set(depId, result)
    }
  }

  return new Map(results)
}

/**
 * Validate workflow definition
 */
function validateWorkflow(
  workflow: WorkflowDefinition
): Effect.Effect<void, WorkflowDefinitionError> {
  return Effect.gen(function* () {
    if (!workflow.id) {
      return yield* Effect.fail(
        new WorkflowDefinitionError({
          message: "Workflow must have an id"
        })
      )
    }

    if (!workflow.name) {
      return yield* Effect.fail(
        new WorkflowDefinitionError({
          message: "Workflow must have a name"
        })
      )
    }

    if (!workflow.version) {
      return yield* Effect.fail(
        new WorkflowDefinitionError({
          message: "Workflow must have a version"
        })
      )
    }

    if (!workflow.stages || workflow.stages.length === 0) {
      return yield* Effect.fail(
        new WorkflowDefinitionError({
          message: "Workflow must have at least one stage"
        })
      )
    }

    // Validate all stages
    yield* Effect.all(
      workflow.stages.map((stage) =>
        stage.validate().pipe(
          Effect.catchAll((error) =>
            Effect.fail(
              new WorkflowDefinitionError({
                message: `Stage validation failed: ${error.message}`
              })
            )
          )
        )
      ),
      { concurrency: "unbounded" }
    )
  })
}

/**
 * Emit a progress event to the callback if provided
 * Ignores any errors that occur during callback execution
 */
function emitProgress(
  callback: ProgressCallback | undefined,
  event: WorkflowProgressEvent
): Effect.Effect<void, never> {
  if (!callback) {
    return Effect.void
  }

  return Effect.tryPromise({
    try: () => Promise.resolve(callback(event)),
    catch: () => undefined // Ignore callback errors
  }).pipe(Effect.catchAll(() => Effect.void))
}
