import { useMemo } from "react"
import type { AssistantMessage, WorkflowDefinition, DAGRepresentation, WorkflowProgressEvent } from "../types"
import { WorkflowExecutionView } from "./WorkflowExecutionView"

interface WorkflowMessageRendererProps {
  message: AssistantMessage
  isLoading?: boolean
}

export function WorkflowMessageRenderer({
  message,
  isLoading = false,
}: WorkflowMessageRendererProps) {
  // Extract workflow metadata from message
  const workflowData = useMemo(() => {
    const metadata = message.metadata?.custom as Record<string, unknown> | undefined

    if (!metadata) {
      return null
    }

    return {
      workflowId: metadata.workflowId as string,
      nodes: metadata.nodes,
      edges: metadata.edges,
      stageResults: metadata.stageResults as Record<string, unknown>,
      progressEvents: metadata.progressEvents as unknown[],
    }
  }, [message.metadata])

  // If no workflow data, show the final response (v1 legacy format)
  if (!workflowData) {
    const finalResponse = message.stage3?.response || "No response available"
    return (
      <div className="p-4">
        <div className="prose prose-sm max-w-none">
          <div className="whitespace-pre-wrap text-sm text-foreground">
            {finalResponse}
          </div>
        </div>
      </div>
    )
  }

  // Create workflow definition from metadata
  const workflow: WorkflowDefinition & { dag: DAGRepresentation } = {
    id: workflowData.workflowId,
    name: "Workflow",
    version: "1.0.0",
    stages: [],
    dag: {
      nodes: Array.isArray(workflowData.nodes) ? workflowData.nodes : [],
      edges: Array.isArray(workflowData.edges) ? workflowData.edges : [],
    },
  }

  return (
    <div className="w-full h-96 border border-border rounded-lg overflow-hidden">
      {isLoading && (
        <div className="absolute inset-0 bg-background/50 flex items-center justify-center z-10">
          <div className="text-center">
            <div className="inline-block animate-spin">⟳</div>
            <p className="mt-2 text-sm text-muted-foreground">Executing workflow...</p>
          </div>
        </div>
      )}
      <WorkflowExecutionView
        workflow={workflow}
        progressEvents={(workflowData.progressEvents || []) as WorkflowProgressEvent[]}
        isExecuting={isLoading}
      />
    </div>
  )
}
