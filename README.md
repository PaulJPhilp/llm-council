# LLM Council

![llmcouncil](header.jpg)

The idea of this repo is that instead of asking a question to your favorite LLM provider (e.g. OpenAI GPT 5.1, Google Gemini 3.0 Pro, Anthropic Claude Sonnet 4.5, xAI Grok 4, eg.c), you can group them into your "LLM Council". This repo is a simple, local web app that essentially looks like ChatGPT except it uses OpenRouter to send your query to multiple LLMs, it then asks them to review and rank each other's work, and finally a Chairman LLM produces the final response.

In a bit more detail, here is what happens when you submit a query:

1. **Stage 1: First opinions**. The user query is given to all LLMs individually, and the responses are collected. The individual responses are shown in a "tab view", so that the user can inspect them all one by one.
2. **Stage 2: Review**. Each individual LLM is given the responses of the other LLMs. Under the hood, the LLM identities are anonymized so that the LLM can't play favorites when judging their outputs. The LLM is asked to rank them in accuracy and insight.
3. **Stage 3: Final response**. The designated Chairman of the LLM Council takes all of the model's responses and compiles them into a single final answer that is presented to the user.

## Features

- **Multi-LLM Consultation**: Query multiple leading LLMs simultaneously (GPT, Claude, Gemini, Grok, etc.)
- **Anonymous Peer Review**: Models rank each other's responses without knowing the source, preventing bias
- **Synthesis**: A designated "Chairman" model produces a final, refined answer
- **Real-time Streaming**: Progressive updates via Server-Sent Events
- **Persistent Conversations**: Save and review past deliberations
- **Type-Safe Architecture**: Built with TypeScript and Effect for reliability

## Setup

### Prerequisites

- Bun 1.0+
- OpenRouter API key

### 1. Install Dependencies

**Backend (TypeScript):**
```bash
cd backend
bun install
```

**Frontend:**
```bash
cd frontend
bun install
```

### 2. Configure API Key

Create a `.env` file in the `backend/` directory:

```bash
cd backend
cp .env.example .env
# Edit .env and add your OPENROUTER_API_KEY
```

Get your API key at [openrouter.ai](https://openrouter.ai/). Make sure to purchase the credits you need, or sign up for automatic top up.

### 3. Configure Models (Optional)

Edit `backend/src/config.ts` to customize the council:

```typescript
export const COUNCIL_MODELS = [
    'openai/gpt-5.1',
    'google/gemini-3-pro-preview',
    'anthropic/claude-sonnet-4.5',
    'x-ai/grok-4',
];

export const CHAIRMAN_MODEL = 'google/gemini-3-pro-preview';
```

## Running the Application

**Option 1: Use the start script (easiest)**
```bash
./start.sh
```

**Option 2: Run manually**

Terminal 1 (Backend):
```bash
cd backend
bun run dev
```

Terminal 2 (Frontend):
```bash
cd frontend
bun run dev
```

Then open http://localhost:5173 in your browser.

## Testing

### Run Unit Tests
```bash
cd backend
bun test                # Watch mode
bun run test:run        # Run once
```

### Run End-to-End Tests
Make sure both backend and frontend are running, then:
```bash
./test-e2e.sh
```

See [TESTING_GUIDE.md](./TESTING_GUIDE.md) for comprehensive testing documentation.

## Tech Stack

- **Backend:** TypeScript + Bun, Hono web framework, Effect for functional programming, Zod validation, Vitest testing
- **Frontend:** React 19 + Vite, react-markdown for rendering, Zustand state management
- **Storage:** JSON files in `data/conversations/`
- **Package Management:** Bun for both backend and frontend
- **Effects:** Effect for type-safe error handling, dependency injection, and concurrency
