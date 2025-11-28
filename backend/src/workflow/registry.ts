/**
 * Workflow Registry
 * Manages available workflows and converts them to DAG format for frontend visualization
 */

import type { WorkflowDefinition } from "./core/workflow"
import { createLLMCouncilWorkflow } from "./workflows/llm-council"

/**
 * Metadata about a workflow for listing/discovery
 */
export interface WorkflowMetadata {
  readonly id: string
  readonly name: string
  readonly version: string
  readonly description?: string
  readonly stageCount: number
}

/**
 * DAG node representation for React Flow visualization
 */
export interface DAGNode {
  readonly id: string
  readonly type: "stage"
  readonly data: {
    readonly label: string
    readonly description?: string
    readonly type: string
  }
  readonly position: { readonly x: number; readonly y: number }
}

/**
 * DAG edge representation for React Flow visualization
 */
export interface DAGEdge {
  readonly id: string
  readonly source: string
  readonly target: string
}

/**
 * Complete DAG representation
 */
export interface DAGRepresentation {
  readonly nodes: readonly DAGNode[]
  readonly edges: readonly DAGEdge[]
}

/**
 * Workflow Registry
 * Singleton managing all available workflows
 */
export class WorkflowRegistry {
  private workflows: Map<string, WorkflowDefinition> = new Map()

  constructor(
    councilModels: readonly string[] = [
      "openai/gpt-5.1",
      "google/gemini-3-pro-preview",
      "anthropic/claude-sonnet-4.5",
      "x-ai/grok-4",
    ],
    chairmanModel: string = "google/gemini-3-pro-preview"
  ) {
    this.registerDefaultWorkflows(councilModels, chairmanModel)
  }

  /**
   * Register default workflows
   */
  private registerDefaultWorkflows(
    councilModels: readonly string[],
    chairmanModel: string
  ): void {
    const llmCouncilWorkflow = createLLMCouncilWorkflow({
      councilModels,
      chairmanModel,
      systemPrompt:
        "You are a helpful, knowledgeable AI assistant. Provide clear, accurate, and thoughtful responses."
    })

    this.register(llmCouncilWorkflow)
  }

  /**
   * Register a new workflow
   */
  register(workflow: WorkflowDefinition): void {
    this.workflows.set(workflow.id, workflow)
  }

  /**
   * Get all registered workflows
   */
  list(): WorkflowMetadata[] {
    return Array.from(this.workflows.values()).map((w) => ({
      id: w.id,
      name: w.name,
      version: w.version,
      description: w.description,
      stageCount: w.stages.length
    }))
  }

  /**
   * Get a specific workflow by ID
   */
  get(id: string): WorkflowDefinition | undefined {
    return this.workflows.get(id)
  }

  /**
   * Convert a workflow to DAG representation for React Flow
   */
  toDAG(workflow: WorkflowDefinition): DAGRepresentation {
    // Calculate positions using topological sort + level-based layout
    const positions = this.calculatePositions(workflow)

    // Create DAG nodes from stages
    const nodes: DAGNode[] = workflow.stages.map((stage) => ({
      id: stage.id,
      type: "stage" as const,
      data: {
        label: stage.name,
        description: undefined,
        type: stage.type
      },
      position: positions.get(stage.id) || { x: 0, y: 0 }
    }))

    // Create DAG edges from dependencies
    const edges: DAGEdge[] = []
    let edgeId = 0

    for (const stage of workflow.stages) {
      for (const depId of stage.dependencies) {
        edges.push({
          id: `edge-${edgeId++}`,
          source: depId,
          target: stage.id
        })
      }
    }

    return { nodes, edges }
  }

  /**
   * Calculate node positions for DAG layout
   * Uses topological sort to determine levels, then spaces nodes horizontally
   */
  private calculatePositions(workflow: WorkflowDefinition): Map<string, { x: number; y: number }> {
    const positions = new Map<string, { x: number; y: number }>()

    const levels = new Map<string, number>() // stage id -> level

    // Find root nodes (no dependencies)
    const roots = workflow.stages.filter((s) => s.dependencies.length === 0)

    // BFS to assign levels
    const visited = new Set<string>()
    const queue: Array<[string, number]> = roots.map((r) => [r.id, 0])

    while (queue.length > 0) {
      const [stageId, level] = queue.shift()!

      if (visited.has(stageId)) continue
      visited.add(stageId)
      levels.set(stageId, level)

      // Find stages that depend on this one
      for (const stage of workflow.stages) {
        if (stage.dependencies.includes(stageId) && !visited.has(stage.id)) {
          queue.push([stage.id, level + 1])
        }
      }
    }

    // Group stages by level
    const stagesByLevel = new Map<number, string[]>()
    for (const [stageId, level] of levels) {
      if (!stagesByLevel.has(level)) {
        stagesByLevel.set(level, [])
      }
      stagesByLevel.get(level)!.push(stageId)
    }

    // Calculate positions
    const horizontalSpacing = 250 // pixels between stages horizontally
    const verticalSpacing = 150 // pixels between levels vertically

    for (const [level, stageIds] of stagesByLevel) {
      const y = level * verticalSpacing
      const totalWidth = (stageIds.length - 1) * horizontalSpacing
      const startX = -totalWidth / 2

      for (let i = 0; i < stageIds.length; i++) {
        const x = startX + i * horizontalSpacing
        positions.set(stageIds[i], { x, y })
      }
    }

    return positions
  }
}
