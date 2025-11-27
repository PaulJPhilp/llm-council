import { promises as fs } from "node:fs";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import {
  addAssistantMessage,
  addUserMessage,
  createConversation,
  getConversation,
  listConversations,
  updateConversationTitle,
} from "./storage";

// Use a test data directory
const TEST_DATA_DIR = "data/test-conversations";
const _originalDataDir = process.env.DATA_DIR;

// Mock DATA_DIR for testing
process.env.DATA_DIR = TEST_DATA_DIR;

describe("Storage Functions", () => {
  beforeAll(async () => {
    // Clean up test directory before tests
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
      const conversation = await createConversation("test-123");

      expect(conversation.id).toBe("test-123");
      expect(conversation.title).toBe("New Conversation");
      expect(conversation.messages).toEqual([]);
      expect(conversation.created_at).toBeDefined();
    });

    it("should save conversation to file", async () => {
      await createConversation("test-456");

      const retrieved = await getConversation("test-456");
      expect(retrieved).not.toBeNull();
      expect(retrieved?.id).toBe("test-456");
    });
  });

  describe("getConversation", () => {
    it("should retrieve an existing conversation", async () => {
      await createConversation("test-get");
      const conversation = await getConversation("test-get");

      expect(conversation).not.toBeNull();
      expect(conversation?.id).toBe("test-get");
    });

    it("should return null for non-existent conversation", async () => {
      const conversation = await getConversation("non-existent");
      expect(conversation).toBeNull();
    });
  });

  describe("updateConversationTitle", () => {
    it("should update conversation title", async () => {
      await createConversation("test-title");
      await updateConversationTitle("test-title", "New Title");

      const conversation = await getConversation("test-title");
      expect(conversation?.title).toBe("New Title");
    });

    it("should throw error if conversation does not exist", async () => {
      await expect(
        updateConversationTitle("non-existent", "Title")
      ).rejects.toThrow();
    });
  });

  describe("addUserMessage", () => {
    it("should add user message to conversation", async () => {
      await createConversation("test-message");
      await addUserMessage("test-message", "Hello, world!");

      const conversation = await getConversation("test-message");
      expect(conversation?.messages).toHaveLength(1);
      expect(conversation?.messages[0].role).toBe("user");
      expect(conversation?.messages[0]).toMatchObject({
        role: "user",
        content: "Hello, world!",
      });
    });

    it("should throw error if conversation does not exist", async () => {
      await expect(addUserMessage("non-existent", "Hello")).rejects.toThrow();
    });
  });

  describe("addAssistantMessage", () => {
    it("should add assistant message with all stages", async () => {
      await createConversation("test-assistant");

      const stage1 = [{ model: "model1", response: "Response 1" }];
      const stage2 = [
        {
          model: "model1",
          ranking: "Ranking text",
          parsed_ranking: ["Response A"],
        },
      ];
      const stage3 = { model: "chairman", response: "Final answer" };

      await addAssistantMessage("test-assistant", stage1, stage2, stage3);

      const conversation = await getConversation("test-assistant");
      expect(conversation?.messages).toHaveLength(1);
      expect(conversation?.messages[0].role).toBe("assistant");
      expect(conversation?.messages[0]).toMatchObject({
        role: "assistant",
        stage1,
        stage2,
        stage3,
      });
    });
  });

  describe("listConversations", () => {
    it("should list all conversations with metadata", async () => {
      await createConversation("conv-1");
      await createConversation("conv-2");

      const list = await listConversations();
      expect(list.length).toBe(2);

      // Check metadata structure
      for (const conv of list) {
        expect(conv).toHaveProperty("id");
        expect(conv).toHaveProperty("created_at");
        expect(conv).toHaveProperty("title");
        expect(conv).toHaveProperty("message_count");
      }
    });

    it("should sort by creation time, newest first", async () => {
      await createConversation("first");
      // Small delay to ensure different timestamps
      await new Promise((resolve) => setTimeout(resolve, 10));
      await createConversation("second");

      const list = await listConversations();
      expect(list[0].id).toBe("second");
      expect(list[1].id).toBe("first");
    });

    it("should return empty list if no conversations", async () => {
      const list = await listConversations();
      expect(list).toEqual([]);
    });

    it("should include message count in metadata", async () => {
      await createConversation("count-test");
      await addUserMessage("count-test", "Hello");
      await addUserMessage("count-test", "World");

      const list = await listConversations();
      expect(list[0].message_count).toBe(2);
    });
  });

  describe("Integration: conversation flow", () => {
    it("should handle a complete conversation flow", async () => {
      // Create
      const conv = await createConversation("flow-test");
      expect(conv.id).toBe("flow-test");

      // Add user message
      await addUserMessage("flow-test", "First question");

      // Add assistant message
      await addAssistantMessage(
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

      // Update title
      await updateConversationTitle("flow-test", "First Question");

      // Retrieve and verify
      const retrieved = await getConversation("flow-test");
      expect(retrieved?.id).toBe("flow-test");
      expect(retrieved?.title).toBe("First Question");
      expect(retrieved?.messages).toHaveLength(2);

      // List and verify
      const list = await listConversations();
      const metadata = list.find((c) => c.id === "flow-test");
      expect(metadata?.message_count).toBe(2);
    });
  });
});
