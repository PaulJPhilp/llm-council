# LLM Council Backend

TypeScript/Node.js backend for the LLM Council - a 3-stage deliberation system where multiple LLMs collaboratively answer user questions.

## Architecture

The backend implements a 3-stage council process:

1. **Stage 1**: Individual responses from all council models (parallel queries)
2. **Stage 2**: Each model anonymously ranks the responses
3. **Stage 3**: Chairman synthesizes final answer based on all data

## Tech Stack

- **Framework**: [Hono](https://hono.dev/) - Modern, lightweight web framework
- **Language**: TypeScript
- **Runtime**: Node.js 18+
- **Validation**: [Zod](https://zod.dev/) - TypeScript-first schema validation
- **Testing**: [Vitest](https://vitest.dev/) - Blazing fast unit test framework

## Setup

### Prerequisites

- Node.js 18+
- npm or yarn
- OpenRouter API key

### Installation

1. **Install dependencies**:
   ```bash
   npm install
   ```

2. **Configure environment**:
   ```bash
   cp .env.example .env
   # Edit .env and add your OPENROUTER_API_KEY
   ```

3. **Build TypeScript** (optional, for production):
   ```bash
   npm run build
   ```

## Running

### Development Mode

```bash
npm run dev
```

This starts the server with hot-reloading on `http://localhost:8001`

### Production Mode

```bash
npm run build
npm run start
```

## API Endpoints

### Health Check
- `GET /` - Server status

### Conversations

- `GET /api/conversations` - List all conversations (metadata only)
- `POST /api/conversations` - Create new conversation
- `GET /api/conversations/{id}` - Get conversation with all messages
- `POST /api/conversations/{id}/message` - Send message (batch response)
- `POST /api/conversations/{id}/message/stream` - Send message (SSE streaming)

### Request/Response Examples

**Create Conversation:**
```bash
curl -X POST http://localhost:8001/api/conversations
```

**Send Message (Streaming):**
```bash
curl -X POST http://localhost:8001/api/conversations/{id}/message/stream \
  -H "Content-Type: application/json" \
  -d '{"content": "What is machine learning?"}'
```

Response uses Server-Sent Events (SSE):
```
data: {"type":"stage1_start"}
data: {"type":"stage1_complete","data":[...]}
data: {"type":"stage2_start"}
data: {"type":"stage2_complete","data":[...],"metadata":{...}}
data: {"type":"stage3_start"}
data: {"type":"stage3_complete","data":{...}}
data: {"type":"title_complete","data":{"title":"..."}}
data: {"type":"complete"}
```

## Project Structure

```
backend/
├── src/
│   ├── main.ts              # Hono app and endpoints
│   ├── config.ts            # Configuration and constants
│   ├── openrouter.ts        # OpenRouter API client
│   ├── storage.ts           # File-based conversation storage
│   ├── council.ts           # 3-stage council logic
│   ├── council.test.ts      # Unit tests for council
│   └── storage.test.ts      # Unit tests for storage
├── dist/                    # Compiled JavaScript (after build)
├── package.json             # Dependencies and scripts
├── tsconfig.json            # TypeScript configuration
├── vitest.config.ts         # Vitest configuration
└── .env.example             # Environment variables template
```

## Testing

Run tests:
```bash
npm test
```

Run tests in watch mode:
```bash
npm test -- --watch
```

Run tests once (CI mode):
```bash
npm run test:run
```

## Code Quality & Linting

### Ultracite (Biome)

The backend uses [Ultracite](https://github.com/ynput/ultracite) - an opinionated configuration for Biome that provides strict linting rules and consistent code formatting.

#### Available Commands

**Check code quality** (without fixing):
```bash
npm run lint
```

**Fix issues automatically**:
```bash
npm run lint:fix
npm run format
```

#### What Ultracite Enforces

- **400+ Linting Rules**: Accessibility, complexity, correctness, performance, security, and style
- **Strict Formatting**: 2-space indentation, 80-character line width, semicolons, double quotes
- **Import Sorting**: Automatic organization of imports
- **Unused Code Detection**: Identifies and flags unused variables and imports
- **Best Practices**: Accessibility standards, performance patterns, security checks

#### Pre-commit Hooks

Ultracite is configured to run automatically before every commit via the `.husky/pre-commit` hook:

```bash
cd backend && npx ultracite fix
```

This ensures all committed code passes linting checks. If you commit code that violates linting rules, it will be automatically fixed.

To bypass hooks (not recommended):
```bash
git commit --no-verify
```

#### VS Code Integration

For real-time linting in VS Code, install the [Biome extension](https://marketplace.visualstudio.com/items?itemName=biomejs.biome):

1. Open Extensions (Cmd+Shift+X)
2. Search for "Biome"
3. Install the official Biomejs extension
4. Reload VS Code

After installation, you'll see linting errors directly in the editor.

#### Configuration

Ultracite configuration is defined in `biome.jsonc`:

```jsonc
{
  "$schema": "./node_modules/@biomejs/biome/configuration_schema.json",
  "extends": ["ultracite/core"]
}
```

To customize rules, see [Biome documentation](https://biomejs.dev/reference/configuration/).

## Configuration

### Models

Edit `src/config.ts` to change:
- `COUNCIL_MODELS` - Array of OpenRouter model identifiers for the council
- `CHAIRMAN_MODEL` - Model used for final synthesis

Current configuration:
- Council: OpenAI GPT-5.1, Google Gemini-3-Pro, Anthropic Claude Sonnet 4.5, xAI Grok-4
- Chairman: Google Gemini-3-Pro

### Data Storage

By default, conversations are stored as JSON files in `data/conversations/`. This directory is created automatically.

Each conversation file contains:
- Conversation metadata (id, created_at, title)
- All messages (user and assistant)
- Stage 1, 2, and 3 responses for each council response

## CORS Configuration

The server enables CORS for:
- `http://localhost:5173` (Vite dev server)
- `http://localhost:3000` (alternative frontend port)

To change, edit the CORS middleware in `src/main.ts`.

## Development Notes

### Adding New Endpoints

1. Add route handler to `src/main.ts`
2. Import any required functions
3. Use Zod for request/response validation
4. Return JSON responses with appropriate status codes

### Error Handling

- API errors return JSON with error message and appropriate HTTP status
- Stream errors are sent as SSE events with type "error"
- All async operations have proper error boundaries

### Type Safety

- All functions have explicit parameter and return types
- Zod schemas validate runtime data from external APIs
- Use TypeScript's strict mode for compile-time checks

## Migration Notes

This backend is a TypeScript port of the original Python backend:
- Python `async/await` → TypeScript `async/await` (same patterns)
- FastAPI → Hono (similar routing and middleware approach)
- Pydantic validation → Zod validation
- Python file I/O → Node.js `fs/promises`
- Python regex → JavaScript regex (mostly compatible)

Original Python backend preserved in `backend-python/` directory for reference.

## Performance Considerations

- **Parallel queries**: Stage 1 and 2 use `Promise.all()` for concurrent API calls
- **Title generation**: Runs in parallel with stage processing using promises
- **Streaming**: SSE responses allow frontend to display results progressively
- **Graceful degradation**: If some models fail, successful responses are still returned

## Troubleshooting

### Missing OpenRouter API key
```
Error: OPENROUTER_API_KEY environment variable is not set
```
Solution: Add your key to `.env` file

### Port 8001 already in use
```
Error: listen EADDRINUSE: address already in use :::8001
```
Solution: Change port in `src/main.ts` or kill the process using that port

### Module not found errors
```
Error: Cannot find module
```
Solution: Run `npm install` to install dependencies

## License

Same license as parent LLM Council project
