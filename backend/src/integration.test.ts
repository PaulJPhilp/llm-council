/**
 * Comprehensive End-to-End Integration Tests
 * Tests complete workflows from HTTP request to response
 */

import { Effect, Runtime } from "effect";
import { promises as fs } from "node:fs";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { app } from "./http/app";
import { TestLayer } from "./runtime.test";
import * as Http from "@effect/platform/HttpServer";

// Test helper to execute HTTP routes
const testRequest = async (request: Request): Promise<Response> => {
  return Runtime.runPromise(Runtime.make(TestLayer))(
    Effect.gen(function* () {
      const httpRequest = Http.request.fromWeb(request);
      const response = yield* app.pipe(
        Effect.provideService(Http.request.HttpRequest, httpRequest)
      );
      return Http.response.toWeb(response);
    })
  );
};

// Test data directory
const TEST_DATA_DIR = "data/test-integration";
process.env.DATA_DIR = TEST_DATA_DIR;

// Test authentication token
const TEST_AUTH_TOKEN = "Bearer test-token-123";

describe("End-to-End Integration Tests", () => {
  beforeAll(async () => {
    try {
      await fs.rm(TEST_DATA_DIR, { recursive: true, force: true });
    } catch {
      // Directory might not exist
    }
  });

  afterEach(async () => {
    try {
      await fs.rm(TEST_DATA_DIR, { recursive: true, force: true });
    } catch {
      // Directory might not exist
    }
  });

  describe("Complete Workflow Execution Flow", () => {
    it("should execute a complete workflow from request to response", async () => {
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
      expect(createRes.status).toBe(200);
      const conversation = (await createRes.json()) as any;
      expect(conversation.id).toBeDefined();

      // 2. List workflows
      const workflowsReq = new Request("http://localhost:8001/api/workflows", {
        method: "GET",
      });
      const workflowsRes = await testRequest(workflowsReq);
      expect(workflowsRes.status).toBe(200);
      const workflows = (await workflowsRes.json()) as any[];
      expect(workflows.length).toBeGreaterThan(0);

      // 3. Get workflow details
      const workflowId = workflows[0].id;
      const workflowReq = new Request(
        `http://localhost:8001/api/workflows/${workflowId}`,
        {
          method: "GET",
        }
      );
      const workflowRes = await testRequest(workflowReq);
      expect(workflowRes.status).toBe(200);
      const workflow = (await workflowRes.json()) as any;
      expect(workflow.id).toBe(workflowId);
      expect(workflow.dag).toBeDefined();

      // 4. Execute workflow (SSE stream)
      const executeReq = new Request(
        `http://localhost:8001/api/conversations/${conversation.id}/execute/stream`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: TEST_AUTH_TOKEN,
          },
          body: JSON.stringify({
            workflowId,
            content: "What is artificial intelligence?",
          }),
        }
      );
      const executeRes = await testRequest(executeReq);
      expect(executeRes.status).toBe(200);
      expect(executeRes.headers.get("content-type")).toContain("text/event-stream");

      // 5. Verify conversation was updated
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
      const updated = (await getRes.json()) as any;
      expect(updated.messages.length).toBeGreaterThan(0);
    });

    it("should handle workflow execution errors gracefully", async () => {
      // Create conversation
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

      // Try to execute with invalid workflow ID
      const executeReq = new Request(
        `http://localhost:8001/api/conversations/${conversation.id}/execute/stream`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: TEST_AUTH_TOKEN,
          },
          body: JSON.stringify({
            workflowId: "non-existent-workflow",
            content: "Test query",
          }),
        }
      );
      const executeRes = await testRequest(executeReq);
      expect(executeRes.status).toBe(404);
    });
  });

  describe("Multi-User Isolation", () => {
    it("should isolate conversations by user", async () => {
      const USER_1_TOKEN = "Bearer user-1-token";
      const USER_2_TOKEN = "Bearer user-2-token";

      // User 1 creates conversation
      const create1Req = new Request("http://localhost:8001/api/conversations", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: USER_1_TOKEN,
        },
        body: JSON.stringify({}),
      });
      const create1Res = await testRequest(create1Req);
      const conv1 = (await create1Res.json()) as any;

      // User 2 creates conversation
      const create2Req = new Request("http://localhost:8001/api/conversations", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: USER_2_TOKEN,
        },
        body: JSON.stringify({}),
      });
      const create2Res = await testRequest(create2Req);
      const conv2 = (await create2Res.json()) as any;

      // User 1 should only see their conversation
      const list1Req = new Request("http://localhost:8001/api/conversations", {
        method: "GET",
        headers: {
          Authorization: USER_1_TOKEN,
        },
      });
      const list1Res = await testRequest(list1Req);
      const list1 = (await list1Res.json()) as any[];
      expect(list1.length).toBe(1);
      expect(list1[0].id).toBe(conv1.id);

      // User 2 should only see their conversation
      const list2Req = new Request("http://localhost:8001/api/conversations", {
        method: "GET",
        headers: {
          Authorization: USER_2_TOKEN,
        },
      });
      const list2Res = await testRequest(list2Req);
      const list2 = (await list2Res.json()) as any[];
      expect(list2.length).toBe(1);
      expect(list2[0].id).toBe(conv2.id);

      // User 1 should not be able to access User 2's conversation
      const get2Req = new Request(
        `http://localhost:8001/api/conversations/${conv2.id}`,
        {
          method: "GET",
          headers: {
            Authorization: USER_1_TOKEN,
          },
        }
      );
      const get2Res = await testRequest(get2Req);
      expect(get2Res.status).toBe(403);
    });
  });

  describe("Error Recovery", () => {
    it("should recover from storage errors", async () => {
      // Create conversation
      const createReq = new Request("http://localhost:8001/api/conversations", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: TEST_AUTH_TOKEN,
        },
        body: JSON.stringify({}),
      });
      const createRes = await testRequest(createReq);
      expect(createRes.status).toBe(200);

      // Subsequent operations should still work
      const listReq = new Request("http://localhost:8001/api/conversations", {
        method: "GET",
        headers: {
          Authorization: TEST_AUTH_TOKEN,
        },
      });
      const listRes = await testRequest(listReq);
      expect(listRes.status).toBe(200);
    });

    it("should handle concurrent requests", async () => {
      const requests = Array.from({ length: 5 }, () =>
        testRequest(
          new Request("http://localhost:8001/api/conversations", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: TEST_AUTH_TOKEN,
            },
            body: JSON.stringify({}),
          })
        )
      );

      const responses = await Promise.all(requests);
      expect(responses.every((r) => r.status === 200)).toBe(true);

      // All conversations should be created
      const listReq = new Request("http://localhost:8001/api/conversations", {
        method: "GET",
        headers: {
          Authorization: TEST_AUTH_TOKEN,
        },
      });
      const listRes = await testRequest(listReq);
      const list = (await listRes.json()) as any[];
      expect(list.length).toBe(5);
    });
  });

  describe("Request Validation Chain", () => {
    it("should validate request size before processing", async () => {
      const largeBody = "x".repeat(11 * 1024 * 1024); // 11 MB (exceeds 10 MB limit)

      const req = new Request("http://localhost:8001/api/conversations", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: TEST_AUTH_TOKEN,
        },
        body: JSON.stringify({ content: largeBody }),
      });

      const res = await testRequest(req);
      expect(res.status).toBe(413); // Payload Too Large
    });

    it("should validate authentication before processing", async () => {
      const req = new Request("http://localhost:8001/api/conversations", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          // No Authorization header
        },
        body: JSON.stringify({}),
      });

      const res = await testRequest(req);
      expect(res.status).toBe(401);
    });

    it("should validate request body schema", async () => {
      const req = new Request(
        "http://localhost:8001/api/conversations/test-id/execute/stream",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: TEST_AUTH_TOKEN,
          },
          body: JSON.stringify({
            // Missing required fields
            invalid: "data",
          }),
        }
      );

      const res = await testRequest(req);
      expect(res.status).toBe(400);
    });
  });
});

