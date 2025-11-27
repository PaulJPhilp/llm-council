# CLAUDE.md - Technical Notes for LLM Council

This file contains technical details, architectural decisions, and important implementation notes for future development sessions.

## Project Overview

LLM Council is a 3-stage deliberation system where multiple LLMs collaboratively answer user questions. The key innovation is anonymized peer review in Stage 2, preventing models from playing favorites.

## TypeScript Backend Migration (v2)

The backend has been migrated from Python (FastAPI) to **TypeScript (Node.js + Hono)**.

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

### Backend Structure (TypeScript - Updated)

**`config.ts`**
- Exports `COUNCIL_MODELS` (list of OpenRouter model identifiers)
- Exports `CHAIRMAN_MODEL` (model that synthesizes final answer)
- Loads environment variable `OPENROUTER_API_KEY` from `.env`
- Backend runs on **port 8001** (NOT 8000 - user had another app on 8000)
- Throws error if OPENROUTER_API_KEY not provided

**`openrouter.ts`**
- `queryModel()`: Single async model query (timeout default 120s)
- `queryModelsParallel()`: Parallel queries using `Promise.all()`
- Returns object with `content` and optional `reasoning_details`
- Graceful degradation: returns null on failure, continues with successful responses
- Uses native `fetch()` API with `AbortController` for timeouts
- Zod schema validation of API responses

**`council.ts`** - The Core Logic
- `stage1CollectResponses()`: Parallel queries to all council models
- `stage2CollectRankings()`:
  - Anonymizes responses as "Response A, B, C, etc."
  - Creates `labelToModel` mapping for de-anonymization
  - Prompts models to evaluate and rank (with strict format requirements)
  - Returns tuple: [rankings_list, labelToModel_dict]
  - Each ranking includes both raw text and `parsed_ranking` list
- `stage3SynthesizeFinal()`: Chairman synthesizes from all responses + rankings
- `parseRankingFromText()`: Extracts "FINAL RANKING:" section, handles both numbered lists and plain format
- `calculateAggregateRankings()`: Computes average rank position across all peer evaluations
- `generateConversationTitle()`: Fast title generation using Gemini 2.5 Flash
- `runFullCouncil()`: Orchestrates all 3 stages and returns metadata

**`storage.ts`**
- JSON-based conversation storage in `data/conversations/`
- Each conversation: `{id, created_at, title, messages[]}`
- Assistant messages contain: `{role, stage1, stage2, stage3}`
- Note: metadata (label_to_model, aggregate_rankings) is NOT persisted to storage, only returned via API
- All functions are async (using `fs/promises`)
- Zod schemas validate all data structures
- Graceful error handling with proper type narrowing

**`main.ts`**
- Hono app with CORS enabled for localhost:5173 and localhost:3000
- All endpoints defined with type-safe handlers
- POST `/api/conversations/{conversationId}/message` returns metadata in addition to stages
- POST `/api/conversations/{conversationId}/message/stream` uses SSE for progressive updates
- Metadata includes: labelToModel mapping and aggregateRankings
- Error responses return JSON with 400/404/500 status codes
- Uses `ReadableStream` for SSE implementation

### Frontend Structure (`frontend/src/`)

**`App.jsx`**
- Main orchestration: manages conversations list and current conversation
- Handles message sending and metadata storage
- Important: metadata is stored in the UI state for display but not persisted to backend JSON

**`components/ChatInterface.jsx`**
- Multiline textarea (3 rows, resizable)
- Enter to send, Shift+Enter for new line
- User messages wrapped in markdown-content class for padding

**`components/Stage1.jsx`**
- Tab view of individual model responses
- ReactMarkdown rendering with markdown-content wrapper

**`components/Stage2.jsx`**
- **Critical Feature**: Tab view showing RAW evaluation text from each model
- De-anonymization happens CLIENT-SIDE for display (models receive anonymous labels)
- Shows "Extracted Ranking" below each evaluation so users can validate parsing
- Aggregate rankings shown with average position and vote count
- Explanatory text clarifies that boldface model names are for readability only

**`components/Stage3.jsx`**
- Final synthesized answer from chairman
- Green-tinted background (#f0fff0) to highlight conclusion

**Styling (`*.css`)**
- Light mode theme (not dark mode)
- Primary color: #4a90e2 (blue)
- Global markdown styling in `index.css` with `.markdown-content` class
- 12px padding on all markdown content to prevent cluttered appearance

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

## Common Gotchas

1. **TypeScript Build Errors**: Run `bun install` in backend directory if TypeScript can't find dependencies
2. **Missing Node Modules**: Run `bun install` from `backend/` directory, not from root
3. **CORS Issues**: Frontend must match allowed origins in `main.ts` CORS middleware (update both if changing)
4. **Ranking Parse Failures**: If models don't follow format, fallback regex extracts any "Response X" patterns in order
5. **Missing Metadata**: Metadata is ephemeral (not persisted), only available in API responses
6. **Port Already in Use**: If port 8001 is taken, either kill the process or modify the port in `backend/src/main.ts`
7. **Environment Variables**: Make sure `.env` file exists in `backend/` directory with OPENROUTER_API_KEY set

## Future Enhancement Ideas

- Configurable council/chairman via UI instead of config file
- Streaming responses (already implemented via SSE)
- Export conversations to markdown/PDF
- Model performance analytics over time
- Custom ranking criteria (not just accuracy/insight)
- Support for reasoning models (o1, etc.) with special handling
- API authentication for multi-user deployments
- WebSocket support instead of SSE for better mobile compatibility

## Testing Notes

Run the test suite to verify the backend functionality:
```bash
cd backend
bun test           # Run with watch mode
bun run test:run   # Run once (CI mode)
```

Tests include:
- **council.test.ts**: Tests for ranking parsing and aggregation logic
- **storage.test.ts**: Tests for conversation storage and retrieval

To test API connectivity to OpenRouter, add a simple test file or use curl:
```bash
curl -X POST http://localhost:8001/api/conversations
curl -X POST http://localhost:8001/api/conversations/{id}/message \
  -H "Content-Type: application/json" \
  -d '{"content": "What is AI?"}'
```

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
