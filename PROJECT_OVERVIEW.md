# Ensemble: Multi-Model AI Deliberation System

## Overview

Ensemble is a lightweight web application that orchestrates multiple Large Language Models (LLMs) to collaboratively answer questions through a structured 3-stage deliberation process. By leveraging anonymous peer review, the system prevents model bias and produces higher-quality, synthesized answers.

## How It Works

**Stage 1: Individual Responses** → Query all configured models in parallel to collect diverse perspectives on the user's question.

**Stage 2: Anonymous Peer Review** → Each model evaluates other responses using anonymized labels (Response A, B, C, etc.), preventing bias from model identity. Models rank responses based on accuracy and insight.

**Stage 3: Synthesis** → A designated Chairman model synthesizes all individual responses and peer rankings into a comprehensive final answer.

## Key Features

- **Multi-LLM Ensemble**: Simultaneously query leading models (GPT-5.1, Claude Sonnet 4.5, Gemini 3.0 Pro, Grok-4, etc.) via OpenRouter
- **Bias-Free Evaluation**: Anonymous peer review ensures models evaluate quality, not brand recognition
- **Intelligent Synthesis**: Chairman model produces refined, comprehensive answers incorporating all perspectives
- **Real-Time Streaming**: Progressive updates via Server-Sent Events (SSE) for responsive UX
- **Conversation Persistence**: Save and review past deliberations as JSON files
- **Type-Safe Architecture**: Built with TypeScript, Effect, and functional programming principles

## Technical Stack

**Backend (TypeScript)**
- **Runtime**: Bun 1.0+ with Node.js compatibility
- **Framework**: Hono 4.10.6 (lightweight, TypeScript-native HTTP server)
- **Functional Programming**: Effect 3.8.0 (error handling, dependency injection, concurrency)
- **Validation**: Zod 3.25.76 (runtime schema validation)
- **Testing**: Vitest 1.6.1 (modern test framework)
- **Code Quality**: Ultracite 6.3.6 (unified linter/formatter)

**Frontend (React)**
- **Framework**: React 19.2.0 with hooks and modern features
- **Build Tool**: Vite 7.2.4 (lightning-fast dev server)
- **UI Components**: Assistant UI 0.11.41 for chat interface
- **Visualization**: React Flow 11.11.4 for workflow DAG visualization
- **Styling**: Tailwind CSS 4.1.17 (utility-first CSS)
- **State Management**: Zustand 5.0.8 (lightweight state management)

**Storage**: JSON file-based persistence in `data/conversations/`

## Architecture Highlights

- **Effect-First Design**: All business logic uses Effect for type-safe error handling, dependency injection, and structured concurrency
- **Service Layer Pattern**: Services (OpenRouterClient, StorageService, CouncilService) defined with Effect.Context and Layer-based DI
- **Graceful Degradation**: System continues with successful responses if individual models fail
- **Parallel Execution**: Stage 1 and Stage 2 queries run concurrently for optimal performance
- **Streaming Architecture**: SSE provides real-time progress updates to frontend

## Project Structure

```
ensemble/
├── backend/              # TypeScript backend with Effect
│   ├── src/
│   │   ├── config.ts     # Configuration (models, API keys)
│   │   ├── openrouter.ts # OpenRouter API client
│   │   ├── council.ts    # 3-stage deliberation logic
│   │   ├── storage.ts    # Conversation persistence
│   │   ├── server.ts     # Hono HTTP server
│   │   └── workflow/     # Workflow system (v3 API)
│   └── data/             # Conversation JSON files
├── frontend/             # React frontend
│   ├── src/
│   │   ├── App.tsx       # Main application
│   │   ├── components/   # UI components (ChatArea, WorkflowDAG, etc.)
│   │   └── api.ts        # API client
└── start.sh              # Development startup script
```

## Getting Started

1. **Prerequisites**: Bun 1.0+, OpenRouter API key
2. **Install**: `cd backend && bun install` then `cd frontend && bun install`
3. **Configure**: Create `backend/.env` with `OPENROUTER_API_KEY=your_key`
4. **Run**: `./start.sh` (starts both backend on :8001 and frontend on :5173)
5. **Use**: Open http://localhost:5173 and start asking questions

## Configuration

Models are configured in `backend/src/config.ts`:
- `COUNCIL_MODELS`: Array of OpenRouter model IDs for Stage 1
- `CHAIRMAN_MODEL`: Model ID for Stage 3 synthesis

## API Endpoints

**V1 (Legacy)**: `/api/conversations`, `/api/conversations/:id/message`, `/api/conversations/:id/message/stream`

**V3 (Workflow System)**: `/api/v3/workflows`, `/api/v3/workflows/:id`, `/api/v3/conversations/:id/execute/stream`

## Testing

- **Unit Tests**: `cd backend && bun test` (watch mode) or `bun run test:run` (single run)
- **Integration Tests**: Full 3-stage council flow with mocked services
- **End-to-End**: `./test-e2e.sh` (requires both servers running)

## Code Quality

- **Linting**: Ultracite (run `bun run lint:fix` in both backend/frontend)
- **Type Checking**: `bun run typecheck` (strict TypeScript mode enabled)
- **Formatting**: Automated via Ultracite

## Design Principles

- **Type Safety**: Strict TypeScript, no `any` types, Zod runtime validation
- **Functional Programming**: Immutable data, pure functions, Effect for side effects
- **Error Handling**: Type-safe errors with Data.TaggedError, graceful degradation
- **Testability**: Dependency injection via Effect services enables easy mocking
- **Performance**: Unbounded concurrency for parallel queries, streaming responses

## Future Enhancements

- User-configurable councils via UI
- Model performance analytics over time
- Custom ranking criteria beyond accuracy/insight
- WebSocket support for better mobile compatibility
- Export conversations to markdown/PDF
- API authentication for multi-user deployments

---

**Version**: 2.0.0 (TypeScript rewrite from Python) | **License**: See repository | **Documentation**: See CLAUDE.md for detailed architecture

