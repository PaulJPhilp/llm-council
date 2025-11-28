import { useEffect, useState } from "react"
import type { WorkflowMetadata } from "../types"
import { api } from "../api"

interface WorkflowSelectorProps {
  onSelectWorkflow: (workflowId: string) => void
  isLoading?: boolean
}

export function WorkflowSelector({
  onSelectWorkflow,
  isLoading = false,
}: WorkflowSelectorProps) {
  const [workflows, setWorkflows] = useState<WorkflowMetadata[]>([])
  const [selectedWorkflowId, setSelectedWorkflowId] = useState<string>("")
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadWorkflows()
  }, [])

  async function loadWorkflows() {
    try {
      setLoading(true)
      setError(null)
      const workflowList = await api.listWorkflows()
      setWorkflows(workflowList)
      if (workflowList.length > 0) {
        setSelectedWorkflowId(workflowList[0].id)
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to load workflows"
      )
    } finally {
      setLoading(false)
    }
  }

  function handleSelectWorkflow(workflowId: string) {
    setSelectedWorkflowId(workflowId)
    onSelectWorkflow(workflowId)
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 px-4 py-2">
        <div className="text-sm text-gray-500">Loading workflows...</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex items-center gap-2 px-4 py-2">
        <div className="text-sm text-red-600">{error}</div>
        <button
          onClick={loadWorkflows}
          className="text-xs bg-red-100 text-red-700 px-2 py-1 rounded hover:bg-red-200"
        >
          Retry
        </button>
      </div>
    )
  }

  if (workflows.length === 0) {
    return (
      <div className="flex items-center gap-2 px-4 py-2">
        <div className="text-sm text-gray-500">No workflows available</div>
      </div>
    )
  }

  return (
    <div className="flex items-center gap-2 px-4 py-2">
      <label htmlFor="workflow-select" className="text-sm font-medium">
        Workflow:
      </label>
      <select
        id="workflow-select"
        value={selectedWorkflowId}
        onChange={(e) => handleSelectWorkflow(e.target.value)}
        disabled={isLoading}
        className="flex-1 px-3 py-1 border border-gray-300 rounded-lg text-sm bg-white hover:border-gray-400 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {workflows.map((workflow) => (
          <option key={workflow.id} value={workflow.id}>
            {workflow.name} (v{workflow.version}) - {workflow.stageCount} stages
          </option>
        ))}
      </select>
    </div>
  )
}
