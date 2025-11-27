# Testing Guide - LLM Council Backend

Comprehensive guide to testing the TypeScript backend.

## Test Structure

The backend includes three types of tests:

1. **Unit Tests** - Test individual functions in isolation
   - `council.test.ts` - Tests for ranking parsing and aggregation
   - `storage.test.ts` - Tests for file I/O and data persistence

2. **Integration Tests** - Test API endpoints and flows
   - `main.test.ts` - API endpoint tests
   - `council.integration.test.ts` - Full 3-stage council flow with mocks

3. **E2E Tests** - Test full system with frontend (manual)

## Running Tests

### Unit & Integration Tests

```bash
cd backend

# Run all tests with watch mode (re-run on file changes)
npm test

# Run all tests once
npm run test:run

# Run specific test file
npm test council.test.ts

# Run with UI viewer
npm run test:ui

# Run with coverage
npm run test:coverage

# TypeScript type checking
npm run typecheck
```

## Test Coverage

### Unit Tests

**council.test.ts** (220 lines)
- ✅ `parseRankingFromText()` - Various ranking formats
- ✅ `calculateAggregateRankings()` - Ranking aggregation and sorting
- ✅ Edge cases: empty data, missing labels, malformed text

**storage.test.ts** (280 lines)
- ✅ `createConversation()` - Create new conversations
- ✅ `getConversation()` - Retrieve conversations
- ✅ `listConversations()` - List with pagination
- ✅ `addUserMessage()` - Message insertion
- ✅ `addAssistantMessage()` - Multi-stage message storage
- ✅ `updateConversationTitle()` - Title updates
- ✅ Error handling and edge cases
- ✅ Complete conversation lifecycle

### Integration Tests

**main.test.ts** (330 lines)
- ✅ `GET /` - Health check
- ✅ `POST /api/conversations` - Create conversation
- ✅ `GET /api/conversations` - List conversations
- ✅ `GET /api/conversations/{id}` - Get specific conversation
- ✅ `POST /api/conversations/{id}/message` - Send message (errors)
- ✅ `POST /api/conversations/{id}/message/stream` - Stream endpoint (errors)
- ✅ CORS headers and preflight requests
- ✅ Error responses (404, 400, 500)
- ✅ Complete conversation lifecycle

**council.integration.test.ts** (420 lines)
- ✅ Stage 1: Response collection with mocked API
- ✅ Stage 2: Ranking collection with mocked API
- ✅ Stage 3: Final synthesis with mocked API
- ✅ Full 3-stage flow with metadata
- ✅ Partial failures in each stage
- ✅ Complete failure handling
- ✅ Aggregate ranking calculation

## Test Execution Details

### Key Test Patterns

**Mocking OpenRouter API:**
```typescript
vi.spyOn(openrouter, 'queryModelsParallel').mockResolvedValueOnce({
  'model-id': { content: 'response' }
});
```

**Testing File I/O:**
Tests use a separate `data/test-conversations` directory to avoid affecting real data.

**API Testing:**
Uses native Hono `fetch` API to test endpoints without HTTP server.

## Expected Test Results

Running `npm run test:run` should produce output like:

```
✓ council.test.ts (2 suites, 10 tests)
✓ storage.test.ts (2 suites, 20 tests)
✓ main.test.ts (4 suites, 18 tests)
✓ council.integration.test.ts (5 suites, 15 tests)

Test Files: 4 passed (4)
Tests: 63 passed (63)
Duration: 1.23s
```

## Manual Testing

### Prerequisites

1. Start the backend:
```bash
cd backend
npm run dev
```

2. Backend should be running on http://localhost:8001

### Health Check

```bash
curl http://localhost:8001/
# Expected: {"status": "ok", "service": "LLM Council API"}
```

### Create Conversation

```bash
CONV_ID=$(curl -s -X POST http://localhost:8001/api/conversations | jq -r '.id')
echo "Created conversation: $CONV_ID"
```

### Send Message (Batch)

Requires valid OpenRouter API key in `.env`:

```bash
curl -X POST http://localhost:8001/api/conversations/$CONV_ID/message \
  -H "Content-Type: application/json" \
  -d '{"content": "What is artificial intelligence?"}' \
  | jq '.'
```

### Send Message (Streaming)

Watch the stages complete in real-time:

```bash
curl -X POST http://localhost:8001/api/conversations/$CONV_ID/message/stream \
  -H "Content-Type: application/json" \
  -d '{"content": "What is machine learning?"}' \
  | while IFS= read -r line; do
    if [[ $line == "data: "* ]]; then
      echo "${line:6}" | jq '.'
    fi
  done
```

### List Conversations

```bash
curl http://localhost:8001/api/conversations | jq '.'
```

### Get Conversation

```bash
curl http://localhost:8001/api/conversations/$CONV_ID | jq '.'
```

## End-to-End Testing

### Setup

1. Start backend:
```bash
cd backend && npm run dev
```

2. In another terminal, start frontend:
```bash
cd frontend && npm run dev
```

3. Open http://localhost:5173 in browser

### Test Scenarios

#### Scenario 1: Basic Conversation Flow
1. Click "New Conversation"
2. Enter question in textarea
3. Press Enter or click Send
4. Watch stages complete (1 → 2 → 3)
5. Verify final answer appears

#### Scenario 2: Multiple Conversations
1. Ask first question
2. Create another conversation
3. Ask different question
4. Switch between conversations
5. Verify each has correct history

#### Scenario 3: Error Handling
1. Try to send empty message (should prevent)
2. Check console for errors
3. Verify error UI is graceful

#### Scenario 4: Stage Inspection
1. Send a message and let it complete
2. Click on Stage 1 tab to see individual responses
3. Click on Stage 2 tab to see rankings
4. Click on Stage 3 tab to see final answer
5. Verify all data is present and correct

#### Scenario 5: Model De-anonymization
In Stage 2 view:
1. Look at raw evaluation text (shows Response A, B, C, D)
2. Look at extracted ranking (shows Response letters)
3. Hover over model names (should be bold, indicating display names)
4. Verify aggregate rankings show actual model names

## Performance Benchmarks

Typical execution times (on modern hardware):

- **Stage 1** (4 parallel queries): 15-30 seconds
- **Stage 2** (4 parallel queries): 20-40 seconds
- **Stage 3** (1 query): 5-10 seconds
- **Title generation**: 2-5 seconds (parallel with other stages)

Total per conversation: 40-85 seconds

## Continuous Integration

### GitHub Actions Example

```yaml
name: Backend Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: 18
      - run: cd backend && npm install
      - run: cd backend && npm run typecheck
      - run: cd backend && npm run test:run
```

## Troubleshooting Tests

### Tests Hanging
- Check if test timeout is sufficient (default 30s)
- Update vitest.config.ts: `testTimeout: 60000`

### Module Not Found
- Ensure `npm install` was run
- Check file paths in imports

### TypeScript Errors
- Run `npm run typecheck` to see compile errors
- Verify tsconfig.json strict mode settings

### Mock Not Working
- Ensure mock is set up before function is called
- Use `vi.restoreAllMocks()` after test
- Check spy is on correct module/function

## Adding New Tests

1. Create test file with `.test.ts` extension
2. Import test utilities:
```typescript
import { describe, it, expect, beforeAll, afterEach } from 'vitest';
```

3. Structure tests:
```typescript
describe('Feature Name', () => {
  it('should do something', () => {
    expect(result).toEqual(expected);
  });
});
```

4. Run with `npm test filename.test.ts`

## Test Best Practices

1. **Isolation**: Each test should be independent
2. **Cleanup**: Use `afterEach` to clean up state
3. **Mocking**: Mock external dependencies (APIs, file system)
4. **Assertions**: Use specific assertions, not just `expect().toBeTruthy()`
5. **Naming**: Use descriptive test names that explain what is being tested

## Coverage Goals

Target coverage metrics:
- Statements: 80%+
- Branches: 75%+
- Functions: 85%+
- Lines: 80%+

Check coverage:
```bash
npm run test:coverage
```

---

**Note**: Tests use mocked API responses to avoid hitting the actual OpenRouter API during testing. For live API testing, see manual testing section.
