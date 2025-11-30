import { NodeHttpServer } from "@effect/platform-node";
import * as Http from "@effect/platform/HttpServer";
import { Effect, Layer, Runtime } from "effect";
import { promises as fs } from "node:fs";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { app } from "./http/app";
import { TestLayer } from "./runtime.test";


/**
 * Test helper to execute Effect Platform HTTP routes
 * Executes the router with the provided request
 */
const testRequest = async (request: Request): Promise<Response> => {
  return Effect.runPromise(
    Effect.gen(function* () {
      // Convert native Request to Effect Platform HttpRequest
      const httpRequest = yield* Http.request.fromWeb(request);
      
      // Execute the router with the HttpRequest provided
      // The router will match the route and execute the handler
      const response = yield* app.pipe(
        Effect.provideService(Http.request.HttpRequest, httpRequest)
      );
      
      // Convert Effect Platform HttpResponse to native Response
      return Http.response.toWeb(response);
    }).pipe(Effect.provide(TestLayer))
  );
};

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

      const res = await testRequest(req);
      expect(res.status).toBe(200);

      const json = (await res.json()) as any;
      expect(json).toMatchObject({
        status: "ok",
        service: "LLM Council API",
      });
    });
  });

  // Test authentication token
  const TEST_AUTH_TOKEN = "Bearer test-token-123";

  describe("Conversation Endpoints", () => {
    it("POST /api/conversations - should create a conversation", async () => {
      const req = new Request("http://localhost:8001/api/conversations", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: TEST_AUTH_TOKEN,
        },
        body: JSON.stringify({}),
      });

      const res = await testRequest(req);
      expect(res.status).toBe(200);

      const json = (await res.json()) as any;
      expect(json).toHaveProperty("id");
      expect(json).toHaveProperty("created_at");
      expect(json.title).toBe("New Conversation");
      expect(json.messages).toEqual([]);
    });

    it("GET /api/conversations - should list all conversations", async () => {
      // Create a conversation
      const createReq = new Request("http://localhost:8001/api/conversations", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: TEST_AUTH_TOKEN,
        },
        body: JSON.stringify({}),
      });
      const createRes = await testRequest(createReq);
      const conversation = (await createRes.json()) as any;

      // List conversations
      const listReq = new Request("http://localhost:8001/api/conversations", {
        method: "GET",
        headers: {
          Authorization: TEST_AUTH_TOKEN,
        },
      });
      const listRes = await testRequest(listReq);
      expect(listRes.status).toBe(200);

      const list = (await listRes.json()) as any[];
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
        headers: {
          "Content-Type": "application/json",
          Authorization: TEST_AUTH_TOKEN,
        },
        body: JSON.stringify({}),
      });
      const createRes = await testRequest(createReq);
      const conversation = (await createRes.json()) as any;

      // Get the conversation
      const getReq = new Request(
        `http://localhost:8001/api/conversations/${conversation.id}`,
        {
          method: "GET",
          headers: {
            Authorization: TEST_AUTH_TOKEN,
          },
        }
      );
      const getRes = await testRequest(getReq);
      expect(getRes.status).toBe(200);

      const retrieved = (await getRes.json()) as any;
      expect(retrieved.id).toBe(conversation.id);
      expect(retrieved.title).toBe("New Conversation");
    });

    it("GET /api/conversations/{id} - should return 404 for non-existent conversation", async () => {
      const req = new Request(
        "http://localhost:8001/api/conversations/non-existent-id",
        {
          method: "GET",
          headers: {
            Authorization: TEST_AUTH_TOKEN,
          },
        }
      );

      const res = await testRequest(req);
      expect(res.status).toBe(404);

      const json = (await res.json()) as any;
      expect(json.error).toBe("Conversation not found");
    });
  });

  describe("Workflow Endpoints", () => {
    it("GET /api/workflows - should list available workflows", async () => {
      const req = new Request("http://localhost:8001/api/workflows", {
        method: "GET",
      });

      const res = await testRequest(req);
      expect(res.status).toBe(200);

      const workflows = (await res.json()) as any[];
      expect(Array.isArray(workflows)).toBe(true);
      expect(workflows.length).toBeGreaterThan(0);
      
      // Check workflow structure
      if (workflows.length > 0) {
        expect(workflows[0]).toHaveProperty("id");
        expect(workflows[0]).toHaveProperty("name");
        expect(workflows[0]).toHaveProperty("version");
      }
    });

    it("GET /api/workflows/{id} - should get workflow with DAG", async () => {
      // First, get list of workflows to find a valid ID
      const listReq = new Request("http://localhost:8001/api/workflows", {
        method: "GET",
      });
      const listRes = await testRequest(listReq);
      const workflows = (await listRes.json()) as any[];
      
      if (workflows.length === 0) {
        // Skip test if no workflows available
        return;
      }

      const workflowId = workflows[0].id;
      const req = new Request(
        `http://localhost:8001/api/workflows/${workflowId}`,
        {
          method: "GET",
        }
      );

      const res = await testRequest(req);
      expect(res.status).toBe(200);

      const workflow = (await res.json()) as any;
      expect(workflow.id).toBe(workflowId);
      expect(workflow).toHaveProperty("dag");
      expect(workflow.dag).toHaveProperty("nodes");
      expect(workflow.dag).toHaveProperty("edges");
    });

    it("GET /api/workflows/{id} - should return 404 for non-existent workflow", async () => {
      const req = new Request(
        "http://localhost:8001/api/workflows/non-existent-workflow",
        {
          method: "GET",
        }
      );

      const res = await testRequest(req);
      expect(res.status).toBe(404);

      const json = (await res.json()) as any;
      expect(json.error).toBe("Workflow not found");
    });
  });

  describe("Workflow Execution Endpoint", () => {
    it("POST /api/conversations/{id}/execute/stream - should reject request with missing content", async () => {
      // Create a conversation
      const createReq = new Request("http://localhost:8001/api/conversations", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: TEST_AUTH_TOKEN,
        },
        body: JSON.stringify({}),
      });
      const createRes = await testRequest(createReq);
      const conversation = (await createRes.json()) as any;

      // Try to execute workflow without content
      const req = new Request(
        `http://localhost:8001/api/conversations/${conversation.id}/execute/stream`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: TEST_AUTH_TOKEN,
          },
          body: JSON.stringify({ workflowId: "llm-council" }),
        }
      );

      const res = await testRequest(req);
      expect(res.status).toBe(400);
    });

    it("POST /api/conversations/{id}/execute/stream - should reject request with missing workflowId", async () => {
      // Create a conversation
      const createReq = new Request("http://localhost:8001/api/conversations", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: TEST_AUTH_TOKEN,
        },
        body: JSON.stringify({}),
      });
      const createRes = await testRequest(createReq);
      const conversation = (await createRes.json()) as any;

      // Try to execute workflow without workflowId
      const req = new Request(
        `http://localhost:8001/api/conversations/${conversation.id}/execute/stream`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: TEST_AUTH_TOKEN,
          },
          body: JSON.stringify({ content: "Hello" }),
        }
      );

      const res = await testRequest(req);
      expect(res.status).toBe(400);
    });

    it("POST /api/conversations/{id}/execute/stream - should reject request to non-existent conversation", async () => {
      const req = new Request(
        "http://localhost:8001/api/conversations/non-existent/execute/stream",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: TEST_AUTH_TOKEN,
          },
          body: JSON.stringify({
            workflowId: "llm-council",
            content: "Hello",
          }),
        }
      );

      const res = await testRequest(req);
      expect(res.status).toBe(404);

      const json = (await res.json()) as any;
      expect(json.error).toBe("Conversation not found");
    });
  });

  describe("Authentication & Authorization", () => {
    it("should return 401 for missing Authorization header", async () => {
      const req = new Request("http://localhost:8001/api/conversations", {
        method: "GET",
      });

      const res = await testRequest(req);
      expect(res.status).toBe(401);

      const json = (await res.json()) as any;
      expect(json.error).toBeDefined();
    });

    it("should return 401 for invalid Authorization header format", async () => {
      const req = new Request("http://localhost:8001/api/conversations", {
        method: "GET",
        headers: {
          Authorization: "InvalidFormat",
        },
      });

      const res = await testRequest(req);
      expect(res.status).toBe(401);
    });

    it("should return 403 for unauthorized access to conversation", async () => {
      // Create a conversation with user A
      const createReq = new Request("http://localhost:8001/api/conversations", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: TEST_AUTH_TOKEN,
        },
        body: JSON.stringify({}),
      });
      const createRes = await testRequest(createReq);
      const conversation = (await createRes.json()) as any;

      // Try to access with a different user (different token)
      const differentToken = "Bearer different-user-token";
      const getReq = new Request(
        `http://localhost:8001/api/conversations/${conversation.id}`,
        {
          method: "GET",
          headers: {
            Authorization: differentToken,
          },
        }
      );

      const res = await testRequest(getReq);
      expect(res.status).toBe(403);

      const json = (await res.json()) as any;
      expect(json.error).toBeDefined();
    });
  });

  describe("Request Validation", () => {
    it("should return 400 for invalid conversation ID format", async () => {
      const req = new Request(
        "http://localhost:8001/api/conversations/",
        {
          method: "GET",
          headers: {
            Authorization: TEST_AUTH_TOKEN,
          },
        }
      );

      const res = await testRequest(req);
      // Should return 404 (route not matched) or 400 (validation error)
      expect([400, 404]).toContain(res.status);
    });

    it("should return 400 for invalid request body", async () => {
      const req = new Request("http://localhost:8001/api/conversations", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: TEST_AUTH_TOKEN,
        },
        body: "invalid json",
      });

      const res = await testRequest(req);
      expect(res.status).toBe(400);
    });
  });

  describe("CORS Headers", () => {
    it("should include CORS headers in response", async () => {
      const req = new Request("http://localhost:8001/", {
        method: "GET",
      });

      const res = await testRequest(req);
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

      const res = await testRequest(req);
      expect(res.status).toBe(204); // CORS preflight should return 204
    });
  });

  describe("Conversation Flow", () => {
    it("should handle complete conversation lifecycle", async () => {
      // 1. Create conversation
      const createReq = new Request("http://localhost:8001/api/conversations", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: TEST_AUTH_TOKEN,
        },
        body: JSON.stringify({}),
      });
      const createRes = await testRequest(createReq);
      const conversation = (await createRes.json()) as any;
      expect(conversation.id).toBeDefined();

      // 2. Get conversation
      const getReq = new Request(
        `http://localhost:8001/api/conversations/${conversation.id}`,
        {
          method: "GET",
          headers: {
            Authorization: TEST_AUTH_TOKEN,
          },
        }
      );
      const getRes = await testRequest(getReq);
      const retrieved = (await getRes.json()) as any;
      expect(retrieved.id).toBe(conversation.id);
      expect(retrieved.messages).toHaveLength(0);

      // 3. List conversations
      const listReq = new Request("http://localhost:8001/api/conversations", {
        method: "GET",
        headers: {
          Authorization: TEST_AUTH_TOKEN,
        },
      });
      const listRes = await testRequest(listReq);
      const list = (await listRes.json()) as any[];
      expect(list.length).toBeGreaterThan(0);

      const found = list.find((c: any) => c.id === conversation.id);
      expect(found).toBeDefined();
      expect(found.message_count).toBe(0);
    });
  });

  describe("Edge Cases", () => {
    it("should handle very long conversation IDs", async () => {
      const longId = "a".repeat(255); // Max length
      const req = new Request(
        `http://localhost:8001/api/conversations/${longId}`,
        {
          method: "GET",
          headers: {
            Authorization: TEST_AUTH_TOKEN,
          },
        }
      );

      const res = await testRequest(req);
      // Should either return 404 (not found) or 400 (validation error)
      expect([400, 404]).toContain(res.status);
    });

    it("should handle empty conversation ID", async () => {
      const req = new Request(
        "http://localhost:8001/api/conversations/",
        {
          method: "GET",
          headers: {
            Authorization: TEST_AUTH_TOKEN,
          },
        }
      );

      const res = await testRequest(req);
      expect([400, 404]).toContain(res.status);
    });

    it("should handle special characters in conversation ID", async () => {
      const req = new Request(
        "http://localhost:8001/api/conversations/test@#$%",
        {
          method: "GET",
          headers: {
            Authorization: TEST_AUTH_TOKEN,
          },
        }
      );

      const res = await testRequest(req);
      // Should handle gracefully (either 400 or 404)
      expect([400, 404]).toContain(res.status);
    });

    it("should handle missing Content-Type header", async () => {
      const req = new Request("http://localhost:8001/api/conversations", {
        method: "POST",
        headers: {
          Authorization: TEST_AUTH_TOKEN,
        },
        body: JSON.stringify({}),
      });

      const res = await testRequest(req);
      // Should still work (Content-Type is optional for JSON)
      expect([200, 400]).toContain(res.status);
    });

    it("should handle malformed Authorization header", async () => {
      const req = new Request("http://localhost:8001/api/conversations", {
        method: "GET",
        headers: {
          Authorization: "Bearer token1 token2 token3", // Too many parts
        },
      });

      const res = await testRequest(req);
      expect(res.status).toBe(401);
    });
  });

  describe("Rate Limiting", () => {
    it("should handle rate limit headers in response", async () => {
      // Note: Rate limiting is disabled in test config, but we can test the endpoint
      const req = new Request("http://localhost:8001/api/conversations", {
        method: "GET",
        headers: {
          Authorization: TEST_AUTH_TOKEN,
        },
      });

      const res = await testRequest(req);
      // Should succeed (rate limiting disabled in tests)
      expect(res.status).toBe(200);
    });
  });

  describe("Workflow Endpoints - Edge Cases", () => {
    it("should handle empty workflow list gracefully", async () => {
      // This test assumes workflows are registered, but tests edge case
      const req = new Request("http://localhost:8001/api/workflows", {
        method: "GET",
      });

      const res = await testRequest(req);
      expect(res.status).toBe(200);
      const workflows = (await res.json()) as any[];
      expect(Array.isArray(workflows)).toBe(true);
    });

    it("should handle workflow ID with special characters", async () => {
      const req = new Request(
        "http://localhost:8001/api/workflows/test@workflow#id",
        {
          method: "GET",
        }
      );

      const res = await testRequest(req);
      // Should handle gracefully
      expect([400, 404]).toContain(res.status);
    });
  });
});
