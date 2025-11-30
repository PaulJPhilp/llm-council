import { useEffect, useState } from "react"
import type { WorkflowDefinition, WorkflowProgressEvent, DAGRepresentation } from "../types"
import { WorkflowDAG } from "./WorkflowDAG"
import { WorkflowTreeView } from "./WorkflowTreeView"
import { StageResultsPanel } from "./StageResultsPanel"
import { Button } from "./ui/button"
import { LayoutGrid, FolderTree } from "lucide-react"

interface WorkflowExecutionViewProps {
  workflow: WorkflowDefinition & { dag: DAGRepresentation }
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

type ViewMode = "tree" | "dag"

export function WorkflowExecutionView({
  workflow,
  progressEvents,
  isExecuting = false,
  onSelectStage,
}: WorkflowExecutionViewProps) {
  const [selectedNodeId, setSelectedNodeId] = useState<string | undefined>()
  const [stageResults, setStageResults] = useState<StageResult[]>([])
  const [viewMode, setViewMode] = useState<ViewMode>("tree")

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
    <div className="flex h-full gap-0 flex-col">
      {/* View Mode Toggle */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-border bg-muted/50">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-foreground">View:</span>
          <div className="flex gap-1">
            <Button
              variant={viewMode === "tree" ? "default" : "outline"}
              size="sm"
              onClick={() => setViewMode("tree")}
              className="h-7 px-3 text-xs"
            >
              <FolderTree className="h-3 w-3 mr-1.5" />
              Tree
            </Button>
            <Button
              variant={viewMode === "dag" ? "default" : "outline"}
              size="sm"
              onClick={() => setViewMode("dag")}
              className="h-7 px-3 text-xs"
            >
              <LayoutGrid className="h-3 w-3 mr-1.5" />
              DAG
            </Button>
          </div>
        </div>
        {isExecuting && (
          <div className="bg-primary/10 text-primary px-3 py-1 rounded-full text-xs font-medium">
            Executing...
          </div>
        )}
      </div>

      <div className="flex flex-1 gap-0 overflow-hidden">
        {/* Main Visualization Area */}
        <div className="flex-1 min-w-0 bg-background relative">
          {viewMode === "tree" ? (
            <WorkflowTreeView
              nodes={workflow.dag.nodes}
              edges={workflow.dag.edges}
              progressEvents={progressEvents}
              selectedNodeId={selectedNodeId}
              onSelectNode={handleSelectNode}
            />
          ) : (
            <WorkflowDAG
              nodes={workflow.dag.nodes}
              edges={workflow.dag.edges}
              progressEvents={progressEvents}
              onSelectNode={handleSelectNode}
              selectedNodeId={selectedNodeId}
            />
          )}
        </div>

        {/* Stage Results Panel - Fixed width sidebar */}
        <div className="w-80 border-l border-border">
          <StageResultsPanel
            stages={stageResults}
            selectedStageId={selectedNodeId}
            onSelectStage={handleSelectStage}
          />
        </div>
      </div>
    </div>
  )
}
