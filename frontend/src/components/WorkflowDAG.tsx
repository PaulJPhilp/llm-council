import { useCallback, useMemo, useState } from "react"
import ReactFlow, {
  Node,
  Edge,
  Controls,
  Background,
  useNodesState,
  useEdgesState,
} from "reactflow"
import "reactflow/dist/style.css"
import type { DAGNode, DAGEdge, WorkflowProgressEvent } from "../types"
import { DAGNodeComponent } from "./DAGNodeComponent"

interface WorkflowDAGProps {
  nodes: readonly DAGNode[]
  edges: readonly DAGEdge[]
  progressEvents: WorkflowProgressEvent[]
  onSelectNode?: (nodeId: string) => void
  selectedNodeId?: string
}

// Node status type
type NodeStatus = "pending" | "running" | "success" | "failed"

interface CustomNode extends Node {
  data: {
    label: string
    description?: string
    type: string
    status?: NodeStatus
    isSelected?: boolean
  }
}

export function WorkflowDAG({
  nodes: dagNodes,
  edges: dagEdges,
  progressEvents,
  onSelectNode,
  selectedNodeId,
}: WorkflowDAGProps) {
  // Convert DAG nodes to React Flow nodes
  const initialNodes: CustomNode[] = useMemo(
    () =>
      dagNodes.map((dagNode) => ({
        id: dagNode.id,
        type: "custom",
        position: dagNode.position,
        data: {
          label: dagNode.data.label,
          description: dagNode.data.description,
          type: dagNode.data.type,
          status: "pending" as NodeStatus,
          isSelected: dagNode.id === selectedNodeId,
        },
      })),
    [dagNodes, selectedNodeId]
  )

  // Convert DAG edges to React Flow edges
  const initialEdges: Edge[] = useMemo(
    () =>
      dagEdges.map((dagEdge) => ({
        id: dagEdge.id,
        source: dagEdge.source,
        target: dagEdge.target,
      })),
    [dagEdges]
  )

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes)
  const [edges, , onEdgesChange] = useEdgesState(initialEdges)

  // Update node statuses based on progress events
  const nodeStatuses = useMemo(() => {
    const statuses = new Map<string, NodeStatus>()

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
  }, [progressEvents])

  // Update nodes with status information
  const onInit = useCallback(() => {
    setNodes((prevNodes) =>
      prevNodes.map((node) => ({
        ...node,
        data: {
          ...node.data,
          status: nodeStatuses.get(node.id) || "pending",
          isSelected: node.id === selectedNodeId,
        },
      }))
    )
  }, [nodeStatuses, selectedNodeId, setNodes])

  // Call onInit once to update statuses
  useState(() => {
    onInit()
  })

  const nodeTypes = useMemo(
    () => ({
      custom: DAGNodeComponent,
    }),
    []
  )

  const handleNodeClick = (nodeId: string) => {
    if (onSelectNode) {
      onSelectNode(nodeId)
    }
  }

  return (
    <div style={{ width: "100%", height: "100%" }}>
      <ReactFlow
        nodes={nodes.map((node) => ({
          ...node,
          data: {
            ...node.data,
            onClick: () => handleNodeClick(node.id),
          },
        }))}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        nodeTypes={nodeTypes}
        fitView
      >
        <Background />
        <Controls />
      </ReactFlow>
    </div>
  )
}
