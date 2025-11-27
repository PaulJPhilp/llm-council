import { promises as fs } from "node:fs";
import { join } from "node:path";
import { Effect, Layer } from "effect";
import { z } from "zod";
import { AppConfig } from "./config";
import { StorageError } from "./errors";

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

// Zod schema for validation
const UserMessageSchema = z.object({
  role: z.literal("user"),
  content: z.string(),
});

const Stage1ResponseSchema = z.object({
  model: z.string(),
  response: z.string(),
});

const Stage2ResponseSchema = z.object({
  model: z.string(),
  ranking: z.string(),
  parsed_ranking: z.array(z.string()),
});

const Stage3ResponseSchema = z.object({
  model: z.string(),
  response: z.string(),
});

const AssistantMessageSchema = z.object({
  role: z.literal("assistant"),
  stage1: z.array(Stage1ResponseSchema),
  stage2: z.array(Stage2ResponseSchema),
  stage3: Stage3ResponseSchema,
});

const MessageSchema = z.union([UserMessageSchema, AssistantMessageSchema]);

const ConversationSchema = z.object({
  id: z.string(),
  created_at: z.string(),
  title: z.string(),
  messages: z.array(MessageSchema),
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
      const createConversation = (conversationId: string) =>
        Effect.gen(function* () {
          yield* ensureDataDir;

          const conversation: Conversation = {
            id: conversationId,
            created_at: new Date().toISOString(),
            title: "New Conversation",
            messages: [],
          };

          const path = getConversationPath(conversationId);

          yield* Effect.tryPromise({
            try: () =>
              fs.writeFile(path, JSON.stringify(conversation, null, 2)),
            catch: (error) =>
              new StorageError({
                operation: "createConversation",
                path,
                message: `Failed to create conversation: ${error instanceof Error ? error.message : String(error)}`,
                cause: error,
              }),
          });

          return conversation;
        });

      /**
       * Load a conversation from storage
       */
      const getConversation = (conversationId: string) =>
        Effect.gen(function* () {
          const path = getConversationPath(conversationId);

          const data = yield* Effect.tryPromise({
            try: () => fs.readFile(path, "utf-8"),
            catch: (error) => {
              if (
                error instanceof Error &&
                "code" in error &&
                error.code === "ENOENT"
              ) {
                return null; // Conversation not found
              }
              return new StorageError({
                operation: "getConversation",
                path,
                message: `Failed to read conversation: ${error instanceof Error ? error.message : String(error)}`,
                cause: error,
              });
            },
          });

          if (data === null) {
            return null;
          }

          const parsed = yield* Effect.try({
            try: () => JSON.parse(data),
            catch: (error) =>
              new StorageError({
                operation: "getConversation",
                path,
                message: `Failed to parse conversation JSON: ${error instanceof Error ? error.message : String(error)}`,
                cause: error,
              }),
          });

          const validated = yield* Effect.try({
            try: () => ConversationSchema.parse(parsed),
            catch: (error) =>
              new StorageError({
                operation: "getConversation",
                path,
                message: `Invalid conversation data: ${error instanceof Error ? error.message : String(error)}`,
                cause: error,
              }),
          });

          return validated;
        });

      /**
       * Save a conversation to storage
       */
      const saveConversation = (conversation: Conversation) =>
        Effect.gen(function* () {
          yield* ensureDataDir;

          const path = getConversationPath(conversation.id);

          yield* Effect.tryPromise({
            try: () =>
              fs.writeFile(path, JSON.stringify(conversation, null, 2)),
            catch: (error) =>
              new StorageError({
                operation: "saveConversation",
                path,
                message: `Failed to save conversation: ${error instanceof Error ? error.message : String(error)}`,
                cause: error,
              }),
          });
        });

      /**
       * List all conversations (metadata only)
       */
      const listConversations = Effect.gen(function* () {
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
            const _path = join(config.dataDir, filename);
            const conversation = yield* Effect.either(
              getConversation(filename.replace(".json", ""))
            );

            if (Effect.isRight(conversation)) {
              const conv = conversation.right;
              if (conv) {
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

        return conversations;
      });

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

// Create a default layer that provides both AppConfig and StorageService
export const StorageServiceLive = AppConfig.Default.pipe(
  Layer.provide(StorageService.Default)
);

// Standalone function exports for backward compatibility
export const createConversation = (conversationId: string) =>
  Effect.runSync(
    Effect.gen(function* () {
      const storage = yield* StorageService;
      return yield* storage.createConversation(conversationId);
    }).pipe(Effect.provide(StorageServiceLive))
  );

export const getConversation = (conversationId: string) =>
  Effect.runSync(
    Effect.gen(function* () {
      const storage = yield* StorageService;
      return yield* storage.getConversation(conversationId);
    }).pipe(Effect.provide(StorageServiceLive))
  );

export const listConversations = () =>
  Effect.runSync(
    Effect.gen(function* () {
      const storage = yield* StorageService;
      return yield* storage.listConversations();
    }).pipe(Effect.provide(StorageServiceLive))
  );

export const addUserMessage = (conversationId: string, content: string) =>
  Effect.runSync(
    Effect.gen(function* () {
      const storage = yield* StorageService;
      return yield* storage.addUserMessage(conversationId, content);
    }).pipe(Effect.provide(StorageServiceLive))
  );

export const addAssistantMessage = (
  conversationId: string,
  stage1: Stage1Response[],
  stage2: Stage2Response[],
  stage3: Stage3Response
) =>
  Effect.runSync(
    Effect.gen(function* () {
      const storage = yield* StorageService;
      return yield* storage.addAssistantMessage(
        conversationId,
        stage1,
        stage2,
        stage3
      );
    }).pipe(Effect.provide(StorageServiceLive))
  );

export const updateConversationTitle = (
  conversationId: string,
  title: string
) =>
  Effect.runSync(
    Effect.gen(function* () {
      const storage = yield* StorageService;
      return yield* storage.updateConversationTitle(conversationId, title);
    }).pipe(Effect.provide(StorageServiceLive))
  );
