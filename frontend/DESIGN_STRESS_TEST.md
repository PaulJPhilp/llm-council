# Design Stress Test: Future Workflow Types

## Executive Summary

Our current design assumes **linear workflows with sequential levels**. Future workflow types (Graph, Statechart) will expose fundamental limitations in:

1. **Level concept** (becomes meaningless in arbitrary DAGs)
2. **Tree visualization** (inadequate for complex dependencies)
3. **State machine** (assumes linear progression)
4. **Dependency visualization** (not present)

**Good news**: With strategic changes now, we can support all three types without major rewrites.

---

## 1. Stress Test: What Breaks with Each Workflow Type

### 1.1 Linear Workflows (Current, v1)

```
Level 1: [Query-A] [Query-B] [Query-C]  (parallel)
    ↓
Level 2: [Rank-Response] (single node, stage gate)
    ↓
Level 3: [Synthesize] [Format] (parallel)
```

**Status**: ✅ Our design works well here.

---

### 1.2 Graph Workflows

```
        ┌──→ [Validate] ──→ [Enrich] ──┐
        │                              ↓
[Input] →→ [Parse] ──→ [Analyze] ──→ [Merge] ──→ [Output]
        │       ↘              ↙                ↗
        └───────→ [Summarize] ──────────────────┘
```

**Where it breaks**:

| Issue | Problem | Example |
|-------|---------|---------|
| **"Level" concept is undefined** | Nodes don't fit into sequential stages | Parse, Validate, and Summarize execute in parallel but at different "depths" |
| **"Open Level" button is ambiguous** | Which nodes belong to a level? | Should "Open Level 2" show Parse, Validate, and Summarize? |
| **Tree visualization is wrong** | Folder tree assumes sequential hierarchy | Can't show complex dependencies in a tree |
| **Dependency edges missing** | Can't see data flow relationships | Can't tell that Analyze input comes from both Parse and Validate |
| **One-at-a-time expansion fails** | Too many nodes to see full structure | Need to see multiple paths simultaneously |

**Example Failure**:
```
Current Tree (misleading):
├── Level 1
│   ├── Input
│   ├── Parse
│   └── Validate
├── Level 2
│   ├── Enrich
│   ├── Analyze
│   └── Summarize
└── Level 3
    ├── Merge
    ├── Output

Why wrong:
- Parse & Validate run parallel but shown in same "level"
- Can't see that Analyze waits for BOTH Parse and Validate
- Summarize is independent of Parse/Validate, not sequentially after
- No edges = no dependency visibility
```

---

### 1.3 Statechart Workflows

```
       ┌─────────────┐
       │   Idle      │
       │             │
       └────────┬────┘
                │ start()
                ↓
       ┌─────────────────┐
    ┌→ │  Processing     │ ─→ [process-task]
    │  │                 │
    │  └────────┬────────┘
    │           │ success
    │           ↓
    │  ┌─────────────────┐
    │  │  Validating     │ ─→ [validate-task]
    │  │                 │
    │  └────────┬────────┘
    │           │ failed
    │           ↓
    │  ┌─────────────────┐
    └──│  Retrying       │ ─→ [retry-task]
       │  (max 3x)       │
       └────────┬────────┘
                │ exhausted
                ↓
       ┌─────────────┐
       │   Failed    │
       │             │
       └─────────────┘
```

**Where it breaks**:

| Issue | Problem | Example |
|-------|---------|---------|
| **Loops in tree** | Tree can't represent cycles | Retry loops back to Processing; folder tree would be weird |
| **Conditional execution** | Nodes execute based on guards | Retrying only executes if failed=true; current model doesn't handle |
| **State machine transitions** | Node state isn't just pending→running→success | Node can go: pending→running→pending (retry) or running→failed→pending (retry) |
| **Skipped nodes** | Some nodes don't execute based on conditions | If condition="success", don't execute retry; current model lacks "skipped" state |
| **Guard conditions** | Need visibility into why paths taken | Why did we retry 3 times? What was the condition? |
| **Parallel states** | Statecharts support compound states | Not just "Processing", but "Processing.running + Validating.idle" |

**Example Failure**:
```
Current NodeExecution states:
- pending → running → success ✅
- pending → running → failed ✅

Statechart needs:
- pending → running → failed → pending (retry) ❌ (can't go back to pending)
- pending → skipped (condition=false) ❌ (no "skipped" state)
- pending → waiting_for_dependency ❌ (not modeled)

Tree visualization would be nightmarish:
├── Processing (node-a)
├── Validating (node-b)
├── Retrying (node-c) ← Can't show this loops back to Processing
```

---

## 2. Root Cause Analysis

### 2.1 Assumption 1: Sequential Levels

**Current Design**:
```typescript
interface Workflow {
  levels: Level[]  // Assumes sequential structure
  // ...
}

interface Level {
  nodes: Node[]  // Nodes in a level execute in parallel
  // ...
}
```

**Problem**: This assumes:
- Levels execute sequentially (no skipping, no looping)
- Nodes within a level are independent (no cross-level dependencies)
- Execution has a clear "front" that moves through levels

**Graph/Statechart Reality**:
- Nodes can depend on any other node (not just previous level)
- Execution can branch, loop, or skip nodes
- No clear sequential "front"

### 2.2 Assumption 2: Tree as Primary Visualization

**Current Design**:
```
├── Level 1
│   ├── Node A
│   ├── Node B
└── Level 2
    ├── Node C
```

**Problem**:
- Tree assumes parent-child hierarchy (sequential)
- Edges (dependencies) are implied by position
- Can't show arbitrary DAG dependencies
- Can't show cycles or complex routing

**Graph/Statechart Reality**:
- Dependencies are explicit edges, not implicit hierarchy
- Cycles and loops need edge visualization
- Conditional paths need labels/guards on edges

### 2.3 Assumption 3: Simple State Machine

**Current Design**:
```typescript
type NodeStatus = "pending" | "running" | "success" | "failed"
```

**Problem**:
- Assumes linear progression
- No intermediate states (waiting, skipped, retrying)
- No state machine semantics

**Graph/Statechart Reality**:
```
pending ──→ waiting_for_deps ──→ running ──→ success
                                    ↓         ↗
                                  failed ──→ skipped
                                    ↓
                                 retrying (loops back to pending)
```

---

## 3. Mitigation Strategy: Design Changes for Future Compatibility

### 3.1 Decouple from "Level" Concept

**Current (brittle)**:
```typescript
interface Workflow {
  levels: Level[]  // Sequential assumption baked in
}
```

**Future-proof**:
```typescript
interface Workflow {
  nodes: Node[]  // Just a list of nodes
  edges: Edge[]  // Explicit dependencies

  // Optional: hint to frontend about layout
  layout?: "linear" | "graph" | "statechart"

  // Optional: linear workflows can still provide levels
  // for simplified display
  levels?: Level[]  // Only for linear; frontend can ignore
}

interface Edge {
  from: string  // nodeId
  to: string    // nodeId
  condition?: string  // "success", guard expression, etc.
  label?: string      // "on success", "if failed", etc.
}
```

**Benefit**: Backend can describe any topology. Frontend adapts visualization.

---

### 3.2 Extend NodeExecution State Machine

**Current (linear)**:
```typescript
type NodeStatus = "pending" | "running" | "success" | "failed"
```

**Future-proof**:
```typescript
type NodeStatus =
  | "pending"            // Not yet started
  | "waiting_for_deps"   // Blocked on upstream nodes
  | "running"            // Currently executing
  | "success"            // Completed successfully
  | "failed"             // Execution failed
  | "retrying"           // In retry loop
  | "skipped"            // Skipped due to condition
  | "error_fatal"        // Failed with no retry

interface NodeExecution {
  nodeId: string
  status: NodeStatus
  attempts?: number        // For retry tracking
  nextRetryAt?: string     // For retry scheduling
  skipReason?: string      // Why was it skipped?
  blockingDeps?: string[]  // Which upstream nodes it's waiting for
  // ... rest of fields
}
```

**Benefit**: Supports retries, conditions, and complex state machines.

---

### 3.3 Add Dependency Visualization

**New in schema**:
```typescript
interface NodeExecution {
  // ... existing fields ...

  // Data dependency tracking
  inputs: {
    [paramName: string]: {
      source: string  // "input" | "node-X" | "level-Y"
      format: string  // "raw" | "aggregated" | "selected-field"
    }
  }

  outputs: {
    [paramName: string]: unknown
  }

  // Execution tracking
  startTime?: string
  endTime?: string
  duration?: number
}
```

**Frontend renders**:
- Edges showing data flow: Node-A.output → Node-B.input
- Hover on edge shows: "Processing output → Analysis input"

---

### 3.4 Flexible Visualization: From Tree to Graph

**Linear workflows** (v1):
```
Use current tree visualization
├── Level 1
│   ├── Node A
│   ├── Node B
└── Level 2
    └── Node C
```

**Graph workflows** (v2):
```
Switch to DAG visualization (React Flow)
A ──→ C
B ──→ C
    ↓
    D
```

**Statechart workflows** (v3):
```
Use state diagram rendering
[Idle] ──start()──→ [Processing] ──success──→ [Success]
                        ↓ failed
                    [Retrying] ──max attempts──→ [Failed]
```

**How to support all three**:
```typescript
// In backend response, hint at visualization type
interface Workflow {
  nodes: Node[]
  edges: Edge[]
  visualizationType: "tree" | "dag" | "statechart"
  // Optional layout info for frontend
  layout?: DAGLayout | StatechartLayout
}

// Frontend:
if (workflow.visualizationType === "tree") {
  return <TreeVisualization />
} else if (workflow.visualizationType === "dag") {
  return <DAGVisualization />  // React Flow
} else {
  return <StatechartVisualization />  // Custom or library
}
```

---

### 3.5 Adopt a Graph/DAG Library

**Current approach**: Custom tree component (limited).

**Problem**: Scaling to graphs and statecharts requires:
- Layout algorithms (dagre, ELK for DAGs)
- Edge rendering
- Zoom/pan for large diagrams
- Conditional edge labels

**Better approach**: Use a proven library for layout + rendering.

**Options**:

| Library | Pros | Cons | Best For |
|---------|------|------|----------|
| **React Flow** | Rich, interactive, good layout | Commercial license option | DAGs, workflows, visual builders |
| **Cytoscape.js** | Powerful graph algorithms | Steeper learning curve | Complex graphs, force-directed layouts |
| **Graphviz** | Industry standard layouts | Server-side rendering needed | Static diagrams |
| **Mermaid** | Simple syntax, good for diagrams | Limited interactivity | Documentation, simple flows |
| **OG Canvas** | Full control, lightweight | Manual layout algorithms | Custom, highly specialized |

**Recommendation for v1→v2 progression**:
- **v1**: Custom tree (no external deps)
- **v1→v2 transition**: Switch to **React Flow** for linear + graph support
- **v3**: Keep React Flow, add Statechart module

---

## 4. Implementation Plan to Minimize Risk

### Phase 1 (v1, Now): Prepare Backend + Frontend Model

**Backend changes**:
```typescript
// Change from levels-based to edge-based
interface Workflow {
  id: string
  nodes: Node[]      // No levels here
  edges: Edge[]      // Explicit dependencies

  // For v1, we can infer "levels" on the fly
  // or provide them as metadata for simplified display
  inferredLevels?: Level[]
  visualizationType: "tree"  // v1
}

interface Edge {
  from: string
  to: string
  condition?: string  // "success" for now
}
```

**Frontend changes**:
```typescript
// Update data model to use edges
interface Run {
  nodes: NodeExecution[]
  edges: Edge[]  // Explicit dependencies
}

// Still render as tree for v1, but be ready for graph rendering
const renderTree = (nodes, edges) => {
  // Can infer parent-child from edges for tree rendering
  // Or use workflow.inferredLevels if provided
}
```

**Effort**: Low. Mostly data model updates. Tree visualization unchanged.

---

### Phase 2 (v2): Support Graph Workflows

**Frontend changes**:
- Add React Flow library
- Implement DAG rendering
- Extend NodeStatus for waiting_for_deps, skipped
- Add Edge rendering with data flow labels

**Backend changes**:
- Support arbitrary node dependencies (already in edge model)
- Compute waiting_for_deps status
- Emit skipped events for conditional execution

**Effort**: Medium. New visualization component, state extensions.

---

### Phase 3 (v3): Support Statechart Workflows

**Frontend changes**:
- Add Statechart visualization library or custom renderer
- Support compound states, state machines
- Add retry visualization (loops, attempts)

**Backend changes**:
- Implement state machine semantics
- Track state transitions, retries, conditions
- Emit conditional edge traversals

**Effort**: High. Significant new visualization and state machine logic.

---

## 5. Concrete Actions to Take Now (v1)

To minimize future breaking changes, implement these **now**:

### 5.1 Backend: Change Data Model ✅ CRITICAL

```typescript
// Current (brittle)
interface Workflow {
  levels: Level[]
}

// New (flexible)
interface Workflow {
  nodes: Node[]
  edges: Edge[]
  visualizationType: "tree" | "dag" | "statechart"

  // Optional helper for v1 (linear workflows)
  levels?: Level[]
}

interface Edge {
  from: string
  to: string
  condition?: string
}

// Extend NodeExecution for future state machines
interface NodeExecution {
  nodeId: string
  status: "pending" | "running" | "success" | "failed" | "waiting_for_deps" | "skipped"
  blockingDeps?: string[]
  skipReason?: string
  attempts?: number
}
```

**Effort**: 2-4 hours. Affects backend API.
**Benefit**: Frontend can handle linear→graph→statechart without major changes.

---

### 5.2 Frontend: Model Based on Edges, Not Levels

```typescript
// Accept both, but normalize to edge-based model
const normalizeWorkflow = (workflow: Workflow) => {
  if (workflow.edges) {
    return workflow  // Already edge-based
  }

  // Infer edges from levels (backward compat for v1)
  const edges = inferEdgesFromLevels(workflow.levels)
  return { ...workflow, edges }
}

// Visualization decision
const getVisualization = (workflow: Workflow) => {
  if (workflow.visualizationType === "tree") {
    return <TreeViz />  // Current implementation
  } else if (workflow.visualizationType === "dag") {
    return <ReactFlowViz />  // Future
  } else {
    return <StatechartViz />  // Future
  }
}
```

**Effort**: 1-2 hours. Mostly refactoring existing tree component.
**Benefit**: Frontend is visualization-agnostic.

---

### 5.3 Prepare Library Migration Path

In package.json, add comments:

```json
{
  "dependencies": {
    // v1: Custom tree component
    // v2: Plan to migrate to react-flow for DAG visualization
    // Avoid tight coupling to custom tree in component props
  }
}
```

**Effort**: 0. Just a comment.
**Benefit**: Team is aware of migration plan.

---

### 5.4 Design Component Props Wisely

**Current (brittle)**:
```typescript
<RunTree workflow={workflow} run={run} />
// Component assumes workflow.levels exists
```

**Better**:
```typescript
<RunVisualization
  workflow={workflow}  // workflow.nodes, workflow.edges
  run={run}
  visualizationType={workflow.visualizationType}
/>
// Component accepts visualization type, adapts rendering
```

**Effort**: 1 hour. Component prop refactoring.
**Benefit**: Component can swap implementations (tree → React Flow) without prop changes.

---

## 6. Risks & Mitigations Summary

| Risk | Mitigation | Cost | When |
|------|-----------|------|------|
| Levels concept breaks in v2 | Use edge-based model now | 2-4 hrs | Phase 1 |
| Tree visualization inadequate for DAGs | Plan React Flow migration | 0 (design) + 8-16 hrs (v2) | Phase 1 (plan) + v2 (implement) |
| State machine too simple | Extend NodeStatus now | 1 hr | Phase 1 |
| Components tightly coupled to tree | Design flexible component API | 1 hr | Phase 1 |
| Need to rebuild visualizations | Library abstraction | 1-2 hrs | Phase 1 |

**Total effort now**: ~6-8 hours to future-proof design.
**Benefit**: v2 & v3 require 40% less refactoring.

---

## 7. Recommendation

### Do This Now (Before v1 Frontend Build):

1. ✅ Change backend to edge-based model (not level-based)
2. ✅ Extend NodeExecution state machine
3. ✅ Update frontend data model to use edges
4. ✅ Design component props to be visualization-agnostic
5. ✅ Add visualization type to workflow schema

### Defer to v2:

- React Flow integration (only needed when supporting DAGs)
- Complex edge labels and data flow visualization
- Retry/skipped node UI

### Defer to v3:

- Statechart rendering
- State machine semantics
- Loop/cycle visualization

---

## 8. Questions for Product

1. **Does v1 backend use edge-based model or levels?** → If levels, we need to change before frontend ships.
2. **Will v2 workflows be mixed with v1?** → If yes, backward compat is critical.
3. **Priority: Graph or Statechart first?** → Informs v2 visualization library choice.
4. **Can we afford a backend API change now?** → Risk/effort calculation depends on this.
