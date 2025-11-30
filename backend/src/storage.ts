import { promises as fs } from "node:fs";
import { join } from "node:path";
import { Effect, Either, Layer, Schema } from "effect";
import { AppConfig } from "./config";
import { StorageError } from "./errors";
import {
  trackStorageOperation,
  withSpan,
  logError,
} from "./observability";

// Type definitions
export type UserMessage = {
  role: "user";
  content: string;
};

export type AssistantMessage = {
  role: "assistant";
  stage1: Stage1Response[];
  stage2: Stage2Response[];
  stage3: Stage3Response;
};

export type Stage1Response = {
  model: string;
  response: string;
};

export type Stage2Response = {
  model: string;
  ranking: string;
  parsed_ranking: string[];
};

export type Stage3Response = {
  model: string;
  response: string;
};

export type Message = UserMessage | AssistantMessage;

export type Conversation = {
  id: string;
  user_id: string;
  created_at: string;
  title: string;
  messages: Message[];
};

export type ConversationMetadata = {
  id: string;
  created_at: string;
  title: string;
  message_count: number;
};

// Effect Schema for validation
const UserMessageSchema = Schema.Struct({
  role: Schema.Literal("user"),
  content: Schema.String,
});

const Stage1ResponseSchema = Schema.Struct({
  model: Schema.String,
  response: Schema.String,
});

const Stage2ResponseSchema = Schema.Struct({
  model: Schema.String,
  ranking: Schema.String,
  parsed_ranking: Schema.Array(Schema.String),
});

const Stage3ResponseSchema = Schema.Struct({
  model: Schema.String,
  response: Schema.String,
});

const AssistantMessageSchema = Schema.Struct({
  role: Schema.Literal("assistant"),
  stage1: Schema.Array(Stage1ResponseSchema),
  stage2: Schema.Array(Stage2ResponseSchema),
  stage3: Stage3ResponseSchema,
});

const MessageSchema = Schema.Union(UserMessageSchema, AssistantMessageSchema);

const ConversationSchema = Schema.Struct({
  id: Schema.String,
  user_id: Schema.String,
  created_at: Schema.String,
  title: Schema.String,
  messages: Schema.Array(MessageSchema),
});

/**
 * Storage service for conversation data
 * Handles file-based storage with Effect patterns and proper error handling
 */
export class StorageService extends Effect.Service<StorageService>()(
  "StorageService",
  {
    effect: Effect.gen(function* () {
      const config = yield* AppConfig;

      /**
       * Ensure the data directory exists
       */
      const ensureDataDir = Effect.gen(function* () {
        yield* Effect.tryPromise({
          try: () => fs.mkdir(config.dataDir, { recursive: true }),
          catch: (error) => {
            if (
              error instanceof Error &&
              "code" in error &&
              error.code === "EEXIST"
            ) {
              return; // Directory already exists, this is fine
            }
            return new StorageError({
              operation: "ensureDataDir",
              path: config.dataDir,
              message: `Failed to create data directory: ${error instanceof Error ? error.message : String(error)}`,
              cause: error,
            });
          },
        });
      });

      /**
       * Get the file path for a conversation
       */
      const getConversationPath = (conversationId: string): string =>
        join(config.dataDir, `${conversationId}.json`);

      /**
       * Create a new conversation
       */
      const createConversation = (conversationId: string, userId: string) =>
        withSpan(
          "storage.create",
          {
            "storage.operation": "create",
            "storage.conversation_id": conversationId,
          },
          Effect.gen(function* () {
            const startTime = Date.now();
            yield* ensureDataDir;

            const conversation: Conversation = {
              id: conversationId,
              user_id: userId,
              created_at: new Date().toISOString(),
              title: "New Conversation",
              messages: [],
            };

            const path = getConversationPath(conversationId);

            const result = yield* Effect.either(
              Effect.tryPromise({
                try: () =>
                  fs.writeFile(path, JSON.stringify(conversation, null, 2)),
                catch: (error) =>
                  new StorageError({
                    operation: "createConversation",
                    path,
                    message: `Failed to create conversation: ${error instanceof Error ? error.message : String(error)}`,
                    cause: error,
                  }),
              })
            );

            const duration = Date.now() - startTime;

            if (Either.isLeft(result)) {
              yield* trackStorageOperation("create", duration, true);
              yield* logError("Storage operation failed", result.left, {
                operation: "create",
                conversationId,
              });
              return yield* Effect.fail(result.left);
            }

            yield* trackStorageOperation("create", duration, false);
            return conversation;
          })
        );

      /**
       * Load a conversation from storage
       */
      const getConversation = (conversationId: string) =>
        withSpan(
          "storage.get",
          {
            "storage.operation": "get",
            "storage.conversation_id": conversationId,
          },
          Effect.gen(function* () {
            const startTime = Date.now();
            const path = getConversationPath(conversationId);

            // Use tryPromise and handle ENOENT specially
            const fileContentEither = yield* Effect.either(
              Effect.tryPromise({
                try: () => fs.readFile(path, "utf-8"),
                catch: (error) =>
                  new StorageError({
                    operation: "getConversation",
                    path,
                    message: `Failed to read conversation: ${error instanceof Error ? error.message : String(error)}`,
                    cause: error,
                  }),
              })
            );

            // Handle file not found case
            if (Either.isLeft(fileContentEither)) {
              const error = fileContentEither.left;
              const duration = Date.now() - startTime;
              if (
                error instanceof StorageError &&
                error.cause instanceof Error &&
                "code" in error.cause &&
                (error.cause as NodeJS.ErrnoException).code === "ENOENT"
              ) {
                // Not found is not an error, just return null
                yield* trackStorageOperation("get", duration, false);
                return null;
              }
              yield* trackStorageOperation("get", duration, true);
              yield* logError("Storage operation failed", error, {
                operation: "get",
                conversationId,
              });
              return yield* Effect.fail(error);
            }

            const fileContent = fileContentEither.right;

            const parsed = yield* Effect.try({
              try: () => JSON.parse(fileContent),
              catch: (error) =>
                new StorageError({
                  operation: "getConversation",
                  path,
                  message: `Failed to parse conversation JSON: ${error instanceof Error ? error.message : String(error)}`,
                  cause: error,
                }),
            });

            // Validate with Effect Schema
            const validated = yield* Schema.decodeUnknown(ConversationSchema)(parsed).pipe(
              Effect.mapError((error) =>
                new StorageError({
                  operation: "getConversation",
                  path,
                  message: `Invalid conversation data: ${String(error)}`,
                  cause: error,
                })
              )
            );

            const duration = Date.now() - startTime;
            yield* trackStorageOperation("get", duration, false);
            return validated;
          })
        );

      /**
       * Save a conversation to storage
       */
      const saveConversation = (conversation: Conversation) =>
        withSpan(
          "storage.save",
          {
            "storage.operation": "save",
            "storage.conversation_id": conversation.id,
          },
          Effect.gen(function* () {
            const startTime = Date.now();
            yield* ensureDataDir;

            const path = getConversationPath(conversation.id);

            const result = yield* Effect.either(
              Effect.tryPromise({
                try: () =>
                  fs.writeFile(path, JSON.stringify(conversation, null, 2)),
                catch: (error) =>
                  new StorageError({
                    operation: "saveConversation",
                    path,
                    message: `Failed to save conversation: ${error instanceof Error ? error.message : String(error)}`,
                    cause: error,
                  }),
              })
            );

            const duration = Date.now() - startTime;

            if (Either.isLeft(result)) {
              yield* trackStorageOperation("save", duration, true);
              yield* logError("Storage operation failed", result.left, {
                operation: "save",
                conversationId: conversation.id,
              });
              return yield* Effect.fail(result.left);
            }

            yield* trackStorageOperation("save", duration, false);
          })
        );

      /**
       * List all conversations for a user (metadata only)
       */
      const listConversations = (userId: string) =>
        withSpan(
          "storage.list",
          {
            "storage.operation": "list",
            "storage.user_id": userId,
          },
          Effect.gen(function* () {
            const startTime = Date.now();
            yield* ensureDataDir;

        const files = yield* Effect.tryPromise({
          try: () => fs.readdir(config.dataDir),
          catch: (error) => {
            if (
              error instanceof Error &&
              "code" in error &&
              error.code === "ENOENT"
            ) {
              return []; // Directory doesn't exist yet
            }
            return new StorageError({
              operation: "listConversations",
              path: config.dataDir,
              message: `Failed to read data directory: ${error instanceof Error ? error.message : String(error)}`,
              cause: error,
            });
          },
        });

        const conversations: ConversationMetadata[] = [];

        for (const filename of files) {
          if (filename.endsWith(".json")) {
            // const path = join(config.dataDir, filename);
            const conversation = yield* Effect.either(
              getConversation(filename.replace(".json", ""))
            );

            if (Either.isRight(conversation)) {
              const conv = conversation.right;
              // Filter by user_id
              if (conv && conv.user_id === userId) {
                conversations.push({
                  id: conv.id,
                  created_at: conv.created_at,
                  title: conv.title,
                  message_count: conv.messages.length,
                });
              }
            }
            // Ignore corrupted files - they'll be skipped
          }
        }

        // Sort by creation time, newest first
        conversations.sort(
          (a, b) =>
            new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        );

        const duration = Date.now() - startTime;
        yield* trackStorageOperation("list", duration, false);
        return conversations;
      })
        );

      /**
       * Add a user message to a conversation
       */
      const addUserMessage = (conversationId: string, content: string) =>
        Effect.gen(function* () {
          const conversation = yield* getConversation(conversationId);

          if (!conversation) {
            return yield* Effect.fail(
              new StorageError({
                operation: "addUserMessage",
                path: getConversationPath(conversationId),
                message: `Conversation ${conversationId} not found`,
              })
            );
          }

          conversation.messages.push({
            role: "user",
            content,
          });

          yield* saveConversation(conversation);
        });

      /**
       * Add an assistant message with all 3 stages to a conversation
       */
      const addAssistantMessage = (
        conversationId: string,
        stage1: Stage1Response[],
        stage2: Stage2Response[],
        stage3: Stage3Response
      ) =>
        Effect.gen(function* () {
          const conversation = yield* getConversation(conversationId);

          if (!conversation) {
            return yield* Effect.fail(
              new StorageError({
                operation: "addAssistantMessage",
                path: getConversationPath(conversationId),
                message: `Conversation ${conversationId} not found`,
              })
            );
          }

          conversation.messages.push({
            role: "assistant",
            stage1,
            stage2,
            stage3,
          });

          yield* saveConversation(conversation);
        });

      /**
       * Update the title of a conversation
       */
      const updateConversationTitle = (conversationId: string, title: string) =>
        Effect.gen(function* () {
          const conversation = yield* getConversation(conversationId);

          if (!conversation) {
            return yield* Effect.fail(
              new StorageError({
                operation: "updateConversationTitle",
                path: getConversationPath(conversationId),
                message: `Conversation ${conversationId} not found`,
              })
            );
          }

          conversation.title = title;
          yield* saveConversation(conversation);
        });

      return {
        createConversation,
        getConversation,
        saveConversation,
        listConversations,
        addUserMessage,
        addAssistantMessage,
        updateConversationTitle,
      };
    }),
  }
) {}

import { BaseServicesLayer } from "./runtime";
