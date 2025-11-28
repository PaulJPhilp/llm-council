# Architecture Document: Ensemble Workflow UI

## 1. System Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                     React Frontend (Vite)                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐           │
│  │  Workflow    │  │  DAG         │  │  Node Detail │           │
│  │  Selector    │  │  Visualizer  │  │  Pane        │           │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘           │
│         │                 │                  │                   │
│         └─────────────────┼──────────────────┘                   │
│                           │                                      │
│         ┌─────────────────▼──────────────┐                       │
│         │  Workflow State Management     │                       │
│         │  (React Context + Hooks)       │                       │
│         └─────────────────┬──────────────┘                       │
│                           │                                      │
│         ┌─────────────────▼──────────────┐                       │
│         │  API Client Layer              │                       │
│         │  (fetch + SSE/WebSocket)       │                       │
│         └─────────────────┬──────────────┘                       │
└─────────────────────────────────────────────────────────────────┘
                             │
                    ┌────────▼────────┐
                    │  Backend API    │
                    │  (Hono Server)  │
                    │  Port 8001      │
                    └─────────────────┘
                             │
         ┌───────────────────┼───────────────────┐
         │                   │                   │
    ┌────▼─────┐  ┌──────────▼────────┐  ┌─────▼──────┐
    │ Workflow  │  │  Workflow Module  │  │  External  │
    │ Definitions│  │  (executor, core) │  │  LLM APIs  │
    └──────────┘  └───────────────────┘  └────────────┘
```

## 2. Data Model

### 2.1 Core Types

```typescript
// Workflow definition (DAG-based)
interface Workflow {
  id: string
  name: string
  description: string
  version: string
  inputSchema: JSONSchema
  nodes: Node[]        // List of all nodes
  edges: Edge[]        // Directed connections (parent -> child)
  visualizationType: "dag" // v1 uses DAG visualization
}

// Node (atomic task definition)
interface Node {
  id: string
  name: string
  type: string // "query", "rank", "synthesize", etc.
  input: NodeInput
  metadata: Record<string, unknown>
}

// Edge (dependency connection)
interface Edge {
  from: string         // Node ID (parent)
  to: string           // Node ID (child)
  condition?: string   // Optional: "success", guard expression, etc.
  label?: string       // Optional: Display label for the edge
}

// Run execution instance
interface Run {
  id: string
  workflowId: string
  createdAt: string
  status: "pending" | "running" | "completed" | "failed"
  input: Record<string, unknown>
  nodeExecutions: NodeExecution[]
  metadata: {
    title?: string
    duration?: number
    error?: string
  }
}

// Individual node execution within a run
interface NodeExecution {
  id: string
  nodeId: string
  status: "pending" | "running" | "success" | "failed" | "waiting_for_deps" | "skipped"
  startTime?: string
  endTime?: string
  duration?: number
  input: Record<string, unknown>
  output?: Record<string, unknown>
  error?: {
    message: string
    code: string
    suggestedActions: string[]
  }
  // Dependency tracking
  blockingDeps?: string[]      // Node IDs this execution is waiting for
  skipReason?: string          // Why was this skipped (if status === "skipped")
  attempts?: number            // Number of execution attempts (for retries)
}

// Frontend-specific run state
interface RunState {
  run: Run
  workflowDefinition: Workflow
  selectedNodeId?: string              // Currently selected node (for detail pane)
  isLive: boolean                      // Still executing
  connectionStatus: "connected" | "disconnected" | "reconnecting"
  dagLayout?: Record<string, {x: number, y: number}> // Computed node positions
}
```

### 2.2 Backend API Contracts

**1. Get Available Workflows**
```
GET /api/workflows
Response: Workflow[]
```

**2. Get Workflow Details**
```
GET /api/workflows/:id
Response: Workflow
```

**3. Create Run (Start Execution)**
```
POST /api/workflows/:id/runs
Body: { input: Record<string, unknown> }
Response: { runId: string }
```

**4. Get Run Details (Read-Only)**
```
GET /api/runs/:id
Response: Run
```

**5. List Runs**
```
GET /api/runs?limit=50&offset=0
Response: { runs: Run[], total: number }
```

**6. Subscribe to Run Execution (SSE)**
```
GET /api/runs/:id/stream
Response: Server-Sent Events
Event Types:
  - "execution-start" → { nodeId, levelId, timestamp }
  - "node-update" → { nodeId, status, output?, error? }
  - "level-complete" → { levelId, timestamp }
  - "execution-complete" → { runId, status, duration }
```

## 3. Frontend Architecture

### 3.1 Component Hierarchy

```
App
├── Layout
│   ├── Sidebar (Historical Runs)
│   │   └── RunList
│   │       └── RunListItem[] (clickable past runs)
│   │
│   ├── Header
│   │   ├── WorkflowSelector (dropdown)
│   │   └── RunMetadata (title, status, timing)
│   │
│   └── MainContent
│       ├── WorkflowSubmissionView (if no run active)
│       │   ├── WorkflowDescription
│       │   └── InputForm
│       │
│       └── RunExecutionView (when run is active)
│           ├── DAGContainer (React Flow)
│           │   ├── DAGVisualization
│           │   │   ├── Node[] (interactive cards)
│           │   │   │   ├── Status icon + color
│           │   │   │   ├── Node label
│           │   │   │   └── Click handler → select node
│           │   │   │
│           │   │   ├── Edge[] (visual connections)
│           │   │   │   ├── Directed arrows
│           │   │   │   └── Optional labels
│           │   │   │
│           │   │   └── Controls (pan, zoom, fit-to-view)
│           │   │
│           │   └── StatusBar (overall progress)
│           │
│           └── DetailPane (right side, panel)
│               ├── NodeDetailsView (when node selected)
│               │   ├── Node name & type
│               │   ├── Status & timing
│               │   ├── Parent nodes (clickable)
│               │   ├── Child nodes (clickable)
│               │   ├── InputSpec
│               │   ├── OutputResults
│               │   ├── ErrorDetails
│               │   └── SuggestedActions
│               │
│               └── RunSummary (when no node selected)
```

### 3.2 State Management Strategy

**Approach**: React Context + Hooks (no Redux/Zustand for v1)

```typescript
// Main workflow context
interface WorkflowContextType {
  // Current run state
  currentRun: Run | null
  workflow: Workflow | null

  // UI state
  selectedNodeId: string | null    // Node selected for detail pane

  // Connection state
  connectionStatus: "connected" | "disconnected" | "reconnecting"

  // Actions
  selectWorkflow: (workflowId: string) => void
  startRun: (input: Record<string, unknown>) => Promise<void>
  selectNode: (nodeId: string) => void              // Click on DAG node
  navigateToParentNode: (nodeId: string) => void   // Click parent in detail pane
  navigateToChildNode: (nodeId: string) => void    // Click child in detail pane
  loadHistoricalRun: (runId: string) => void
}

// Custom hooks
useWorkflow() → WorkflowContextType
useRunExecution(runId) → { run, subscribe, unsubscribe }
useNodeDetails(nodeId) → { node, execution, parents, children, formatted }
useDAGLayout(nodes, edges) → Record<string, {x: number, y: number}>
```

### 3.3 Key Components (Detailed)

#### DAGVisualization (React Flow)
Main component rendering the DAG using React Flow library.

```typescript
interface DAGVisualizationProps {
  run: Run
  workflow: Workflow
  selectedNodeId?: string
  onSelectNode: (nodeId: string) => void
}

// Implementation details:
// 1. Converts workflow.nodes → React Flow nodes
// 2. Converts workflow.edges → React Flow edges
// 3. Compute layout using dagre algorithm
// 4. Update node colors based on nodeExecutions
// 5. Handle node click → onSelectNode
// 6. Pan/zoom controls for navigation
// 7. Real-time node updates via SSE subscription
```

#### DAGNode (React Flow Custom Node)
Interactive node component within the DAG graph.

```typescript
interface DAGNodeProps {
  data: {
    label: string
    status: NodeExecutionStatus
    isSelected: boolean
  }
  selected: boolean
}

// Visual representation:
// - Status color (gray/yellow/green/red)
// - Status icon (hourglass/spinner/check/x)
// - Node label/name
// - Border highlight if selected
// - Click handler calls React Flow selection
```

#### DAGEdge (React Flow Custom Edge)
Visual connection between nodes showing dependencies.

```typescript
// Shows:
// - Directed arrow from parent → child
// - Optional label on edge (if provided)
// - Color may indicate data flow or status
// - Smooth curved paths for readability
```

#### DetailPane
Shows detailed information about selected node or run summary.

```typescript
interface DetailPaneProps {
  selectedNodeId?: string
  run: Run
  workflow: Workflow
  onSelectNode: (nodeId: string) => void
}

// Content based on state (all nodes show):
// - Node name & type
// - Status & timing
// - Parent nodes [clickable] → navigate
// - Child nodes [clickable] → navigate

// Status-specific content:
// Not Started: input spec + parameters + expected duration
// Running: current progress + elapsed time + parent status
// Success: input + formatted output + metadata
// Failed: input + error message + suggested actions + blocking nodes
```

### 3.4 Real-time Data Flow

```
User Submits Input
    ↓
POST /api/workflows/:id/runs → runId
    ↓
Frontend: Open SSE stream to GET /api/runs/:id/stream
    ↓
Backend: Starts workflow execution, emits events
    ↓
Event: { type: "node-update", nodeId, status, output }
    ↓
Frontend: Updates NodeExecution in state
    ↓
React: Rerenders affected components (tree colors, detail pane)
    ↓
User sees real-time progress
```

### 3.5 Error Handling & Recovery

**Connection Failures**:
- Show "Disconnected" banner
- Auto-retry SSE connection every 3 seconds
- Show "reconnecting" status

**Large Outputs**:
- Truncate results to 50KB for initial display
- Provide "View Full Output" link to fetch complete data
- Use modal or separate view for full output

**Failed Nodes**:
- Highlight in red
- Show error message prominently
- Provide actionable suggestions from backend
- Future: "Retry Node" button (Phase 2)

## 4. Technology Stack

### Frontend Dependencies
- **React 19**: UI framework
- **Vite 7**: Build tool and dev server
- **TypeScript 5.9**: Type safety
- **Tailwind CSS**: Styling
- **Shadcn UI**: Pre-built components (Card, Dialog, Button, etc.)
- **React Flow**: DAG visualization with interactive nodes/edges
  - Includes auto-layout (dagre), pan/zoom, custom nodes/edges
  - Replaces custom tree component for DAG rendering
- **Lucide React**: Icons (check, x, hourglass, spinner, etc.)
- **React Query** (optional): Caching and background updates (Phase 2)

### Build & Dev
- **Bun**: Package manager and runtime
- **Vite**: Hot module replacement, optimized builds
- **Ultracite**: Linting and formatting

## 5. Key Technical Decisions

### 5.1 React Flow for DAG Visualization
**Decision**: Use React Flow library for DAG rendering.
**Rationale**:
- Professional DAG visualization with auto-layout (dagre)
- Pan/zoom out-of-the-box
- Custom node/edge components for status colors
- Handles large graphs efficiently
- Community support and regular updates
**Alternative**: Custom canvas rendering (too complex for v1).

### 5.2 Context + Hooks Over Redux
**Decision**: Use React Context and custom hooks for state management.
**Rationale**: Simpler for v1, no boilerplate. Run state is localized. Can migrate to Zustand if state grows complex.
**Scalability**: Add Zustand later if needed (Phase 2+).

### 5.3 SSE Over WebSocket
**Decision**: Use Server-Sent Events (SSE) for real-time updates.
**Rationale**: Simpler to implement (HTTP-based). Sufficient for run execution updates. No need for bidirectional communication in v1.
**Alternative**: WebSocket for Phase 2 if mobile support requires it.

### 5.4 Node Selection Instead of Tree Expansion
**Decision**: Click nodes in DAG to select for detail pane (no folder expansion).
**Rationale**:
- DAG visualization already shows all nodes and edges
- No need for expanding/collapsing (wasting space)
- Single-click to inspect any node
- Parents/children visible in DAG and in detail pane
- Keeps UI clean and responsive.

### 5.5 No Local Storage Persistence
**Decision**: All data sourced from backend; no caching in IndexedDB or localStorage.
**Rationale**: Simplifies state management. Backend is source of truth. Reduces sync issues.
**Phase 2**: Add React Query caching for faster re-renders on navigation.

## 6. Component API & Integration Points

### 6.1 WorkflowSelector Component
```typescript
<WorkflowSelector
  workflows={workflows}
  onSelect={(workflowId) => startRun(workflowId)}
/>
```
Fetches workflows on mount via `GET /api/workflows`.

### 6.2 DAGVisualization Component
```typescript
<DAGVisualization
  run={currentRun}
  workflow={workflow}
  selectedNodeId={selectedNodeId}
  onSelectNode={(nodeId) => selectNode(nodeId)}
/>
```
- Converts workflow nodes/edges to React Flow format
- Uses dagre auto-layout
- Subscribes to SSE on mount, updates node colors as events arrive
- Handles pan/zoom and fit-to-view controls

### 6.3 DetailPane Component
```typescript
<DetailPane
  nodeId={selectedNodeId}
  run={currentRun}
  workflow={workflow}
/>
```
Shows formatted node details based on execution status.

## 7. Data Flow: Execution to Visualization

```
Backend: Node execution starts
    ↓ (SSE Event)
{ type: "node-update", nodeId: "X", status: "running" }
    ↓
Frontend: Receive in SSE handler
    ↓
Update state: NodeExecution[X].status = "running"
    ↓
React: Rerender NodeFolder for node X
    ↓
NodeFolder: Pick color based on status (yellow for running)
    ↓
User sees node folder change to yellow in tree
```

Another example (completion):
```
Backend: Node execution completes
    ↓ (SSE Event)
{ type: "node-update", nodeId: "X", status: "success", output: {...} }
    ↓
Frontend: Update NodeExecution[X].status = "success", output = {...}
    ↓
React: Rerender NodeFolder + DetailPane (if selected)
    ↓
NodeFolder: Green with checkmark
DetailPane: Shows input + output results
    ↓
User sees completion with results
```

## 8. Scalability & Performance

### Handling Large Runs (100+ nodes)
- **Virtual scrolling**: Implement if tree exceeds 500 nodes (Phase 2)
- **Lazy loading**: Don't load all node details upfront
- **Memoization**: Use React.memo on NodeFolder to prevent re-renders of unaffected nodes

### Real-time Performance
- **Batch updates**: If 10+ nodes update in same second, batch into single render
- **Debounce detail pane**: Don't rerender DetailPane on every SSE event if user is typing

### Memory Management
- **Cleanup SSE connection**: Unsubscribe on run completion or unmount
- **Limit run history**: Keep only last 50 runs in memory (pagination for more)

## 9. Testing Strategy

### Unit Tests
- Tree component rendering with various run states
- Node status color/icon logic
- DetailPane content formatting
- Error message parsing

### Integration Tests
- Full workflow execution from submission to completion
- SSE subscription and state updates
- Navigation between historical runs

### E2E Tests
- User submits input → sees tree populate → expands node → sees results
- User navigates away and back → run state persists

## 10. Deployment & Versioning

### Frontend Build
```bash
cd frontend
bun run build
# Output: dist/
```

### Environment Configuration
```env
VITE_API_URL=http://localhost:8001  # Backend URL
VITE_ENV=development
```

### Hosting
- Static hosting (Vercel, Netlify, S3 + CloudFront)
- Backend must be CORS-enabled (already configured in Hono)

## 11. Future Enhancements (Phase 2+)

- [ ] Retry failed nodes
- [ ] Search/filter runs
- [ ] Performance metrics (execution time per level)
- [ ] Workflow performance analytics
- [ ] Mobile-responsive design
- [ ] Workflow editing UI
- [ ] Multi-user support with authentication
- [ ] Export run as JSON/markdown

## 12. Open Questions

- [ ] Should results be truncated or show "Show More"?
- [ ] Color scheme finalized? (Currently provisional in PRD)
- [ ] Animation preferences for state transitions?
- [ ] Should timing/duration be shown for each node?
- [ ] How to handle very long execution times (>1 hour)?
