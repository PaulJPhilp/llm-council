import type { ReactNode } from "react"
import { ChevronRight, ChevronDown, Folder, CheckCircle2, XCircle, Loader2, Clock } from "lucide-react"
import { cn } from "@/lib/utils"

type NodeStatus = "pending" | "running" | "success" | "failed"

interface NodeFolderProps {
  nodeId: string
  label: string
  description?: string
  status: NodeStatus
  isSelected?: boolean
  hasChildren?: boolean
  isExpanded?: boolean
  onToggle?: () => void
  onClick?: () => void
  children?: ReactNode
  level?: number
}

const statusConfig: Record<NodeStatus, { icon: ReactNode; color: string; bgColor: string }> = {
  pending: {
    icon: <Clock className="h-3.5 w-3.5" />,
    color: "text-gray-600",
    bgColor: "bg-gray-50",
  },
  running: {
    icon: <Loader2 className="h-3.5 w-3.5 animate-spin" />,
    color: "text-yellow-600",
    bgColor: "bg-yellow-50",
  },
  success: {
    icon: <CheckCircle2 className="h-3.5 w-3.5" />,
    color: "text-green-600",
    bgColor: "bg-green-50",
  },
  failed: {
    icon: <XCircle className="h-3.5 w-3.5" />,
    color: "text-red-600",
    bgColor: "bg-red-50",
  },
}

export function NodeFolder({
  nodeId,
  label,
  description,
  status,
  isSelected = false,
  hasChildren = false,
  isExpanded = false,
  onToggle,
  onClick,
  children,
  level = 0,
}: NodeFolderProps) {
  const config = statusConfig[status]
  const indent = level * 16

  return (
    <div>
      <div
        className={cn(
          "flex items-center gap-1.5 px-2 py-1.5 rounded cursor-pointer transition-colors",
          "hover:bg-gray-100",
          isSelected && "bg-blue-50 border-l-2 border-blue-500",
          config.bgColor,
        )}
        style={{ paddingLeft: `${indent + 8}px` }}
        onClick={onClick}
      >
        {/* Expand/Collapse Icon */}
        {hasChildren ? (
          <button
            onClick={(e) => {
              e.stopPropagation()
              onToggle?.()
            }}
            className="p-0.5 hover:bg-gray-200 rounded"
          >
            {isExpanded ? (
              <ChevronDown className="h-3 w-3 text-gray-600" />
            ) : (
              <ChevronRight className="h-3 w-3 text-gray-600" />
            )}
          </button>
        ) : (
          <div className="w-4" /> // Spacer for alignment
        )}

        {/* Folder Icon */}
        <Folder className={cn("h-3.5 w-3.5", config.color)} />

        {/* Status Icon */}
        <span className={config.color}>{config.icon}</span>

        {/* Node Label */}
        <span className={cn("text-sm font-medium flex-1 truncate", config.color)}>
          {label}
        </span>

        {/* Description (optional) */}
        {description && (
          <span className="text-xs text-gray-500 truncate max-w-[200px]">
            {description}
          </span>
        )}
      </div>

      {/* Children (when expanded) */}
      {hasChildren && isExpanded && children && (
        <div className="ml-2">{children}</div>
      )}
    </div>
  )
}

