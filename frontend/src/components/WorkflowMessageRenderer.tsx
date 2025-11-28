import { useMemo } from "react"
import type { AssistantMessage } from "../types"
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

  // If no workflow data, show a fallback
  if (!workflowData) {
    return (
      <div className="flex items-center justify-center p-8 text-gray-500">
        <p>No workflow data available</p>
      </div>
    )
  }

  // Create workflow definition from metadata
  const workflow: any = {
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
    <div className="w-full h-96 border border-gray-200 rounded-lg overflow-hidden">
      {isLoading && (
        <div className="absolute inset-0 bg-white bg-opacity-50 flex items-center justify-center z-10">
          <div className="text-center">
            <div className="inline-block animate-spin">⟳</div>
            <p className="mt-2 text-sm text-gray-600">Executing workflow...</p>
          </div>
        </div>
      )}
      <WorkflowExecutionView
        workflow={workflow}
        progressEvents={workflowData.progressEvents as any}
        isExecuting={isLoading}
      />
    </div>
  )
}
