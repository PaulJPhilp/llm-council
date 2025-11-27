# Contributing to LLM Council

Thank you for your interest in contributing to LLM Council! This guide will help you get started.

## Development Setup

### Prerequisites
- Node.js 18+ or Bun 1.0+
- npm or bun package manager
- TypeScript knowledge
- Familiarity with Effect (recommended)

### Initial Setup

1. **Clone the repository**
   ```bash
   git clone https://github.com/YOUR_USERNAME/llm-council.git
   cd llm-council
   ```

2. **Install backend dependencies**
   ```bash
   cd backend
   npm install  # or: bun install
   ```

3. **Install frontend dependencies**
   ```bash
   cd ../frontend
   npm install  # or: bun install
   ```

4. **Configure environment**
   ```bash
   cd ../backend
   cp .env.example .env
   # Edit .env and add your OPENROUTER_API_KEY
   ```

5. **Run tests**
   ```bash
   cd backend
   npm test
   ```

6. **Start development servers**
   ```bash
   # Terminal 1 - Backend
   cd backend
   npm run dev

   # Terminal 2 - Frontend
   cd frontend
   npm run dev
   ```

## Code Style

### TypeScript
- **Strict mode**: All code must pass TypeScript strict checks
- **No `any` types**: Use proper types or `unknown`
- **Explicit return types**: For public functions
- **Functional style**: Prefer pure functions and immutability

### Effect Patterns
- **Services**: Use `Context.Tag` pattern for dependency injection
- **Error handling**: Return `Effect<Success, Error>` instead of throwing
- **Concurrency**: Use `Effect.all` for parallel operations
- **Resources**: Use `Effect.acquireRelease` for cleanup

### Example Service
```typescript
export class MyService extends Context.Tag("MyService")<
  MyService,
  {
    doSomething: (input: string) => Effect.Effect<Result, MyError>;
  }
>() {
  static readonly Default = Layer.effect(
    this,
    Effect.gen(function* () {
      const dependency = yield* DependencyService;
      return MyService.of({
        doSomething: (input) => Effect.gen(function* () {
          // Implementation
        })
      });
    })
  );
}
```

### Formatting
We use **Ultracite** (powered by Biome) for code formatting:

```bash
# Check formatting
npm run lint

# Auto-fix issues
npm run lint:fix
```

Formatting is enforced via pre-commit hooks.

## Testing

### Test Structure
- **Unit tests**: `*.test.ts` files alongside source
- **Integration tests**: `*.integration.test.ts` for multi-service tests
- **E2E tests**: `test-e2e.sh` for full application flow

### Writing Tests

```typescript
import { Effect, Layer } from "effect";
import { describe, test, expect } from "vitest";

describe("MyService", () => {
  test("should do something", async () => {
    // Arrange
    const mockDep = Layer.succeed(DependencyService, {
      method: () => Effect.succeed("mocked")
    });

    // Act
    const result = await MyService.doSomething("input").pipe(
      Effect.provide(mockDep),
      Effect.runPromise
    );

    // Assert
    expect(result).toBe("expected");
  });

  test("should handle errors", async () => {
    const mockDep = Layer.succeed(DependencyService, {
      method: () => Effect.fail(new MyError({ message: "test" }))
    });

    const result = await MyService.doSomething("input").pipe(
      Effect.provide(mockDep),
      Effect.flip,  // Convert errors to success for testing
      Effect.runPromise
    );

    expect(result).toBeInstanceOf(MyError);
  });
});
```

### Running Tests

```bash
# Watch mode
npm test

# Run once (CI mode)
npm run test:run

# With coverage
npm run test:coverage

# UI mode
npm run test:ui
```

### Coverage Requirements
- New features: **80%+ coverage**
- Bug fixes: Add regression test
- Refactors: Maintain or improve coverage

## Commit Messages

We follow **Conventional Commits** format:

```
<type>(<scope>): <subject>

<body>

<footer>
```

### Types
- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation changes
- `style`: Code style changes (formatting, etc.)
- `refactor`: Code refactoring
- `test`: Adding or updating tests
- `chore`: Maintenance tasks

### Examples
```
feat(council): add streaming support for Stage 1

Implement SSE streaming for individual model responses in Stage 1.
This allows the UI to show progressive updates as models respond.

Closes #123
```

```
fix(storage): handle concurrent write access

Add file locking to prevent data corruption when multiple
requests try to update the same conversation simultaneously.
```

```
docs(architecture): document Effect patterns

Add comprehensive documentation for the Effect-based service
architecture, including examples and best practices.
```

## Pull Request Process

### 1. Create a Feature Branch
```bash
git checkout -b feat/your-feature-name
# or
git checkout -b fix/bug-description
```

### 2. Make Your Changes
- Write code following style guidelines
- Add tests for new functionality
- Update documentation if needed
- Ensure all tests pass

### 3. Run Quality Checks
```bash
# Backend
cd backend
npm run typecheck
npm run lint
npm test

# Frontend
cd frontend
npm run typecheck
npm run lint
```

### 4. Commit Your Changes
```bash
git add .
git commit -m "feat(scope): description"
```

### 5. Push and Create PR
```bash
git push origin feat/your-feature-name
```

Then create a Pull Request on GitHub with:
- Clear description of changes
- Link to related issues
- Screenshots (if UI changes)
- Test results

### 6. Code Review
- Address reviewer feedback
- Keep PR focused and atomic
- Rebase if needed for clean history

### 7. Merge
Once approved, PR will be merged by a maintainer.

## Project Structure

```
llm-council/
├── backend/
│   ├── src/
│   │   ├── config.ts          # Configuration service
│   │   ├── council.ts         # Main council logic
│   │   ├── errors.ts          # Error types
│   │   ├── main.ts            # Hono API server
│   │   ├── openrouter.ts      # OpenRouter client
│   │   └── storage.ts         # Storage service
│   ├── package.json
│   ├── tsconfig.json
│   └── vitest.config.ts
├── frontend/
│   ├── src/
│   │   ├── components/        # React components
│   │   ├── lib/               # Utilities
│   │   ├── App.tsx            # Main app
│   │   ├── api.ts             # API client
│   │   └── types.ts           # TypeScript types
│   ├── package.json
│   └── vite.config.ts
├── docs/                      # Additional documentation
├── ARCHITECTURE.md            # System architecture
├── CONTRIBUTING.md            # This file
├── README.md                  # Project overview
└── TESTING_GUIDE.md           # Testing documentation
```

## Effect Learning Resources

If you're new to Effect, these resources will help:

1. **Official Docs**: https://effect.website/
2. **Getting Started**: https://effect.website/docs/getting-started
3. **Effect Schema**: https://effect.website/docs/schema/introduction
4. **Error Handling**: https://effect.website/docs/error-management

### Key Concepts

**Effect**: Lazy description of a computation that may fail or require dependencies
```typescript
const program: Effect<Success, Error, Requirements> = Effect.gen(function* () {
  const dep = yield* MyService;
  const result = yield* dep.doWork();
  return result;
});
```

**Layer**: Recipe for constructing services with dependencies
```typescript
const MyServiceLive = Layer.effect(MyService, 
  Effect.gen(function* () {
    const config = yield* AppConfig;
    return MyService.of({ ... });
  })
);
```

**Context**: Type-safe dependency injection
```typescript
class MyService extends Context.Tag("MyService")<MyService, { ... }>() {}
```

## Common Tasks

### Adding a New Model
1. Update `backend/src/config.ts` - add to `COUNCIL_MODELS`
2. Test with existing flows
3. Update documentation

### Adding a New Endpoint
1. Add route in `backend/src/main.ts`
2. Implement logic in appropriate service
3. Add tests in `*.test.ts`
4. Update API documentation

### Adding a New Service
1. Create `backend/src/new-service.ts`
2. Define with `Context.Tag` pattern
3. Implement with `Layer.effect`
4. Add to service composition in `main.ts`
5. Add unit tests

### Debugging Effect Code
```typescript
const program = Effect.gen(function* () {
  const result = yield* someEffect.pipe(
    Effect.tap(x => Effect.log("Debug:", x)),  // Log intermediate values
    Effect.tapError(e => Effect.log("Error:", e))  // Log errors
  );
  return result;
});

// Run with logging
Effect.runPromise(program.pipe(Effect.provide(Logger.pretty)));
```

## Getting Help

- **Issues**: Check existing issues or create a new one
- **Discussions**: Use GitHub Discussions for questions
- **Documentation**: Check `docs/` and code comments
- **Effect Discord**: https://discord.gg/effect-ts (for Effect-specific questions)

## Code of Conduct

- Be respectful and inclusive
- Focus on constructive feedback
- Help others learn and grow
- Assume good intentions

## License

By contributing, you agree that your contributions will be licensed under the project's license.

Thank you for contributing! 🎉
