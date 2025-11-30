/**
 * Comprehensive Storage Service Tests
 * Tests for file-based conversation storage with Effect services
 */

import { Cause, Effect } from "effect";
import { promises as fs } from "node:fs";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { StorageService } from "./storage";
import { TestLayer } from "./runtime.test";
import { StorageError } from "./errors";

// Test data directory
const TEST_DATA_DIR = "data/test-storage";
process.env.DATA_DIR = TEST_DATA_DIR;

// Test user ID
const TEST_USER_ID = "test-user-123";

/**
 * Helper to extract detailed error information from Effect errors
 * Useful for debugging FiberFailure and other Effect errors
 */
const extractErrorDetails = (error: unknown): string => {
  if (error && typeof error === "object" && "_id" in error) {
    if (error._id === "FiberFailure" && "cause" in error) {
      try {
        const cause = (error as any).cause;
        return `FiberFailure: ${JSON.stringify(cause, null, 2)}`;
      } catch {
        return `FiberFailure: ${String(error)}`;
      }
    }
    if ("_tag" in error) {
      return `Effect Error (${error._tag}): ${JSON.stringify(error, null, 2)}`;
    }
  }
  if (error instanceof Error) {
    return `${error.name}: ${error.message}\n${error.stack}`;
  }
  return String(error);
};

/**
 * Helper to run an Effect and log detailed error information on failure
 */
const runWithErrorLogging = async <A, E>(
  effect: Effect.Effect<A, E>,
  testName?: string
): Promise<A> => {
  try {
    return await Effect.runPromise(effect);
  } catch (error) {
    const errorDetails = extractErrorDetails(error);
    console.error(`\n[ERROR in ${testName || "test"}]:`);
    console.error(errorDetails);
    console.error("\nFull error object:", error);
    throw error;
  }
};

describe("StorageService", () => {
  beforeAll(async () => {
    // Clean up test directory
    try {
      await fs.rm(TEST_DATA_DIR, { recursive: true, force: true });
    } catch {
      // Directory might not exist
    }
  });

  afterEach(async () => {
    // Clean up after each test
    try {
      await fs.rm(TEST_DATA_DIR, { recursive: true, force: true });
    } catch {
      // Directory might not exist
    }
  });

  describe("createConversation", () => {
    it("should create a new conversation", async () => {
      const result = await runWithErrorLogging(
        Effect.gen(function* () {
          const storage = yield* StorageService;
          return yield* storage.createConversation("test-123", TEST_USER_ID);
        }).pipe(Effect.provide(TestLayer)),
        "should create a new conversation"
      );

      expect(result.id).toBe("test-123");
      expect(result.user_id).toBe(TEST_USER_ID);
      expect(result.title).toBe("New Conversation");
      expect(result.messages).toEqual([]);
      expect(result.created_at).toBeDefined();
    });

    it("should save conversation to file", async () => {
      await runWithErrorLogging(
        Effect.gen(function* () {
          const storage = yield* StorageService;
          yield* storage.createConversation("test-456", TEST_USER_ID);
        }).pipe(Effect.provide(TestLayer)),
        "should save conversation to file"
      );

      const retrieved = await runWithErrorLogging(
        Effect.gen(function* () {
          const storage = yield* StorageService;
          return yield* storage.getConversation("test-456");
        }).pipe(Effect.provide(TestLayer)),
        "should save conversation to file - retrieve"
      );

      expect(retrieved).not.toBeNull();
      expect(retrieved?.id).toBe("test-456");
      expect(retrieved?.user_id).toBe(TEST_USER_ID);
    });

    it("should create conversation with unique IDs", async () => {
      const result1 = await runWithErrorLogging(
        Effect.gen(function* () {
          const storage = yield* StorageService;
          return yield* storage.createConversation("conv-1", TEST_USER_ID);
        }).pipe(Effect.provide(TestLayer)),
        "should create conversation with unique IDs - conv-1"
      );

      const result2 = await runWithErrorLogging(
        Effect.gen(function* () {
          const storage = yield* StorageService;
          return yield* storage.createConversation("conv-2", TEST_USER_ID);
        }).pipe(Effect.provide(TestLayer)),
        "should create conversation with unique IDs - conv-2"
      );

      expect(result1.id).toBe("conv-1");
      expect(result2.id).toBe("conv-2");
      expect(result1.id).not.toBe(result2.id);
    });
  });

  describe("getConversation", () => {
    it("should retrieve an existing conversation", async () => {
      await runWithErrorLogging(
        Effect.gen(function* () {
          const storage = yield* StorageService;
          yield* storage.createConversation("test-get", TEST_USER_ID);
        }).pipe(Effect.provide(TestLayer))
      );

      const conversation = await Effect.runPromise(
        Effect.gen(function* () {
          const storage = yield* StorageService;
          return yield* storage.getConversation("test-get");
        }).pipe(Effect.provide(TestLayer))
      );

      expect(conversation).not.toBeNull();
      expect(conversation?.id).toBe("test-get");
      expect(conversation?.user_id).toBe(TEST_USER_ID);
    });

    it("should return null for non-existent conversation", async () => {
      const conversation = await Effect.runPromise(
        Effect.gen(function* () {
          const storage = yield* StorageService;
          return yield* storage.getConversation("non-existent");
        }).pipe(Effect.provide(TestLayer))
      );

      expect(conversation).toBeNull();
    });

    it("should handle invalid JSON gracefully", async () => {
      // Create a conversation file with invalid JSON
      await fs.mkdir(TEST_DATA_DIR, { recursive: true });
      await fs.writeFile(
        `${TEST_DATA_DIR}/invalid.json`,
        "invalid json content"
      );

      const result = await Effect.runPromise(
        Effect.gen(function* () {
          const storage = yield* StorageService;
          return yield* storage.getConversation("invalid");
        }).pipe(Effect.either, Effect.provide(TestLayer))
      );

      expect(result._tag).toBe("Left");
      if (result._tag === "Left") {
        expect(result.left).toBeInstanceOf(StorageError);
      }
    });
  });

  describe("listConversations", () => {
    it("should list all conversations for a user", async () => {
      await runWithErrorLogging(
        Effect.gen(function* () {
          const storage = yield* StorageService;
          yield* storage.createConversation("conv-1", TEST_USER_ID);
          yield* storage.createConversation("conv-2", TEST_USER_ID);
        }).pipe(Effect.provide(TestLayer))
      );

      const list = await Effect.runPromise(
        Effect.gen(function* () {
          const storage = yield* StorageService;
          return yield* storage.listConversations(TEST_USER_ID);
        }).pipe(Effect.provide(TestLayer))
      );

      expect(list.length).toBe(2);
      expect(list.map((c) => c.id).sort()).toEqual(["conv-1", "conv-2"]);
    });

    it("should filter conversations by user ID", async () => {
      const OTHER_USER_ID = "other-user-456";

      await runWithErrorLogging(
        Effect.gen(function* () {
          const storage = yield* StorageService;
          yield* storage.createConversation("conv-1", TEST_USER_ID);
          yield* storage.createConversation("conv-2", OTHER_USER_ID);
          yield* storage.createConversation("conv-3", TEST_USER_ID);
        }).pipe(Effect.provide(TestLayer))
      );

      const list = await Effect.runPromise(
        Effect.gen(function* () {
          const storage = yield* StorageService;
          return yield* storage.listConversations(TEST_USER_ID);
        }).pipe(Effect.provide(TestLayer))
      );

      expect(list.length).toBe(2);
      expect(list.map((c) => c.id).sort()).toEqual(["conv-1", "conv-3"]);
    });

    it("should return empty list if no conversations", async () => {
      const list = await Effect.runPromise(
        Effect.gen(function* () {
          const storage = yield* StorageService;
          return yield* storage.listConversations(TEST_USER_ID);
        }).pipe(Effect.provide(TestLayer))
      );

      expect(list).toEqual([]);
    });

    it("should include message count in metadata", async () => {
      await runWithErrorLogging(
        Effect.gen(function* () {
          const storage = yield* StorageService;
          yield* storage.createConversation("count-test", TEST_USER_ID);
          yield* storage.addUserMessage("count-test", "Hello");
          yield* storage.addUserMessage("count-test", "World");
        }).pipe(Effect.provide(TestLayer))
      );

      const list = await Effect.runPromise(
        Effect.gen(function* () {
          const storage = yield* StorageService;
          return yield* storage.listConversations(TEST_USER_ID);
        }).pipe(Effect.provide(TestLayer))
      );

      expect(list[0].message_count).toBe(2);
    });
  });

  describe("addUserMessage", () => {
    it("should add user message to conversation", async () => {
      await runWithErrorLogging(
        Effect.gen(function* () {
          const storage = yield* StorageService;
          yield* storage.createConversation("test-message", TEST_USER_ID);
          yield* storage.addUserMessage("test-message", "Hello, world!");
        }).pipe(Effect.provide(TestLayer))
      );

      const conversation = await Effect.runPromise(
        Effect.gen(function* () {
          const storage = yield* StorageService;
          return yield* storage.getConversation("test-message");
        }).pipe(Effect.provide(TestLayer))
      );

      expect(conversation?.messages).toHaveLength(1);
      expect(conversation?.messages[0].role).toBe("user");
      expect(conversation?.messages[0]).toMatchObject({
        role: "user",
        content: "Hello, world!",
      });
    });

    it("should fail if conversation does not exist", async () => {
      const result = await Effect.runPromise(
        Effect.gen(function* () {
          const storage = yield* StorageService;
          return yield* storage.addUserMessage("non-existent", "Hello");
        }).pipe(Effect.either, Effect.provide(TestLayer))
      );

      expect(result._tag).toBe("Left");
      if (result._tag === "Left") {
        expect(result.left).toBeInstanceOf(StorageError);
      }
    });

    it("should append multiple messages in order", async () => {
      await runWithErrorLogging(
        Effect.gen(function* () {
          const storage = yield* StorageService;
          yield* storage.createConversation("multi-message", TEST_USER_ID);
          yield* storage.addUserMessage("multi-message", "First");
          yield* storage.addUserMessage("multi-message", "Second");
          yield* storage.addUserMessage("multi-message", "Third");
        }).pipe(Effect.provide(TestLayer))
      );

      const conversation = await Effect.runPromise(
        Effect.gen(function* () {
          const storage = yield* StorageService;
          return yield* storage.getConversation("multi-message");
        }).pipe(Effect.provide(TestLayer))
      );

      expect(conversation?.messages).toHaveLength(3);
      expect(conversation?.messages[0].content).toBe("First");
      expect(conversation?.messages[1].content).toBe("Second");
      expect(conversation?.messages[2].content).toBe("Third");
    });
  });

  describe("addAssistantMessage", () => {
    it("should add assistant message with all stages", async () => {
      await runWithErrorLogging(
        Effect.gen(function* () {
          const storage = yield* StorageService;
          yield* storage.createConversation("test-assistant", TEST_USER_ID);

          const stage1 = [{ model: "model1", response: "Response 1" }];
          const stage2 = [
            {
              model: "model1",
              ranking: "Ranking text",
              parsed_ranking: ["Response A"],
            },
          ];
          const stage3 = { model: "chairman", response: "Final answer" };

          yield* storage.addAssistantMessage("test-assistant", stage1, stage2, stage3);
        }).pipe(Effect.provide(TestLayer))
      );

      const conversation = await Effect.runPromise(
        Effect.gen(function* () {
          const storage = yield* StorageService;
          return yield* storage.getConversation("test-assistant");
        }).pipe(Effect.provide(TestLayer))
      );

      expect(conversation?.messages).toHaveLength(1);
      expect(conversation?.messages[0].role).toBe("assistant");
      expect(conversation?.messages[0]).toHaveProperty("stage1");
      expect(conversation?.messages[0]).toHaveProperty("stage2");
      expect(conversation?.messages[0]).toHaveProperty("stage3");
    });

    it("should fail if conversation does not exist", async () => {
      const result = await Effect.runPromise(
        Effect.gen(function* () {
          const storage = yield* StorageService;
          return yield* storage.addAssistantMessage(
            "non-existent",
            [],
            [],
            { model: "chairman", response: "Answer" }
          );
        }).pipe(Effect.either, Effect.provide(TestLayer))
      );

      expect(result._tag).toBe("Left");
      if (result._tag === "Left") {
        expect(result.left).toBeInstanceOf(StorageError);
      }
    });
  });

  describe("updateConversationTitle", () => {
    it("should update conversation title", async () => {
      await runWithErrorLogging(
        Effect.gen(function* () {
          const storage = yield* StorageService;
          yield* storage.createConversation("test-title", TEST_USER_ID);
          yield* storage.updateConversationTitle("test-title", "New Title");
        }).pipe(Effect.provide(TestLayer))
      );

      const conversation = await Effect.runPromise(
        Effect.gen(function* () {
          const storage = yield* StorageService;
          return yield* storage.getConversation("test-title");
        }).pipe(Effect.provide(TestLayer))
      );

      expect(conversation?.title).toBe("New Title");
    });

    it("should fail if conversation does not exist", async () => {
      const result = await Effect.runPromise(
        Effect.gen(function* () {
          const storage = yield* StorageService;
          return yield* storage.updateConversationTitle("non-existent", "Title");
        }).pipe(Effect.either, Effect.provide(TestLayer))
      );

      expect(result._tag).toBe("Left");
      if (result._tag === "Left") {
        expect(result.left).toBeInstanceOf(StorageError);
      }
    });
  });

  describe("Integration: Complete Conversation Flow", () => {
    it("should handle a complete conversation lifecycle", async () => {
      // Create conversation
      const conv = await Effect.runPromise(
        Effect.gen(function* () {
          const storage = yield* StorageService;
          return yield* storage.createConversation("flow-test", TEST_USER_ID);
        }).pipe(Effect.provide(TestLayer))
      );

      expect(conv.id).toBe("flow-test");
      expect(conv.user_id).toBe(TEST_USER_ID);

      // Add user message
      await runWithErrorLogging(
        Effect.gen(function* () {
          const storage = yield* StorageService;
          yield* storage.addUserMessage("flow-test", "First question");
        }).pipe(Effect.provide(TestLayer))
      );

      // Add assistant message
      await runWithErrorLogging(
        Effect.gen(function* () {
          const storage = yield* StorageService;
          yield* storage.addAssistantMessage(
            "flow-test",
            [{ model: "gpt-4", response: "First answer" }],
            [
              {
                model: "gpt-4",
                ranking: "FINAL RANKING:\n1. Response A",
                parsed_ranking: ["Response A"],
              },
            ],
            { model: "chairman", response: "Synthesis" }
          );
        }).pipe(Effect.provide(TestLayer))
      );

      // Update title
      await runWithErrorLogging(
        Effect.gen(function* () {
          const storage = yield* StorageService;
          yield* storage.updateConversationTitle("flow-test", "First Question");
        }).pipe(Effect.provide(TestLayer))
      );

      // Retrieve and verify
      const retrieved = await Effect.runPromise(
        Effect.gen(function* () {
          const storage = yield* StorageService;
          return yield* storage.getConversation("flow-test");
        }).pipe(Effect.provide(TestLayer))
      );

      expect(retrieved?.id).toBe("flow-test");
      expect(retrieved?.user_id).toBe(TEST_USER_ID);
      expect(retrieved?.title).toBe("First Question");
      expect(retrieved?.messages).toHaveLength(2);

      // List and verify
      const list = await Effect.runPromise(
        Effect.gen(function* () {
          const storage = yield* StorageService;
          return yield* storage.listConversations(TEST_USER_ID);
        }).pipe(Effect.provide(TestLayer))
      );

      const metadata = list.find((c) => c.id === "flow-test");
      expect(metadata?.message_count).toBe(2);
    });
  });

  describe("Error Handling", () => {
    it("should handle file system errors gracefully", async () => {
      // Use invalid directory path
      const invalidConfig = {
        openRouterApiKey: "test-key",
        openRouterApiUrl: "https://test.openrouter.ai/api/v1/chat/completions",
        councilModels: ["test-model"],
        chairmanModel: "test-chairman",
        dataDir: "/invalid/path/that/does/not/exist",
        port: 0,
        apiTimeoutMs: 5000,
        titleGenerationTimeoutMs: 1000,
        defaultMaxTokens: 100,
        chairmanMaxTokens: 200,
        mockMode: true,
        rateLimitEnabled: false,
        rateLimitWindowMs: 60000,
        rateLimitMaxRequests: 100,
        rateLimitMaxWorkflowExecutions: 10,
        httpRequestTimeoutMs: 30000,
        httpKeepAliveTimeoutMs: 5000,
        httpMaxConnections: 100,
        httpMaxRequestSizeBytes: 1024 * 1024,
      };

      // Create a custom layer with invalid config
      const { createTestLayer } = await import("./runtime.test");
      const invalidLayer = createTestLayer({ config: invalidConfig });

      // This should fail when trying to create conversation
      const result = await Effect.runPromise(
        Effect.gen(function* () {
          const storage = yield* StorageService;
          return yield* storage.createConversation("test", TEST_USER_ID);
        }).pipe(Effect.either, Effect.provide(invalidLayer))
      );

      // Should fail with StorageError
      expect(result._tag).toBe("Left");
      if (result._tag === "Left") {
        expect(result.left).toBeInstanceOf(StorageError);
      }
    });
  });
});

