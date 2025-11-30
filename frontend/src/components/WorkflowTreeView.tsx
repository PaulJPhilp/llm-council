import { useMemo, useState } from "react"
import type { ReactNode } from "react"
import type { DAGNode, DAGEdge, WorkflowProgressEvent } from "../types"
import { NodeFolder } from "./NodeFolder"

type NodeStatus = "pending" | "running" | "success" | "failed"

interface WorkflowTreeViewProps {
  nodes: readonly DAGNode[]
  edges: readonly DAGEdge[]
  progressEvents: readonly WorkflowProgressEvent[]
  selectedNodeId?: string
  onSelectNode?: (nodeId: string) => void
}

interface TreeNode {
  id: string
  label: string
  description?: string
  status: NodeStatus
  level: number
  children: TreeNode[]
}

export function WorkflowTreeView({
  nodes,
  edges,
  progressEvents,
  selectedNodeId,
  onSelectNode,
}: WorkflowTreeViewProps) {
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set())

  // Calculate node statuses from progress events
  const nodeStatuses = useMemo(() => {
    const statuses = new Map<string, NodeStatus>()

    // Initialize all nodes as pending
    for (const node of nodes) {
      statuses.set(node.id, "pending")
    }

    // Update statuses based on progress events
    for (const event of progressEvents) {
      if (event.type === "stage_start" && event.stageId) {
        statuses.set(event.stageId, "running")
      } else if (event.type === "stage_complete" && event.stageId) {
        statuses.set(event.stageId, "success")
      } else if (event.type === "error" && event.stageId) {
        statuses.set(event.stageId, "failed")
      }
    }

    return statuses
  }, [nodes, progressEvents])

  // Build tree structure from DAG
  const treeStructure = useMemo(() => {
    // Find root nodes (nodes with no incoming edges)
    const incomingEdges = new Map<string, string[]>()
    for (const edge of edges) {
      if (!incomingEdges.has(edge.target)) {
        incomingEdges.set(edge.target, [])
      }
      incomingEdges.get(edge.target)!.push(edge.source)
    }

    const rootNodeIds = nodes
      .map((n) => n.id)
      .filter((id) => !incomingEdges.has(id))

    // Build adjacency list for children
    const childrenMap = new Map<string, string[]>()
    for (const edge of edges) {
      if (!childrenMap.has(edge.source)) {
        childrenMap.set(edge.source, [])
      }
      childrenMap.get(edge.source)!.push(edge.target)
    }

    // Create node lookup
    const nodeMap = new Map<string, DAGNode>()
    for (const node of nodes) {
      nodeMap.set(node.id, node)
    }

    // Recursive function to build tree
    function buildTree(nodeId: string, level: number): TreeNode {
      const node = nodeMap.get(nodeId)!
      const children = childrenMap.get(nodeId) || []
      const status = nodeStatuses.get(nodeId) || "pending"

      return {
        id: nodeId,
        label: node.data.label,
        description: node.data.description,
        status,
        level,
        children: children.map((childId) => buildTree(childId, level + 1)),
      }
    }

    // Build trees from all root nodes
    return rootNodeIds.map((rootId) => buildTree(rootId, 0))
  }, [nodes, edges, nodeStatuses])

  const toggleNode = (nodeId: string) => {
    setExpandedNodes((prev) => {
      const next = new Set(prev)
      if (next.has(nodeId)) {
        next.delete(nodeId)
      } else {
        next.add(nodeId)
      }
      return next
    })
  }

  const renderTreeNode = (node: TreeNode): ReactNode => {
    const isExpanded = expandedNodes.has(node.id)
    const hasChildren = node.children.length > 0

    return (
      <NodeFolder
        key={node.id}
        nodeId={node.id}
        label={node.label}
        description={node.description}
        status={node.status}
        isSelected={node.id === selectedNodeId}
        hasChildren={hasChildren}
        isExpanded={isExpanded}
        onToggle={() => toggleNode(node.id)}
        onClick={() => onSelectNode?.(node.id)}
        level={node.level}
      >
        {hasChildren && isExpanded && (
          <div>
            {node.children.map((child) => renderTreeNode(child))}
          </div>
        )}
      </NodeFolder>
    )
  }

  if (treeStructure.length === 0) {
    return (
      <div className="flex items-center justify-center p-8 text-gray-500">
        <p>No workflow nodes to display</p>
      </div>
    )
  }

  return (
    <div className="w-full h-full overflow-y-auto p-2 bg-white">
      {treeStructure.map((root) => renderTreeNode(root))}
    </div>
  )
}

