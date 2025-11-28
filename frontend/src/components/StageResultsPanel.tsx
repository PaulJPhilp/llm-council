import { useState } from "react"

interface StagResult {
  id: string
  name: string
  data?: unknown
  error?: string
}

interface StageResultsPanelProps {
  stages: StagResult[]
  selectedStageId?: string
  onSelectStage?: (stageId: string) => void
}

export function StageResultsPanel({
  stages,
  selectedStageId,
  onSelectStage,
}: StageResultsPanelProps) {
  const [expandedStages, setExpandedStages] = useState<Set<string>>(
    new Set(selectedStageId ? [selectedStageId] : [])
  )

  const toggleStage = (stageId: string) => {
    const newExpanded = new Set(expandedStages)
    if (newExpanded.has(stageId)) {
      newExpanded.delete(stageId)
    } else {
      newExpanded.add(stageId)
    }
    setExpandedStages(newExpanded)
  }

  const handleSelectStage = (stageId: string) => {
    toggleStage(stageId)
    if (onSelectStage) {
      onSelectStage(stageId)
    }
  }

  if (stages.length === 0) {
    return (
      <div className="h-full flex items-center justify-center text-gray-500 p-4">
        <p>No stage results yet</p>
      </div>
    )
  }

  return (
    <div className="h-full overflow-y-auto bg-gray-50 border-l border-gray-200">
      <div className="p-4 space-y-2">
        <h3 className="font-semibold text-gray-900 text-sm uppercase tracking-wide">
          Stage Results
        </h3>

        {stages.map((stage) => (
          <div key={stage.id} className="border border-gray-200 rounded-lg overflow-hidden bg-white">
            <button
              onClick={() => handleSelectStage(stage.id)}
              className={`
                w-full px-4 py-3 flex items-center justify-between
                hover:bg-gray-100 transition-colors
                ${selectedStageId === stage.id ? "bg-blue-50" : ""}
              `}
            >
              <div className="flex items-center gap-2">
                <span className="text-lg">
                  {expandedStages.has(stage.id) ? "▼" : "▶"}
                </span>
                <div className="text-left">
                  <div className="font-medium text-sm text-gray-900">
                    {stage.name}
                  </div>
                  <div className="text-xs text-gray-500">
                    {stage.error ? "Error" : "Completed"}
                  </div>
                </div>
              </div>
              {stage.error && (
                <span className="text-red-600 text-sm">✗</span>
              )}
            </button>

            {expandedStages.has(stage.id) && (
              <div className="border-t border-gray-200 p-3 bg-gray-50">
                {stage.error ? (
                  <div className="text-sm text-red-700 font-mono bg-red-50 p-2 rounded">
                    {stage.error}
                  </div>
                ) : stage.data ? (
                  <details className="text-xs">
                    <summary className="cursor-pointer font-mono text-gray-600 hover:text-gray-900 mb-2">
                      JSON Output
                    </summary>
                    <pre className="bg-white p-2 rounded border border-gray-200 overflow-x-auto text-gray-700 whitespace-pre-wrap break-words">
                      {JSON.stringify(stage.data, null, 2)}
                    </pre>
                  </details>
                ) : (
                  <div className="text-xs text-gray-500">
                    No data available
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
