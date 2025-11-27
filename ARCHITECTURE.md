# LLM Council Architecture

## System Overview

LLM Council is a multi-stage LLM deliberation system built with TypeScript, Effect, and functional programming principles. It orchestrates multiple AI models to collaboratively answer questions through a structured 3-stage process.

## High-Level Architecture

```
┌─────────────┐
│   Client    │
│  (React)    │
└──────┬──────┘
       │ HTTP/SSE
       ▼
┌─────────────────────────────────────┐
│      Hono API Server (Node.js)      │
│  ┌───────────────────────────────┐  │
│  │    Council Service Layer      │  │
│  │  (Effect-based orchestration) │  │
│  └───────────────────────────────┘  │
│           │           │              │
│  ┌────────▼────┐  ┌─▼─────────┐    │
│  │ OpenRouter  │  │  Storage  │    │
│  │   Client    │  │  Service  │    │
│  └─────────────┘  └───────────┘    │
└─────────────────────────────────────┘
       │                    │
       ▼                    ▼
 ┌──────────┐        ┌──────────┐
 │OpenRouter│        │   JSON   │
 │   API    │        │  Files   │
 └──────────┘        └──────────┘
```

## Core Principles

### 1. Effect-First Design
All business logic uses Effect for:
- **Error Handling**: Type-safe error propagation with Effect.fail
- **Dependency Injection**: Services defined with Context/Layer pattern
- **Concurrency**: Effect.all for parallel operations
- **Resource Management**: Automatic cleanup with Scope

### 2. Functional Programming
- Immutable data structures
- Pure functions where possible
- Composition over inheritance
- Explicit side effects

### 3. Type Safety
- Strict TypeScript mode enabled
- No `any` types
- Zod schemas for runtime validation
- Effect schemas for data transformation

## Component Architecture

### Backend Services

#### AppConfig Service
**Purpose**: Centralized configuration management

**Location**: `backend/src/config.ts`

**Responsibilities**:
- Load environment variables
- Validate configuration at startup
- Provide typed config to other services

**Effect Pattern**:
```typescript
export class AppConfig extends Context.Tag("AppConfig")<
  AppConfig,
  {
    openRouterApiKey: string;
    councilModels: string[];
    chairmanModel: string;
    port: number;
  }
>() {
  static readonly Default = Layer.effect(
    this,
    Effect.gen(function* () {
      const openRouterApiKey = yield* Config.string("OPENROUTER_API_KEY");
      // ... validation and construction
      return AppConfig.of({ ... });
    })
  );
}
```

#### OpenRouterClient Service
**Purpose**: Interface with OpenRouter API

**Location**: `backend/src/openrouter.ts`

**Responsibilities**:
- Execute LLM queries
- Handle API errors gracefully
- Stream responses
- Manage timeouts

**Effect Pattern**:
```typescript
export class OpenRouterClient extends Context.Tag("OpenRouterClient")<
  OpenRouterClient,
  {
    query: (model: string, messages: Message[]) => Effect.Effect<Response, CouncilError>;
    queryStream: (model: string, messages: Message[]) => Stream.Stream<Chunk, CouncilError>;
  }
>() {
  static readonly Default = Layer.succeed(
    this,
    {
      query: (model, messages) => Effect.gen(function* () { ... }),
      queryStream: (model, messages) => Stream.make(...),
    }
  );
}
```

#### StorageService
**Purpose**: Persist and retrieve conversations

**Location**: `backend/src/storage.ts`

**Responsibilities**:
- CRUD operations for conversations
- File system management
- Data validation with Zod
- Concurrent access handling

**Effect Pattern**:
```typescript
export class StorageService extends Context.Tag("StorageService")<
  StorageService,
  {
    createConversation: (id: string) => Effect.Effect<Conversation, CouncilError>;
    getConversation: (id: string) => Effect.Effect<Conversation, CouncilError>;
    listConversations: () => Effect.Effect<ConversationMetadata[], CouncilError>;
    addMessage: (id: string, message: Message) => Effect.Effect<void, CouncilError>;
  }
>() {
  static readonly Default = Layer.effect(
    this,
    Effect.gen(function* () { ... })
  );
}
```

#### CouncilService
**Purpose**: Orchestrate the 3-stage deliberation process

**Location**: `backend/src/council.ts`

**Responsibilities**:
- Stage 1: Collect parallel responses from all models
- Stage 2: Anonymize and collect peer rankings
- Stage 3: Synthesize final answer via Chairman
- Calculate aggregate rankings
- Generate conversation titles

**Effect Pattern**:
```typescript
export class CouncilService extends Context.Tag("CouncilService")<
  CouncilService,
  {
    stage1CollectResponses: (query: string) => Effect.Effect<Stage1Response[], CouncilError>;
    stage2CollectRankings: (query: string, stage1: Stage1Response[]) => Effect.Effect<[Stage2Response[], LabelToModelMap], CouncilError>;
    stage3SynthesizeFinal: (query: string, stage1: Stage1Response[], stage2: Stage2Response[]) => Effect.Effect<Stage3Response, CouncilError>;
    runFullCouncil: (query: string) => Effect.Effect<CouncilResult, CouncilError>;
  }
>() {
  static readonly Default = Layer.effect(
    this,
    Effect.gen(function* () {
      const openRouter = yield* OpenRouterClient;
      const storage = yield* StorageService;
      return CouncilService.of({ ... });
    })
  );
}
```

## Data Flow

### 1. User Query Submission

```
User POST → Hono Handler → CouncilService.runFullCouncil
                                    ↓
                          Effect.gen(function* () {
                            yield* Stage 1 (parallel)
                            yield* Stage 2 (parallel)
                            yield* Stage 3 (single)
                            return result
                          })
```

### 2. Stage 1: Parallel Collection

```typescript
Effect.all(
  councilModels.map(model =>
    openRouter.query(model, messages).pipe(
      Effect.map(response => ({ model, content: response })),
      Effect.catchAll(error => Effect.succeed({ model, content: null }))
    )
  ),
  { concurrency: "unbounded" }
)
```

**Key Features**:
- Unbounded concurrency for speed
- Graceful degradation on model failures
- Timeout handling per model

### 3. Stage 2: Anonymous Peer Review

```typescript
// 1. Anonymize responses
const labelToModel = createLabels(stage1Results);
const anonymizedPrompt = buildAnonymousPrompt(query, stage1Results);

// 2. Parallel ranking queries
Effect.all(
  councilModels.map(model =>
    openRouter.query(model, [anonymizedPrompt]).pipe(
      Effect.map(response => parseRankings(response))
    )
  ),
  { concurrency: "unbounded" }
)
```

**Key Features**:
- Responses labeled as "Response A", "Response B", etc.
- Models can't see which model produced which response
- Prevents brand bias in evaluations

### 4. Stage 3: Chairman Synthesis

```typescript
openRouter.query(chairmanModel, [
  {
    role: "user",
    content: buildSynthesisPrompt(query, stage1Results, stage2Results)
  }
])
```

**Key Features**:
- Full context from all stages
- Rankings inform synthesis
- Final answer is comprehensive

## Error Handling Strategy

### Error Types

**Location**: `backend/src/errors.ts`

```typescript
export class CouncilError extends Data.TaggedError("CouncilError")<{
  message: string;
  cause?: unknown;
}> {}

export class ConfigError extends Data.TaggedError("ConfigError")<{
  message: string;
  field: string;
}> {}

export class StorageError extends Data.TaggedError("StorageError")<{
  message: string;
  operation: "read" | "write" | "delete";
  path?: string;
}> {}

export class OpenRouterError extends Data.TaggedError("OpenRouterError")<{
  message: string;
  model?: string;
  statusCode?: number;
}> {}
```

### Error Propagation

```typescript
// Services return Effect<Success, Error>
const result: Effect.Effect<Conversation, StorageError> = 
  storageService.getConversation(id);

// Errors can be transformed
const handled = result.pipe(
  Effect.catchTag("StorageError", error =>
    Effect.fail(new CouncilError({ message: "Storage failed", cause: error }))
  )
);

// Or logged and recovered
const recovered = result.pipe(
  Effect.catchAll(error => {
    console.error("Error:", error);
    return Effect.succeed(defaultConversation);
  })
);
```

## Concurrency Model

### Parallel Execution
Use `Effect.all` with `concurrency: "unbounded"` for independent operations:
- Stage 1: All model queries in parallel
- Stage 2: All ranking queries in parallel

### Sequential Execution
Use `Effect.gen` with `yield*` for dependent operations:
- Stages must complete in order (1 → 2 → 3)
- Storage operations (read before write)

### Resource Management
Effect automatically handles:
- Interruption (user cancels request)
- Cleanup (close connections, files)
- Finalization (always runs)

## Testing Strategy

### Unit Tests
**Pattern**: Test services in isolation with mocked dependencies

```typescript
test("CouncilService stage1", async () => {
  const mockOpenRouter = Layer.succeed(OpenRouterClient, {
    query: () => Effect.succeed({ content: "test" })
  });

  const result = await CouncilService.stage1CollectResponses("test").pipe(
    Effect.provide(mockOpenRouter),
    Effect.runPromise
  );

  expect(result).toHaveLength(4);
});
```

### Integration Tests
**Pattern**: Test service composition with real implementations

```typescript
test("Full council flow", async () => {
  const testLayers = AppConfig.Test.pipe(
    Layer.provide(StorageService.InMemory),
    Layer.provide(OpenRouterClient.Default)
  );

  const result = await CouncilService.runFullCouncil("What is AI?").pipe(
    Effect.provide(testLayers),
    Effect.runPromise
  );

  expect(result.stage1).toBeDefined();
  expect(result.stage2).toBeDefined();
  expect(result.stage3).toBeDefined();
});
```

## Deployment Architecture

### Development
```
npm run dev  →  tsx watch  →  Bun runtime
```

### Production
```
npm run build  →  tsc compile  →  Node.js runtime
```

### Container (Future)
```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package.json bun.lock ./
RUN npm install --production
COPY dist ./dist
CMD ["node", "dist/main.js"]
```

## Performance Considerations

### Bottlenecks
1. **OpenRouter API latency**: 3-30s per stage
2. **Parallel queries**: Limited by OpenRouter rate limits
3. **Storage I/O**: JSON file reads/writes

### Optimizations
1. **Unbounded concurrency**: Maximize parallel execution
2. **Graceful degradation**: Continue on partial failures
3. **Streaming**: SSE for progressive updates
4. **Caching** (future): Cache similar queries

## Security Considerations

### Current
- API key in environment variable
- CORS restrictions
- Input validation with Zod

### Planned
- API authentication (JWT)
- Rate limiting
- Input sanitization
- Security headers
- CSP policy
- Audit logging

## Scalability Path

### Phase 1: Single Instance (Current)
- Node.js process
- JSON file storage
- In-memory state

### Phase 2: Horizontal Scaling
- Multiple Node.js instances
- Load balancer
- Shared database (PostgreSQL)
- Redis for sessions/cache

### Phase 3: Multi-Region
- CDN for static assets
- Regional API instances
- Database replication
- Distributed tracing

## Future Enhancements

1. **Observability**
   - Structured logging with Effect Logger
   - Metrics with Prometheus
   - Distributed tracing with OpenTelemetry

2. **Advanced Features**
   - Streaming responses from models
   - Custom evaluation criteria
   - Model performance analytics
   - User-configurable councils

3. **Infrastructure**
   - Kubernetes deployment
   - Auto-scaling
   - Multi-region failover
   - Disaster recovery

## References

- [Effect Documentation](https://effect.website/)
- [Hono Documentation](https://hono.dev/)
- [OpenRouter API](https://openrouter.ai/docs)
- [Zod Documentation](https://zod.dev/)
