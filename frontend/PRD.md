# Product Requirements Document: Ensemble Workflow UI

## 1. Vision

Build a modern, intuitive web interface for visualizing and executing DAG-based workflows. Users can select from available workflows, run them, and observe execution progress in an interactive directed acyclic graph (DAG) visualization. The UI emphasizes transparency, showing atomic task execution, dependencies, state transitions, and actionable error information.

## 2. Goals

- **Primary**: Enable users to discover, select, and execute workflows with real-time DAG progress visibility
- **Secondary**: Provide clear understanding of node dependencies and execution order
- **Tertiary**: Enable inspection of individual node execution and error recovery
- **Quaternary**: Maintain execution history for reference and auditing

## 3. User Personas

### User: Analyst
- Goal: Run different workflows on various inputs
- Pain Point: Needs to understand the execution flow and what's happening at each step
- Success: Can quickly start a workflow, see DAG progress, inspect any node, and understand failures

### User: Developer
- Goal: Debug workflow executions and understand performance characteristics
- Pain Point: Needs to see dependencies, data flow, and detailed execution metrics
- Success: Can inspect node input/output, trace parent/child dependencies, and identify bottlenecks

## 4. Core Concepts (Terminology)

- **Workflow**: A reusable, composable DAG template (e.g., "LLM Council", "Analysis Pipeline")
- **Node**: An atomic unit of work (e.g., "Query GPT-4", "Rank Responses")
- **Edge**: A directed connection showing dependency from parent node to child node
- **Level**: A hierarchy tier determined by edge structure (depth from root nodes)
  - **Parent level** (previous): Nodes this node depends on (incoming edges)
  - **Child level** (next): Nodes depending on this node (outgoing edges)
- **Run**: A single execution instance of a workflow with a unique ID and timeline

## 5. User Flows

### Flow 1: Discover and Start a Run

```
User Views Dashboard
    ↓
Workflow Selector (dropdown/model picker style)
    ↓
User Selects Workflow
    ↓
Workflow Details View (description, input parameters)
    ↓
User Submits Input
    ↓
Run Created & Progress View Opens
```

### Flow 2: Monitor Run Execution

```
Run In Progress
    ↓
User Views DAG Visualization
  - Nodes organized by level (depth from root)
  - Edges showing parent → child dependencies
  - Node colors indicate status (pending, running, success, failed)
    ↓
User Hovers Over Node
    ↓
Tooltip Shows: Node name, status, timing
    ↓
User Clicks Node
    ↓
Details Pane Opens Showing:
  - Input spec (all states)
  - Parent nodes (previous level)
  - Child nodes (next level)
  - Status-specific info:
    * Not started: what will run
    * Running: current progress
    * Success: results, duration
    * Failed: error + suggested actions
    ↓
User Can See Real-time Updates
    ↓
User Can Click Other Nodes to Inspect
```

### Flow 3: Browse Historical Runs

```
User Views Left Sidebar
    ↓
Historical Runs List (like chat history)
    ↓
User Clicks Past Run
    ↓
Run Details View Opens (DAG view of completed execution)
    ↓
All nodes show final status
    ↓
User Can Inspect Any Node's Results
```

## 6. Feature Requirements

### 6.1 Workflow Selector (MVP)
- Dropdown or card-based selector showing available workflows
- Display workflow name, description, and metadata
- Allow user to select one to proceed
- Styled similar to model selector (ChatGPT style)

**Acceptance Criteria:**
- [ ] User can see all available workflows
- [ ] User can select a workflow
- [ ] Selection navigates to input/submission view
- [ ] Design is consistent with modern AI tools UI patterns

### 6.2 DAG Visualization (MVP)
- Display execution flow as directed acyclic graph (DAG)
- Nodes organized by level (depth from root)
- Edges show parent → child dependencies
- Pan/zoom to navigate large DAGs
- Auto-layout for readability

**Acceptance Criteria:**
- [ ] DAG structure reflects actual workflow topology
- [ ] Nodes positioned by level (depth from root)
- [ ] Edges clearly show dependencies
- [ ] Pan and zoom work smoothly
- [ ] Auto-layout is readable and not tangled
- [ ] Works for DAGs up to 50+ nodes

### 6.3 Node Status Visualization (MVP)
- Node color indicates execution state: Pending (gray), Running (yellow), Success (green), Failed (red)
- Status icon (hourglass, spinner, checkmark, X) centered in node
- Hover tooltip shows: node name, status, duration
- Edge colors may indicate data flow or status propagation

**Acceptance Criteria:**
- [ ] All states visually distinct via color
- [ ] Hover shows node name, status, timing
- [ ] Icons are clear and intuitive
- [ ] Color scheme accessible (WCAG AA minimum)
- [ ] Edges are visible and properly routed

### 6.4 Node Details Pane (MVP)
When user clicks a node, sidebar shows:

**For All nodes (always visible):**
- Node name and type
- Parent nodes (previous level) - clickable to navigate
- Child nodes (next level) - clickable to navigate
- Execution status and timing

**For Not Started nodes:**
- Input specification (what will be run)
- Parameters or prompt
- Expected duration estimate

**For Running nodes:**
- Current progress (elapsed time, % complete if available)
- Real-time logs or status updates
- Parent node status (blocking dependencies)

**For Success nodes:**
- Input specification
- Output/results (formatted, truncated if large)
- Execution time and duration
- Metadata (model used, cost, etc.)
- "View Full Output" link if truncated

**For Failed nodes:**
- Input specification
- Error message (full + summary)
- Which parent node(s) failed (if dependency failure)
- **Suggested Actions** (e.g., "Retry with increased timeout", "Check parent node", "Verify inputs")

**Acceptance Criteria:**
- [ ] Content changes based on node state
- [ ] Parent/child nodes are visible and clickable
- [ ] Output is readable and well-formatted (markdown, JSON, etc.)
- [ ] Error messages are clear and actionable
- [ ] Suggested actions are contextual to failure type
- [ ] Large outputs are truncated with "View More" option

### 6.5 Historical Runs Sidebar (MVP)
- Left sidebar showing list of past runs
- Each run shows: workflow name, timestamp, status, brief input summary
- Click to view run details (read-only tree view)
- Search/filter runs (Phase 2)
- Delete run option (Phase 2)

**Acceptance Criteria:**
- [ ] All past runs listed with metadata
- [ ] Clicking opens run in read-only mode
- [ ] Runs sorted by most recent first
- [ ] Sidebar is scrollable if many runs

### 6.6 Real-time Updates (MVP)
- Backend streams execution progress via SSE or WebSocket
- Frontend subscribes to run execution events
- Tree updates in real-time as nodes progress through states
- Visual animations for state transitions (optional but nice)

**Acceptance Criteria:**
- [ ] Frontend receives execution events from backend
- [ ] Tree updates within 1 second of state change
- [ ] No page refresh required to see progress
- [ ] Connection handles reconnection gracefully

### 6.7 Responsive Design (MVP)
- Works on desktop (primary focus)
- Mobile/tablet considerations (Phase 2)
- Sidebar collapsible on smaller screens

**Acceptance Criteria:**
- [ ] Layout works on 1920x1080 displays
- [ ] Text is readable and clickable
- [ ] No horizontal scrolling (except for DAG canvas)

## 7. UI Wireframe

### Overall Layout

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│ [Logo/Title]  [Workflow Selector ▼]  [Run Title / Status]                       │
├──────────────────────────────────────────────────────────────────────────────────┤
│                                                                                   │
│  ┌─────────────────┐  ┌──────────────────────────────────────┐  ┌─────────────┐ │
│  │  Historical     │  │                                      │  │  Node       │ │
│  │  Runs           │  │   DAG Visualization Canvas           │  │  Details    │ │
│  │                 │  │                                      │  │  Pane       │ │
│  │ [Run 1]         │  │        ┌─────────┐                 │  │             │ │
│  │  12:34 Success  │  │        │ Query   │                 │  │ Query GPT-4 │ │
│  │  "What is..."   │  │        │ GPT-4   │                 │  │             │ │
│  │                 │  │        │ (●)     │                 │  │ Status:     │ │
│  │ [Run 2]         │  │        └────┬────┘                 │  │ Running     │ │
│  │  12:20 Running  │  │             │                      │  │             │ │
│  │  "Tell me..."   │  │        ┌────▼────┐  ┌──────────┐  │  │ Parents:    │ │
│  │ [Run 3]         │  │        │ Rank    │  │Synthesize│  │  │ None        │ │
│  │  11:56 Failed   │  │        │Response │  │ (○)      │  │  │             │ │
│  │  "Analyze..."   │  │        │ (●)     │  │          │  │  │ Children:   │ │
│  │                 │  │        └────┬────┘  └──────────┘  │  │ • Rank      │ │
│  │ [scroll]        │  │             │         ▲           │  │ • Synthesize│ │
│  │                 │  │        ┌────▼────┐   │           │  │             │ │
│  │                 │  │        │ Format  │───┘           │  │ Input:      │ │
│  │                 │  │        │ Output  │               │  │ {query}     │ │
│  │                 │  │        │ (●)     │               │  │             │ │
│  │                 │  │        └─────────┘               │  │ Duration:   │ │
│  │                 │  │                                  │  │ 2.3s        │ │
│  │                 │  │  [+] Pan/Zoom Controls           │  │             │ │
│  │                 │  │                                  │  │ Output:     │ │
│  │                 │  │                                  │  │ (loading)   │ │
│  │                 │  └──────────────────────────────────┘  └─────────────┘ │
│  │                 │                                                          │
│  └─────────────────┴──────────────────────────────────────────────────────────┘
│                                                                                  │
│ Legend:  ● Running  ○ Pending  ✓ Success  ✗ Failed                             │
└──────────────────────────────────────────────────────────────────────────────────┘
```

### DAG Node Visualization Detail

```
Pending Node (gray):
┌──────────────┐
│     ⏳       │
│   Query      │
│   GPT-4      │
└──────────────┘

Running Node (yellow):
┌──────────────┐
│     ⟳       │
│   Query      │
│   GPT-4      │
└──────────────┘

Success Node (green):
┌──────────────┐
│     ✓        │
│   Query      │
│   GPT-4      │
└──────────────┘

Failed Node (red):
┌──────────────┐
│     ✗        │
│   Query      │
│   GPT-4      │
└──────────────┘
```

### Edges Visualization

```
Parent → Child Dependencies:
        ┌──────────┐
        │ Node A   │
        │ (✓)      │
        └────┬─────┘
             │
             │ (edge label: optional)
             │
        ┌────▼─────┐
        │ Node B   │
        │ (●)      │
        └──────────┘

Multiple parents → Child:
┌──────────┐
│ Node A   │
│ (✓)      │
└─────┬────┘
      │
      ├──────┐
      │      │
┌─────▼──┐  ┌┴──────────┐
│ Node B  │  │  Node C   │
│ (●)     │  │  (○)      │
└─────┬───┘  └────┬──────┘
      │           │
      └─────┬─────┘
            │
       ┌────▼─────┐
       │ Node D   │
       │ (○)      │
       └──────────┘
```

### Node Details Pane (Success State)

```
┌─────────────────────────────────┐
│  Query GPT-4                    │
├─────────────────────────────────┤
│                                 │
│ Status: ✓ Success               │
│ Duration: 2.3 seconds           │
│ Completed at: 12:34:56          │
│                                 │
├─────────────────────────────────┤
│ PARENTS (Previous Level):       │
│ None (root node)                │
│                                 │
├─────────────────────────────────┤
│ CHILDREN (Next Level):          │
│ • Rank Responses  [→]           │
│ • Synthesize      [→]           │
│                                 │
├─────────────────────────────────┤
│ INPUT SPEC:                     │
│ {                               │
│   "query": "What is AI?",       │
│   "model": "gpt-4",             │
│   "temperature": 0.7            │
│ }                               │
│                                 │
├─────────────────────────────────┤
│ OUTPUT:                         │
│                                 │
│ AI is a broad field...          │
│                                 │
│ [View Full Output]              │
│                                 │
└─────────────────────────────────┘
```

### Node Details Pane (Failed State)

```
┌─────────────────────────────────┐
│  Query GPT-4                    │
├─────────────────────────────────┤
│                                 │
│ Status: ✗ Failed                │
│ Duration: 30.0 seconds          │
│ Failed at: 12:35:12             │
│                                 │
├─────────────────────────────────┤
│ ERROR:                          │
│ API Timeout (30s exceeded)      │
│                                 │
│ The request to GPT-4 API        │
│ exceeded the 30 second timeout.  │
│                                 │
├─────────────────────────────────┤
│ SUGGESTED ACTIONS:              │
│                                 │
│ • Retry with longer timeout     │
│ • Check API status at           │
│   platform.openai.com           │
│ • Try alternative model         │
│   (Claude, Gemini)              │
│                                 │
├─────────────────────────────────┤
│ DEPENDENCIES:                   │
│ Parents: None (root)            │
│ Blocking: Rank Responses,       │
│           Synthesize            │
│                                 │
│ INPUT SPEC:                     │
│ {                               │
│   "query": "What is AI?",       │
│   "model": "gpt-4",             │
│   "timeout": 30                 │
│ }                               │
│                                 │
└─────────────────────────────────┘
```

## 8. Non-Functional Requirements

### Performance
- DAG renders even with 100+ nodes (lazy load / virtualization for large runs)
- Real-time updates feel responsive (<500ms latency)
- No memory leaks during long-lived runs

### Reliability
- Gracefully handle backend disconnection (show offline state)
- Recover from network interruptions
- Preserve run data if page refresh occurs

### Accessibility
- Semantic HTML structure
- Keyboard navigation support (expand/collapse with arrow keys)
- Screen reader friendly

## 9. Constraints & Assumptions

### Assumptions
- Backend workflow module is available and stable
- One run active at a time (per user)
- Workflows are pre-defined (no workflow creation in v1)
- Real-time data available via backend (SSE or WebSocket)

### Constraints
- No local storage persistence (all data from backend)
- No authentication in v1 (single user)
- No workflow editing/creation in v1
- Desktop-first design

## 10. Implementation Phases (Addressed Separately)

**Phase 1 (MVP)**: Core tree visualization, state display, run execution
**Phase 2**: Advanced features - retry logic, filters, mobile support, analytics
**Phase 3**: Admin features - workflow management, user management, monitoring

## 11. Success Metrics

- Users can start a workflow and monitor execution without confusion
- Error messages guide users to corrective actions
- No support tickets for "what's happening?" during execution
- Response time for state updates <500ms
- Zero crashes during typical workflow execution

## 12. Design Notes

### Color Scheme (Provisional)
- **Pending**: #9CA3AF (gray)
- **Running**: #FCD34D (yellow/amber)
- **Success**: #10B981 (green)
- **Failed**: #EF4444 (red)
- **Hover**: Slightly darker shade with tooltip

### Typography & Spacing
- Use system font (or Tailwind default)
- Tree indentation: 20px per level
- Node height: 40px (touch-friendly)
- Padding: 12px internal, 16px external

### Icons
- Use Lucide React icons
- Folder icons for levels/nodes
- Status icons (hourglass, spinner, checkmark, X)
- Chevron for expand/collapse

## 13. Open Questions / To Be Determined

- [ ] What specific format for displaying results? (JSON, formatted table, markdown, custom?)
- [ ] How detailed should "Suggested Actions" be?
- [ ] Should users see execution timing/metrics? (Phase 2 feature)
- [ ] Animation preferences for state transitions?
- [ ] How to handle very large result outputs (truncation, pagination, modal)?
