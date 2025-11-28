import { useEffect, useState } from "react"
import type { WorkflowDefinition, WorkflowProgressEvent } from "../types"
import { WorkflowDAG } from "./WorkflowDAG"
import { StageResultsPanel } from "./StageResultsPanel"

interface WorkflowExecutionViewProps {
  workflow: WorkflowDefinition & { dag: { nodes: any[]; edges: any[] } }
  progressEvents: WorkflowProgressEvent[]
  isExecuting?: boolean
  onSelectStage?: (stageId: string) => void
}

interface StageResult {
  id: string
  name: string
  data?: unknown
  error?: string
}

export function WorkflowExecutionView({
  workflow,
  progressEvents,
  isExecuting = false,
  onSelectStage,
}: WorkflowExecutionViewProps) {
  const [selectedNodeId, setSelectedNodeId] = useState<string | undefined>()
  const [stageResults, setStageResults] = useState<StageResult[]>([])

  // Build stage results from workflow stages and progress events
  useEffect(() => {
    const results: StageResult[] = workflow.stages.map((stage) => ({
      id: stage.id,
      name: stage.name,
    }))

    // Update with progress event data
    for (const event of progressEvents) {
      if (event.type === "stage_complete" && event.stageId && event.data) {
        const resultIndex = results.findIndex((r) => r.id === event.stageId)
        if (resultIndex >= 0) {
          results[resultIndex].data = event.data
        }
      } else if (event.type === "error" && event.stageId && event.message) {
        const resultIndex = results.findIndex((r) => r.id === event.stageId)
        if (resultIndex >= 0) {
          results[resultIndex].error = event.message
        }
      }
    }

    setStageResults(results)
  }, [workflow.stages, progressEvents])

  const handleSelectNode = (nodeId: string) => {
    setSelectedNodeId(nodeId)
    if (onSelectStage) {
      onSelectStage(nodeId)
    }
  }

  const handleSelectStage = (stageId: string) => {
    setSelectedNodeId(stageId)
    if (onSelectStage) {
      onSelectStage(stageId)
    }
  }

  return (
    <div className="flex h-full gap-0">
      {/* DAG Visualization - Takes majority of space */}
      <div className="flex-1 min-w-0 bg-white">
        {isExecuting && (
          <div className="absolute top-4 right-4 bg-blue-100 text-blue-800 px-3 py-1 rounded-full text-xs font-medium">
            Executing...
          </div>
        )}
        <WorkflowDAG
          nodes={workflow.dag.nodes}
          edges={workflow.dag.edges}
          progressEvents={progressEvents}
          onSelectNode={handleSelectNode}
          selectedNodeId={selectedNodeId}
        />
      </div>

      {/* Stage Results Panel - Fixed width sidebar */}
      <div className="w-80 border-l border-gray-200">
        <StageResultsPanel
          stages={stageResults}
          selectedStageId={selectedNodeId}
          onSelectStage={handleSelectStage}
        />
      </div>
    </div>
  )
}
