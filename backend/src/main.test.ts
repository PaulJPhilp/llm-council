import { promises as fs } from "node:fs";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import app from "./main";
// biome-ignore lint/performance/noNamespaceImport: Required for vi.spyOn() to work
import * as storageModule from "./storage";
import { getConversation } from "./storage";

// Test data directory
const TEST_DATA_DIR = "data/test-conversations-api";
process.env.DATA_DIR = TEST_DATA_DIR;

describe("API Endpoints", () => {
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

  describe("GET /", () => {
    it("should return health check", async () => {
      const req = new Request("http://localhost:8001/", {
        method: "GET",
      });

      const res = await app.fetch(req);
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json).toMatchObject({
        status: "ok",
        service: "LLM Council API",
      });
    });
  });

  describe("Conversation Endpoints", () => {
    it("POST /api/conversations - should create a conversation", async () => {
      const req = new Request("http://localhost:8001/api/conversations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });

      const res = await app.fetch(req);
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json).toHaveProperty("id");
      expect(json).toHaveProperty("created_at");
      expect(json.title).toBe("New Conversation");
      expect(json.messages).toEqual([]);
    });

    it("GET /api/conversations - should list all conversations", async () => {
      // Create a conversation
      const createReq = new Request("http://localhost:8001/api/conversations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const createRes = await app.fetch(createReq);
      const conversation = await createRes.json();

      // List conversations
      const listReq = new Request("http://localhost:8001/api/conversations", {
        method: "GET",
      });
      const listRes = await app.fetch(listReq);
      expect(listRes.status).toBe(200);

      const list = await listRes.json();
      expect(Array.isArray(list)).toBe(true);
      expect(list.length).toBe(1);
      expect(list[0]).toMatchObject({
        id: conversation.id,
        title: "New Conversation",
        message_count: 0,
      });
    });

    it("GET /api/conversations/{id} - should get a specific conversation", async () => {
      // Create a conversation
      const createReq = new Request("http://localhost:8001/api/conversations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const createRes = await app.fetch(createReq);
      const conversation = await createRes.json();

      // Get the conversation
      const getReq = new Request(
        `http://localhost:8001/api/conversations/${conversation.id}`,
        {
          method: "GET",
        }
      );
      const getRes = await app.fetch(getReq);
      expect(getRes.status).toBe(200);

      const retrieved = await getRes.json();
      expect(retrieved.id).toBe(conversation.id);
      expect(retrieved.title).toBe("New Conversation");
    });

    it("GET /api/conversations/{id} - should return 404 for non-existent conversation", async () => {
      const req = new Request(
        "http://localhost:8001/api/conversations/non-existent-id",
        {
          method: "GET",
        }
      );

      const res = await app.fetch(req);
      expect(res.status).toBe(404);

      const json = await res.json();
      expect(json.error).toBe("Conversation not found");
    });
  });

  describe("Message Endpoints", () => {
    it("POST /api/conversations/{id}/message - should reject request with missing content", async () => {
      // Create a conversation
      const createReq = new Request("http://localhost:8001/api/conversations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const createRes = await app.fetch(createReq);
      const conversation = await createRes.json();

      // Try to send a message without content
      const req = new Request(
        `http://localhost:8001/api/conversations/${conversation.id}/message`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        }
      );

      const res = await app.fetch(req);
      expect(res.status).toBe(400);
    });

    it("POST /api/conversations/{id}/message - should reject request to non-existent conversation", async () => {
      const req = new Request(
        "http://localhost:8001/api/conversations/non-existent/message",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content: "Hello" }),
        }
      );

      const res = await app.fetch(req);
      expect(res.status).toBe(404);

      const json = await res.json();
      expect(json.error).toBe("Conversation not found");
    });

    it("POST /api/conversations/{id}/message/stream - should reject request with missing content", async () => {
      // Create a conversation
      const createReq = new Request("http://localhost:8001/api/conversations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const createRes = await app.fetch(createReq);
      const conversation = await createRes.json();

      // Try to send a message without content
      const req = new Request(
        `http://localhost:8001/api/conversations/${conversation.id}/message/stream`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        }
      );

      const res = await app.fetch(req);
      expect(res.status).toBe(400);
    });

    it("POST /api/conversations/{id}/message/stream - should reject request to non-existent conversation", async () => {
      const req = new Request(
        "http://localhost:8001/api/conversations/non-existent/message/stream",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content: "Hello" }),
        }
      );

      const res = await app.fetch(req);
      expect(res.status).toBe(404);

      const json = await res.json();
      expect(json.error).toBe("Conversation not found");
    });
  });

  describe("CORS Headers", () => {
    it("should include CORS headers in response", async () => {
      const req = new Request("http://localhost:8001/", {
        method: "GET",
      });

      const res = await app.fetch(req);
      expect(res.headers.has("access-control-allow-origin")).toBe(true);
    });

    it("should handle preflight requests", async () => {
      const req = new Request("http://localhost:8001/api/conversations", {
        method: "OPTIONS",
        headers: {
          "Access-Control-Request-Method": "POST",
          Origin: "http://localhost:5173",
        },
      });

      const res = await app.fetch(req);
      expect(res.status).toBeLessThan(500);
    });
  });

  describe("Conversation Flow", () => {
    it("should handle complete conversation lifecycle", async () => {
      // 1. Create conversation
      const createReq = new Request("http://localhost:8001/api/conversations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const createRes = await app.fetch(createReq);
      const conversation = await createRes.json();
      expect(conversation.id).toBeDefined();

      // 2. Get conversation
      const getReq = new Request(
        `http://localhost:8001/api/conversations/${conversation.id}`,
        {
          method: "GET",
        }
      );
      const getRes = await app.fetch(getReq);
      const retrieved = await getRes.json();
      expect(retrieved.id).toBe(conversation.id);
      expect(retrieved.messages).toHaveLength(0);

      // 3. List conversations
      const listReq = new Request("http://localhost:8001/api/conversations", {
        method: "GET",
      });
      const listRes = await app.fetch(listReq);
      const list = await listRes.json();
      expect(list.length).toBeGreaterThan(0);

      const found = list.find((c: any) => c.id === conversation.id);
      expect(found).toBeDefined();
      expect(found.message_count).toBe(0);
    });
  });

  describe("Error Handling", () => {
    it("should return 500 on internal server error", async () => {
      // This test mocks a storage error
      const _originalGetConversation = getConversation;
      vi.spyOn(storageModule, "getConversation").mockRejectedValueOnce(
        new Error("Storage error")
      );

      const req = new Request("http://localhost:8001/api/conversations/test", {
        method: "GET",
      });

      const res = await app.fetch(req);
      expect(res.status).toBe(500);

      // Restore original function
      vi.restoreAllMocks();
    });
  });
});
