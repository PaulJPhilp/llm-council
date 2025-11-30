# Ensemble

![ensemble](header.jpg)

## Inspiration

Ensemble is inspired by Andrej Karpathy's idea of LLM committees / councils ([link](https://x.com/karpathy/status/1992381094667411768)): rather than trusting a single model, you run multiple models, have them critique each other's answers, and then synthesize a final answer.

Ensemble takes that idea and turns it into a production-ready TypeScript + Effect system with:

- parallel model querying
- anonymous peer review
- a "chairman" synthesis stage
- strict typing, streaming, and persistence

## Overview

Ensemble enables multi-model AI deliberation by consulting multiple LLM providers (e.g., OpenAI GPT 5.1, Google Gemini 3.0 Pro, Anthropic Claude Sonnet 4.5, xAI Grok 4) simultaneously. It's a lightweight web application that uses OpenRouter to query multiple LLMs, facilitates anonymous peer review where models rank each other's responses, and synthesizes a final answer through a designated Chairman model.

In a bit more detail, here is what happens when you submit a query:

1. **Stage 1: Individual Responses**. The user query is sent to all ensemble members (configured LLMs) in parallel, and their responses are collected. Individual responses are displayed in a tabbed interface for inspection.
2. **Stage 2: Peer Review**. Each ensemble member evaluates the other responses with anonymized labels (Response A, B, C, etc.), preventing bias from model identity. Rankings are based on accuracy and insight.
3. **Stage 3: Synthesis**. The designated Chairman model synthesizes all individual responses and peer rankings into a single, comprehensive final answer.

## Features

- **Multi-LLM Ensemble**: Consult multiple leading LLMs simultaneously (GPT, Claude, Gemini, Grok, etc.)
- **Anonymous Peer Review**: Ensemble members evaluate each other's work without bias from model identity
- **Intelligent Synthesis**: A designated Chairman model produces a refined, comprehensive answer
- **Real-time Streaming**: Progressive updates via Server-Sent Events (SSE)
- **Conversation Persistence**: Save and review past ensemble deliberations
- **Type-Safe Architecture**: Built with TypeScript, Bun, and Effect for reliability and correctness

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
