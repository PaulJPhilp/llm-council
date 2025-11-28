import { Handle, Position } from "reactflow"

type NodeStatus = "pending" | "running" | "success" | "failed"

interface DAGNodeComponentProps {
  data: {
    label: string
    description?: string
    type: string
    status?: NodeStatus
    isSelected?: boolean
    onClick?: () => void
  }
}

const statusColors: Record<NodeStatus, { bg: string; border: string; icon: string }> = {
  pending: {
    bg: "bg-gray-100",
    border: "border-gray-400",
    icon: "⏳",
  },
  running: {
    bg: "bg-yellow-100",
    border: "border-yellow-500",
    icon: "⟳",
  },
  success: {
    bg: "bg-green-100",
    border: "border-green-500",
    icon: "✓",
  },
  failed: {
    bg: "bg-red-100",
    border: "border-red-500",
    icon: "✗",
  },
}

export function DAGNodeComponent({
  data,
}: DAGNodeComponentProps) {
  const status = data.status || "pending"
  const colors = statusColors[status]
  const isSelected = data.isSelected || false

  return (
    <div
      onClick={data.onClick}
      className={`
        px-4 py-3 rounded-lg border-2 cursor-pointer transition-all
        ${colors.bg} ${colors.border}
        ${isSelected ? "ring-2 ring-primary ring-offset-2 shadow-lg" : "shadow-md"}
        hover:shadow-lg hover:border-opacity-100
        min-w-[140px]
      `}
      title={data.description}
    >
      <div className="flex items-center gap-2 justify-center">
        <span className="text-2xl">{colors.icon}</span>
        <div className="text-center">
          <div className="font-semibold text-sm text-gray-900">
            {data.label}
          </div>
          <div className="text-xs text-gray-600">{data.type}</div>
        </div>
      </div>

      <Handle type="target" position={Position.Top} />
      <Handle type="source" position={Position.Bottom} />
    </div>
  )
}
