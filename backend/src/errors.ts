import { Data } from "effect";

/**
 * Domain errors for the LLM Council application
 * Using Data.TaggedError for type-safe error handling
 */

// API-related errors
export class ApiError extends Data.TaggedError("ApiError")<{
  readonly message: string;
  readonly model?: string;
  readonly statusCode?: number;
}> {}

export class OpenRouterError extends Data.TaggedError("OpenRouterError")<{
  readonly message: string;
  readonly model: string;
  readonly cause?: unknown;
}> {}

export class TimeoutError extends Data.TaggedError("TimeoutError")<{
  readonly operation: string;
  readonly timeoutMs: number;
}> {}

// Storage-related errors
export class StorageError extends Data.TaggedError("StorageError")<{
  readonly message: string;
  readonly operation: string;
  readonly path?: string;
  readonly cause?: unknown;
}> {}

export class ConversationNotFoundError extends Data.TaggedError(
  "ConversationNotFoundError"
)<{
  readonly conversationId: string;
}> {}


export class ValidationError extends Data.TaggedError("ValidationError")<{
  readonly field: string;
  readonly message: string;
  readonly value?: unknown;
}> {}

// Configuration errors
export class ConfigError extends Data.TaggedError("ConfigError")<{
  readonly key: string;
  readonly message: string;
}> {}

// Rate limiting errors
export class RateLimitError extends Data.TaggedError("RateLimitError")<{
  readonly message: string;
  readonly identifier: string;
  readonly limit: number;
  readonly windowMs: number;
  readonly retryAfter?: number; // seconds until limit resets
}> {}
