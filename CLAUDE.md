# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Quick Reference: Common Commands

### Starting Development

```bash
./start.sh                          # Start both backend and frontend (easiest)
# OR manually:
cd backend && bun run dev           # Terminal 1: Backend on http://localhost:8001
cd frontend && bun run dev          # Terminal 2: Frontend on http://localhost:5173
```

### Testing (Backend Only)

```bash
cd backend && bun test              # Watch mode (re-runs on file changes)
cd backend && bun run test:run      # Run once (single execution, CI mode)
cd backend && bun x vitest --ui     # Interactive Vitest UI for debugging
```

**Test Files**:
- `council.test.ts` - Unit tests for ranking parsing and stage logic
- `council.integration.test.ts` - End-to-end integration tests
- `storage.test.ts` - Conversation storage layer tests
- `main.test.ts` - HTTP endpoint tests

**End-to-End Testing**:
```bash
./test-e2e.sh                       # Full app test (requires both backend + frontend running)
```

### Code Quality

```bash
# Backend
cd backend && bun run lint          # Check code with Ultracite
cd backend && bun run lint:fix      # Fix linting issues automatically
cd backend && bun run typecheck     # Type-check only (no build)

# Frontend
cd frontend && bun run lint
cd frontend && bun run lint:fix
cd frontend && bun x tsc --noEmit   # Type-check only
```

### Building

```bash
# Backend (TypeScript → JavaScript)
cd backend && bun run build         # Compile TypeScript to dist/
cd backend && bun run start         # Run compiled backend (requires build first)

# Frontend (React → optimized bundle)
cd frontend && bun run build        # Build optimized production bundle
cd frontend && bun --bun x vite preview  # Preview production build locally
```

## Project Overview

Ensemble is a multi-model AI deliberation system where multiple LLMs collaboratively answer user questions. The system operates in three stages: collecting individual responses, facilitating anonymous peer review, and synthesizing a final answer. The key innovation is anonymized peer review in Stage 2, preventing models from playing favorites when ranking each other's work.

## Important Notes for Contributors

**Linting & Formatting**: Uses [Ultracite](https://ultracite.dev/) for both backend and frontend. Running `lint:fix` ensures consistency. The backend has special handling for `data/` directory (linting disabled for conversation JSON files).

**Version**: v2.0.0 - Complete rewrite from Python to TypeScript (see CHANGELOG.md for v1.0.0 history).

## TypeScript Backend Migration (v2)

The backend has been migrated from Python (FastAPI) to **TypeScript (Node.js + Hono)**. The system also uses **Effect** for functional programming, type-safe error handling, and dependency injection.

### Why TypeScript?

- **Type Safety**: Compile-time type checking prevents runtime errors
- **Performance**: Node.js is generally faster for I/O-bound operations
- **Unified Stack**: Frontend and backend now both use TypeScript
- **Modern Ecosystem**: Better tooling and library ecosystem for async operations

### Backend Stack (TypeScript)

- **Runtime**: Node.js 18+
- **Framework**: Hono (lightweight, TypeScript-native alternative to FastAPI)
- **Validation**: Zod (TypeScript-first schema validation)
- **Testing**: Vitest (modern test framework)

### Key Conversions

| Python | TypeScript |
|--------|-----------|
| `asyncio.gather()` | `Promise.all()` |
| FastAPI | Hono |
| Pydantic | Zod |
| `httpx.AsyncClient` | native `fetch()` |
| `json.dump/load` | `JSON.parse/stringify` + `fs/promises` |
| `uuid` module | `crypto.randomUUID()` |

### Running the TypeScript Backend

**Development:**
```bash
cd backend
bun run dev    # Hot-reloading on port 8001
```

**Production:**
```bash
cd backend
bun run build
bun run start
```

**Testing:**
```bash
cd backend
bun test       # Run all tests
bun run test:run # Run once (CI mode)
```

### Project Structure (TypeScript)

```
backend/
├── src/
│   ├── main.ts              # Hono app, all endpoints
│   ├── config.ts            # Configuration constants
│   ├── openrouter.ts        # OpenRouter API client (Zod validation)
│   ├── storage.ts           # File-based conversation storage (Zod schemas)
│   ├── council.ts           # 3-stage council logic
│   ├── council.test.ts      # Unit tests for core logic
│   └── storage.test.ts      # Unit tests for storage
├── dist/                    # Compiled JavaScript output
├── package.json             # Dependencies and npm scripts
├── tsconfig.json            # TypeScript compiler options
├── vitest.config.ts         # Test framework configuration
└── README.md                # Backend-specific documentation
```

### Important TypeScript Details

- **Zod Schemas**: All data from external sources is validated with Zod schemas
  - `openrouter.ts`: Validates OpenRouter API responses
  - `storage.ts`: Validates conversation data structure
- **Type Exports**: All types are exported for use in other modules
- **Strict Mode**: `strict: true` in tsconfig.json for maximum type safety
- **No `any` types**: Explicit types everywhere to catch bugs early

### Effect Architecture

The v2.0.0 backend uses **Effect** for:
- **Error Handling**: Type-safe, structured error propagation (Effect.fail)
- **Dependency Injection**: Services defined as Context/Layer dependencies
- **Concurrency**: Parallel operations with Effect.all (replaces async/await for complex flows)
- **Resource Management**: Automatic cleanup and scope management

Key services are defined as Effect.Context with .Default layers for dependency resolution. See ARCHITECTURE.md for detailed service definitions.

### Backwards Compatibility

- **API endpoints**: Identical to Python version (no client changes needed)
- **SSE format**: Exact same format (no frontend changes needed)
- **Data storage**: Same JSON format (conversations are compatible)
- **Environment variables**: Same `.env` file format

### Performance Notes

- **Parallel queries**: Uses `Promise.all()` just like Python's `asyncio.gather()`
- **Streaming**: SSE via `ReadableStream` with proper error handling
- **File I/O**: Uses `fs/promises` for non-blocking file operations
- **Graceful degradation**: Same error handling as Python version

## Architecture

### Backend Overview

**Technology Stack**:
- **Runtime**: Node.js 18+ with Bun package manager
- **Framework**: Hono 4.10.6 (lightweight, TypeScript-native HTTP server)
- **Language**: TypeScript 5.9.3 with strict mode enabled
- **Functional Programming**: Effect 3.8.0 (error handling, dependency injection, concurrency)
- **Validation**: Zod 3.25.76 (runtime schema validation)
- **Testing**: Vitest 1.6.1 (modern test framework)
- **Code Quality**: Ultracite 6.3.6 (unified linter/formatter)

**Port**: 8001 (NOT 8000 - this was changed to avoid conflicts)

### Backend Module Details

**`config.ts`** - Configuration & Environment
- Loads `OPENROUTER_API_KEY` from `.env` (required)
- Exports `COUNCIL_MODELS` array of OpenRouter model IDs
- Exports `CHAIRMAN_MODEL` for final synthesis
- Exports timeouts: `API_TIMEOUT_MS` (120s), `TITLE_GENERATION_TIMEOUT_MS` (30s)
- Exports `DATA_DIR` for conversation storage location
- Throws error if `OPENROUTER_API_KEY` not set (prevents silent failures)

**`openrouter.ts`** - External LLM API Integration
- `queryModel(model, messages)`: Single model query with timeout
- `queryModelsParallel(models, messages)`: Parallel queries using Effect streams
- Returns `{ content: string, reasoning_details?: string }`
- Graceful degradation: Null on failure, continues with successful responses
- Uses native `fetch()` with `AbortSignal.timeout()` for cancellation
- Zod schema validates all OpenRouter API responses
- Custom `OpenRouterError` type for type-safe error handling

**`council.ts`** - The 3-Stage Core Algorithm (15.3KB)
*Stage 1: Collect Individual Responses*
- `stage1CollectResponses(userQuery)`: Queries all models in parallel
- Returns array of `{model: string, response: string}`
- Continues on individual model failures (graceful degradation)

*Stage 2: Anonymized Peer Review*
- `stage2CollectRankings(userQuery, stage1Results)`:
  - Anonymizes responses as "Response A", "Response B", etc.
  - Creates `labelToModel` mapping for later de-anonymization
  - Each model ranks others with strict prompt format
  - Parses rankings from free-text responses
- `parseRankingFromText(text)`: Extracts "FINAL RANKING:" section
  - Handles numbered lists: "1. Response C", "2. Response A"
  - Fallback regex for non-standard formats
- `calculateAggregateRankings(stage2Results, labelToModel)`:
  - Computes average rank position across all evaluators
  - Returns sorted list with vote counts

*Stage 3: Synthesis*
- `stage3SynthesizeFinal(userQuery, stage1Results, stage2Results)`:
  - Chairman model receives all responses + peer rankings
  - Produces final synthesized answer
- `runFullCouncil()`: Orchestrates all 3 stages with metadata

**`storage.ts`** - Conversation Persistence (13.3KB)
- JSON-based file storage in `data/conversations/` directory
- Conversation schema: `{id, created_at, title, messages[]}`
- Assistant message format: `{role: "assistant", stage1, stage2, stage3}`
- **Important**: Metadata (labelToModel, aggregateRankings) is **NOT persisted** to storage
  - Only returned via API responses (ephemeral)
  - Re-calculated on demand if needed
- Zod schemas validate all data structures
- All functions use `fs/promises` for non-blocking I/O
- Functions: `createConversation()`, `getConversation()`, `addUserMessage()`, `addAssistantMessage()`

**`main.ts`** - HTTP Server & Endpoints (8.5KB)
- Hono app running on port 8001
- CORS enabled for `localhost:5173` (frontend) and `localhost:3000` (testing)

*Endpoints*:
- `GET /` - Health check
- `GET /api/conversations` - List all conversations (returns metadata only)
- `POST /api/conversations` - Create new conversation
- `GET /api/conversations/:id` - Get conversation with full history
- `POST /api/conversations/:id/message` - Send message (batch response)
- `POST /api/conversations/:id/message/stream` - Send message (SSE streaming)

*Streaming (SSE) Response Format*:
```
data: {type: "stage1_start"}
data: {type: "stage1_complete", data: [...]}
data: {type: "stage2_start"}
data: {type: "stage2_complete", data: [...], metadata: {...}}
data: {type: "stage3_start"}
data: {type: "stage3_complete", data: {...}}
data: {type: "title_complete", data: {title: "..."}}
data: {type: "complete"}
```

- Uses `ReadableStream` for progressive updates
- Each event includes stage data and optional metadata
- Metadata: `{labelToModel, aggregateRankings}` (returned in stage2 and final responses)

### Frontend Overview

**Technology Stack**:
- **Framework**: React 19.2.0 (latest with hooks and new features)
- **Build Tool**: Vite 7.2.4 (lightning-fast dev server)
- **Language**: TypeScript 5.9.3 (JSX support)
- **State Management**: React hooks + local state (no Redux/Zustand needed)
- **Markdown**: React-markdown 10.1.0 with assistant-ui integration
- **API Client**: Native Fetch API (no axios/superagent)
- **Code Quality**: Ultracite (same linter as backend)

**Port**: 5173 (Vite default)

**Entry Point**: `src/main.tsx` → React 19 root render to `#root` div

### Frontend Module Details

**`src/App.tsx`** (8.3KB) - Main Orchestration
- Manages conversation list and current conversation state
- Handles message sending and streaming updates
- Stores conversations list in browser state
- Receives metadata from API (`labelToModel`, `aggregateRankings`) for display
- **Important**: Metadata is **NOT persisted** to localStorage or backend JSON
  - Only available during streaming response
  - Lost on page refresh (ephemeral)

**`src/api.ts`** (3.2KB) - API Client
- `listConversations()` - GET /api/conversations
- `createConversation()` - POST /api/conversations
- `getConversation(id)` - GET /api/conversations/:id
- `sendMessage(id, content)` - POST batch response
- `sendMessageStream(id, content, onEvent)` - POST with SSE streaming
- Uses native `fetch()` API with proper error handling

**`src/components/`** - React Components
- `ChatInterface.tsx` - Textarea input (multiline, Enter to send, Shift+Enter for newline)
- `Sidebar.tsx` - Conversation list and new conversation button
- `CouncilComposer.tsx` - Wraps ChatInterface with styling
- `CouncilThread.tsx` - Main display area with stage tabs
- `Stage1.tsx` / `Stage1Enhanced.tsx` - Tab view of individual model responses
- `Stage2.tsx` / `Stage2Enhanced.tsx` - Raw evaluations + extracted rankings + aggregate table
- `Stage3.tsx` / `Stage3Enhanced.tsx` - Final synthesized answer
- Each component has corresponding `.css` file for styling

**Stage 2 Component (Critical Feature)**:
- Shows RAW evaluation text from each model in tabs
- De-anonymization happens CLIENT-SIDE for display (models received anonymous labels)
- Shows "Extracted Ranking" below raw text for validation
- Aggregate rankings table with average position and vote count
- Explanatory text clarifies that bold model names are added for readability only

**Stage 3 Component**:
- Final synthesized answer from chairman
- Green-tinted background (#f0fff0) to distinguish from other stages

**Styling**:
- Light mode theme (not dark mode)
- Primary color: #4a90e2 (blue)
- Global markdown styling in `index.css` with `.markdown-content` class
- 12px padding on all markdown content for proper spacing
- Component-specific styles in corresponding `.css` files

## Key Design Decisions

### Stage 2 Prompt Format
The Stage 2 prompt is very specific to ensure parseable output:
```
1. Evaluate each response individually first
2. Provide "FINAL RANKING:" header
3. Numbered list format: "1. Response C", "2. Response A", etc.
4. No additional text after ranking section
```

This strict format allows reliable parsing while still getting thoughtful evaluations.

### De-anonymization Strategy
- Models receive: "Response A", "Response B", etc.
- Backend creates mapping: `{"Response A": "openai/gpt-5.1", ...}`
- Frontend displays model names in **bold** for readability
- Users see explanation that original evaluation used anonymous labels
- This prevents bias while maintaining transparency

### Error Handling Philosophy
- Continue with successful responses if some models fail (graceful degradation)
- Never fail the entire request due to single model failure
- Log errors but don't expose to user unless all models fail

### UI/UX Transparency
- All raw outputs are inspectable via tabs
- Parsed rankings shown below raw text for validation
- Users can verify system's interpretation of model outputs
- This builds trust and allows debugging of edge cases

## Important Implementation Details

### Module Imports (TypeScript)
All backend modules use ES6 imports (e.g., `import { config } from './config'`). The tsconfig.json is configured for ESNext modules with proper module resolution.

### Port Configuration
- Backend: 8001 (changed from 8000 to avoid conflict)
- Frontend: 5173 (Vite default)
- Update `backend/src/main.ts` (Hono port) if changing backend port
- Update `frontend/src/api.js` if changing either port

### Markdown Rendering
All ReactMarkdown components must be wrapped in `<div className="markdown-content">` for proper spacing. This class is defined globally in `index.css`.

### Model Configuration
Models are hardcoded in `backend/src/config.ts`. Chairman can be same or different from council members. The current default is Gemini as chairman per user preference. Update the arrays to add or remove council members.

## Common Gotchas & Troubleshooting

1. **Port 8001 Already in Use**
   - Error: "EADDRINUSE: address already in use :::8001"
   - Solution: Kill existing process or modify port in `backend/src/main.ts`
   - `lsof -i :8001` to find process ID, then `kill -9 <PID>`

2. **Missing OPENROUTER_API_KEY**
   - Create `.env` file in `backend/` directory
   - Add: `OPENROUTER_API_KEY=sk_...` (from openrouter.ai)
   - Backend will error on startup if missing

3. **TypeScript Build Errors**
   - Run `bun install` in `backend/` directory (not root)
   - Delete `node_modules` and `dist/` then reinstall if stuck
   - Check `tsconfig.json` has `strict: true` (required)

4. **CORS Issues**
   - Frontend requests blocked? Update allowed origins in `backend/src/main.ts`
   - Default allows `localhost:5173` and `localhost:3000`
   - Also update `frontend/src/api.ts` if changing backend port

5. **Ranking Parse Failures**
   - If models don't follow "FINAL RANKING:" format, fallback regex extracts any "Response X" patterns
   - This is intentional graceful degradation
   - Check `parseRankingFromText()` in `council.ts` for details

6. **Metadata Not Persisting**
   - `labelToModel` and `aggregateRankings` are NOT saved to JSON storage
   - Only available in API responses during streaming
   - Metadata is ephemeral and re-calculated on demand
   - This is by design (see `storage.ts`)

7. **Tests Failing**
   - Run `bun run typecheck` first to catch type errors
   - Use `bun run test:run` instead of `bun test` in CI mode
   - Check test output in `backend/src/*.test.ts` files

8. **Frontend Build Issues**
   - React 19 requires Vite 7.2.4+, don't downgrade
   - JSX transforms automatically via Vite
   - Clear browser cache if changes don't appear: `Cmd+Shift+R` (Mac) or `Ctrl+Shift+R` (Windows)

## Future Enhancement Ideas

- Configurable council/chairman via UI instead of config file
- Streaming responses (already implemented via SSE)
- Export conversations to markdown/PDF
- Model performance analytics over time
- Custom ranking criteria (not just accuracy/insight)
- Support for reasoning models (o1, etc.) with special handling
- API authentication for multi-user deployments
- WebSocket support instead of SSE for better mobile compatibility

## Testing Strategy

### Unit & Integration Tests

**Run Tests**:
```bash
cd backend
bun test           # Watch mode (re-runs on changes)
bun run test:run   # Single run (CI mode)
bun x vitest --ui  # Interactive UI for debugging
```

**Test Files**:
- `council.test.ts` - Unit tests for ranking parsing, aggregation, stage logic
- `council.integration.test.ts` - Full 3-stage council flow tests
- `storage.test.ts` - Conversation storage and retrieval tests
- `main.test.ts` - HTTP endpoint and API tests

### End-to-End Testing

Test full app flow (requires both servers running):
```bash
./test-e2e.sh     # Sends queries through all 3 stages
```

### Manual API Testing

Test specific endpoints with curl:
```bash
# Create conversation
curl -X POST http://localhost:8001/api/conversations

# Send message (batch)
curl -X POST http://localhost:8001/api/conversations/{id}/message \
  -H "Content-Type: application/json" \
  -d '{"content": "What is AI?"}'

# Stream response (Server-Sent Events)
curl -X POST http://localhost:8001/api/conversations/{id}/message/stream \
  -H "Content-Type: application/json" \
  -d '{"content": "What is AI?"}' | grep "^data:"
```

### Testing Against Real OpenRouter API

To verify OpenRouter connectivity:
1. Ensure `OPENROUTER_API_KEY` is set in `.env`
2. Run `bun run dev` to start backend
3. Use curl or frontend to send real query
4. Monitor logs for API errors or timeouts

## Data Flow Summary

```
User Query
    ↓
Stage 1: Parallel queries → [individual responses]
    ↓
Stage 2: Anonymize → Parallel ranking queries → [evaluations + parsed rankings]
    ↓
Aggregate Rankings Calculation → [sorted by avg position]
    ↓
Stage 3: Chairman synthesis with full context
    ↓
Return: {stage1, stage2, stage3, metadata}
    ↓
Frontend: Display with tabs + validation UI
```

The entire flow is async/parallel where possible to minimize latency.

## Effect Architecture & Patterns

This project uses **Effect 3.8.0** for functional programming. Key patterns used:

**Error Handling**:
- `Data.TaggedError` for custom error types (see `errors.ts`)
- `Effect.fail()` to create failed effects
- `Effect.catchTag()` to handle specific error types
- Type-safe error propagation via effect's `E` channel

**Dependency Injection**:
- `Effect.Service` defines service contracts
- `.Default` layers auto-generated for easy testing
- Services composed via `Layer.merge()`
- Configuration accessible via `Effect.Service.get()`

**Concurrency**:
- `Effect.all()` for parallel operations
- `Stream` for processing collections
- `Effect.fork()` for background tasks
- `Effect.timeout()` for preventing hangs

**Resource Management**:
- `Effect.acquireRelease()` for guaranteed cleanup
- Finalizers run in LIFO order even on failure
- No manual try/finally needed

**Example Pattern**:
```typescript
const effect = Effect.gen(function*() {
  const config = yield* Effect.Service.get(ConfigService)
  const result = yield* queryModel(config.model, prompt)
  return result
})
```

## Cursor IDE Rules

This project includes `.cursorrules` with 1700+ lines of Effect-TS patterns and project guidance. These rules cover:

- **Effect Patterns**: 100+ patterns from basic to advanced
- **Type Safety**: Strict mode, no `any` types, tagged errors
- **Testing**: Mocking, test layers, deterministic testing
- **API Design**: Request validation, error responses, streaming
- **Architecture**: Modular services, dependency injection, layer composition

The rules are auto-generated and provide detailed guidance on Effect best practices. Refer to them when making architectural decisions or working with complex Effect patterns.
