# Type Definitions Documentation

This document describes the complete type system for the LLM Council frontend, defined in `src/types.ts`.

## Overview

The type system is comprehensive and mirrors the backend API schema, providing full type safety across the entire application. All types are exported from `src/types.ts` for use throughout the codebase.

## Stage Response Types

### Stage1Response
Individual response from a council member model.

```typescript
interface Stage1Response {
  model: string;              // e.g., "openai/gpt-4"
  content: string;            // The model's response text
  reasoning_details?: string; // Optional reasoning explanation
}
```

**Usage:** Displayed in `Stage1Enhanced` component with tabs for each model.

### Stage2Ranking
Evaluation and ranking from a peer model.

```typescript
interface Stage2Ranking {
  model: string;                // Evaluator model
  ranking: string;              // Raw ranking text
  parsed_ranking: string[];     // Extracted ranking like ["Response A", "Response B", ...]
}
```

**Usage:** Displayed in `Stage2Enhanced` with raw text and extracted rankings.

### Stage3Response
Final synthesized response from the chairman model.

```typescript
interface Stage3Response {
  model: string;   // Chairman model identifier
  response: string; // Final synthesized response
}
```

**Usage:** Displayed in `Stage3Enhanced` as the final answer.

## Metadata Types

### AggregateRanking
Calculated statistics for a model's average ranking position.

```typescript
interface AggregateRanking {
  model: string;           // Model identifier
  average_rank: number;    // Average position across all evaluations
  rankings_count: number;  // Number of evaluations that ranked this model
}
```

**Usage:** Displayed in `Stage2Enhanced` as "Street Cred" rankings.

### LabelToModelMap
Mapping from anonymous response labels to actual model names.

```typescript
type LabelToModelMap = Record<string, string>;
// Example: { "Response A": "openai/gpt-4", "Response B": "anthropic/claude-3" }
```

**Usage:** De-anonymization in `Stage2Enhanced` for displaying actual model names in evaluations.

### CouncilMetadata
Metadata about the council response.

```typescript
interface CouncilMetadata {
  label_to_model: LabelToModelMap;         // Anonymous label mappings
  aggregate_rankings: AggregateRanking[];  // Sorted aggregate rankings
}
```

**Usage:** Passed to stage components for de-anonymization and ranking display.

## Message Types

### UserMessage
User input message.

```typescript
interface UserMessage {
  role: "user";
  content: string; // The user's question or input
}
```

**Properties:**
- `role`: Always "user"
- `content`: The user's message text

### AssistantMessage
Complete council response with all three stages.

```typescript
interface AssistantMessage {
  role: "assistant";
  stage1: Stage1Response[];      // Individual responses from council members
  stage2: Stage2Ranking[];       // Peer evaluations and rankings
  stage3: Stage3Response;        // Final synthesis from chairman
  metadata?: CouncilMetadata;    // Metadata about the response
}
```

**Properties:**
- `stage1`: Array of responses from each council member
- `stage2`: Array of rankings from each evaluating model
- `stage3`: Single final response from chairman
- `metadata`: Optional metadata with label mappings and aggregate rankings

### Message Union
Union type for all message types.

```typescript
type Message = UserMessage | AssistantMessage;
```

**Usage:** Type guard checks to determine message type:
```typescript
if (message.role === "user") {
  // message is UserMessage
} else {
  // message is AssistantMessage
}
```

## Conversation Types

### Conversation
Complete conversation with all messages and metadata.

```typescript
interface Conversation {
  id: string;                       // Unique conversation identifier
  created_at: string;               // ISO 8601 timestamp
  title: string;                    // Conversation title
  messages: Message[];              // All messages in conversation
}
```

**Properties:**
- `id`: Unique UUID or identifier from backend
- `created_at`: Timestamp when conversation was created
- `title`: Auto-generated or user-specified title
- `messages`: Array of user and assistant messages

### ConversationMetadata
Lightweight metadata for conversation list display.

```typescript
interface ConversationMetadata {
  id: string;           // Unique identifier
  created_at: string;   // ISO 8601 timestamp
  title: string;        // Conversation title
  message_count: number; // Total message count (user + assistant)
}
```

**Usage:** Used in conversation list in `Sidebar.tsx` without loading full message history.

## API Response Types

### CreateConversationResponse
Response when creating a new conversation.

```typescript
interface CreateConversationResponse {
  id: string;
  created_at: string;
  title: string;
  messages: Message[];
}
```

### ListConversationsResponse
Array of conversation metadata.

```typescript
type ListConversationsResponse = ConversationMetadata[];
```

## Streaming Event Types

### StreamEvent
Base type for streaming events from SSE.

```typescript
type StreamEvent = {
  data?: Stage1Response[] | Stage2Ranking[] | Stage3Response | null;
  metadata?: CouncilMetadata;
};
```

**Event Types:**
- `stage1_start`: Stage 1 beginning
- `stage1_complete`: Stage 1 data available
- `stage2_start`: Stage 2 beginning
- `stage2_complete`: Stage 2 data with metadata
- `stage3_start`: Stage 3 beginning
- `stage3_complete`: Stage 3 data available
- `title_complete`: Conversation title generated
- `complete`: Streaming complete
- `error`: Error occurred during streaming

## UI-Specific Types

### UIMessage
Internal type for messages with loading state.

```typescript
type UIMessage = Message & {
  loading?: {
    stage1: boolean;
    stage2: boolean;
    stage3: boolean;
  };
};
```

**Usage:** Used in components to track which stages are currently loading.

### ExtendedMessage
App-level extension of AssistantMessage with loading states.

```typescript
interface ExtendedMessage extends AssistantMessage {
  loading?: {
    stage1?: boolean;
    stage2?: boolean;
    stage3?: boolean;
  };
}
```

## Type Guards and Helpers

### isAssistantMessage
Check if a message is an AssistantMessage.

```typescript
function isAssistantMessage(message: Message): message is AssistantMessage {
  return message.role === "assistant";
}
```

### isUserMessage
Check if a message is a UserMessage.

```typescript
function isUserMessage(message: Message): message is UserMessage {
  return message.role === "user";
}
```

### Usage Example
```typescript
const message: Message = ...;

if (isUserMessage(message)) {
  console.log(message.content); // Typed as UserMessage
} else {
  console.log(message.stage1);  // Typed as AssistantMessage
}
```

## Message Converter Utilities

See `src/lib/message-converter.ts` for utility functions:

- `messageToDisplayFormat()`: Convert message to display-friendly structure
- `getMainContent()`: Extract primary text content from message
- `isMessageComplete()`: Check if all stages are available
- `isMessageLoading()`: Check if any stages are loading

## API Client Types

The `api.ts` file uses these types for API communication:

```typescript
// List conversations
api.listConversations(): Promise<ConversationMetadata[]>

// Create conversation
api.createConversation(): Promise<CreateConversationResponse>

// Get conversation
api.getConversation(id: string): Promise<Conversation>

// Send message
api.sendMessage(id: string, content: string): Promise<Conversation>

// Stream message
api.sendMessageStream(
  id: string,
  content: string,
  callback: (eventType: string, event: StreamEvent) => void
): Promise<void>
```

## Type Compatibility

### Type Narrowing
Types are designed to work with TypeScript's type narrowing:

```typescript
const message: Message = ...;

// Type narrowing with discriminated union
switch (message.role) {
  case "user":
    // message is UserMessage here
    processUserInput(message.content);
    break;
  case "assistant":
    // message is AssistantMessage here
    displayStages(message.stage1, message.stage2, message.stage3);
    break;
}
```

### Optional Properties
Properties marked with `?` are optional and should be checked before use:

```typescript
const assistantMsg: AssistantMessage = ...;

if (assistantMsg.metadata) {
  // Safe to access metadata
  const rankings = assistantMsg.metadata.aggregate_rankings;
}

if (assistantMsg.stage1?.length) {
  // Safe to iterate stage1
}
```

## Common Patterns

### Type-Safe Message Handling
```typescript
const handleMessage = (message: Message) => {
  if (message.role === "user") {
    displayUserMessage(message.content);
  } else {
    displayStages(message);
  }
};
```

### Safe Metadata Access
```typescript
const getRankings = (message: AssistantMessage) => {
  return message.metadata?.aggregate_rankings ?? [];
};
```

### Stage Availability Check
```typescript
const isReady = (message: AssistantMessage) => {
  return !!(message.stage1 && message.stage2 && message.stage3);
};
```

## Exporting Types

All types are exported from `src/types.ts`:

```typescript
export { /* all types and interfaces */ };
export type { /* all type aliases */ };
```

**Import Examples:**
```typescript
import type { Message, Stage1Response, AggregateRanking } from "../types";
import { isAssistantMessage } from "../types";
```

## Strict Mode Compliance

All types are defined with TypeScript strict mode enabled, ensuring:
- No implicit `any` types
- Null/undefined safety
- Strict null checks
- Strict property initialization

This provides maximum type safety for the application.
