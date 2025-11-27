import { randomUUID } from "node:crypto";
import { Hono } from "hono";
import { cors } from "hono/cors";
import {
  calculateAggregateRankings,
  generateConversationTitle,
  runFullCouncil,
  stage1CollectResponses,
  stage2CollectRankings,
  stage3SynthesizeFinal,
} from "./council";
import {
  addAssistantMessage,
  addUserMessage,
  type Conversation,
  type ConversationMetadata,
  createConversation,
  getConversation,
  listConversations,
  updateConversationTitle,
} from "./storage";

// Initialize Hono app
const app = new Hono();

// Enable CORS for local development
app.use(
  "*",
  cors({
    origin: ["http://localhost:5173", "http://localhost:3000"],
    credentials: true,
    allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization"],
  })
);

// Health check endpoint
app.get("/", async (c) =>
  c.json({
    status: "ok",
    service: "LLM Council API",
  })
);

// List all conversations (metadata only)
app.get("/api/conversations", async (c) => {
  try {
    const conversations = listConversations();
    return c.json(conversations as ConversationMetadata[]);
  } catch (error) {
    console.error("Error listing conversations:", error);
    return c.json({ error: "Failed to list conversations" }, { status: 500 });
  }
});

// Create a new conversation
app.post("/api/conversations", async (c) => {
  try {
    const conversationId = randomUUID();
    const conversation = createConversation(conversationId);
    return c.json(conversation as Conversation);
  } catch (error) {
    console.error("Error creating conversation:", error);
    return c.json({ error: "Failed to create conversation" }, { status: 500 });
  }
});

// Get a specific conversation
app.get("/api/conversations/:conversationId", async (c) => {
  try {
    const conversationId = c.req.param("conversationId");
    const conversation = getConversation(conversationId) as
      | Conversation
      | undefined;

    if (!conversation) {
      return c.json({ error: "Conversation not found" }, { status: 404 });
    }

    return c.json(conversation as Conversation);
  } catch (error) {
    console.error("Error getting conversation:", error);
    return c.json({ error: "Failed to get conversation" }, { status: 500 });
  }
});

// Send a message (batch response)
app.post("/api/conversations/:conversationId/message", async (c) => {
  try {
    const conversationId = c.req.param("conversationId");
    const body = await c.req.json<{ content: string }>();
    const content = body.content;

    if (!content) {
      return c.json({ error: "Message content is required" }, { status: 400 });
    }

    // Check if conversation exists
    const conversation = getConversation(conversationId);
    if (!conversation) {
      return c.json({ error: "Conversation not found" }, { status: 404 });
    }

    // Check if this is the first message
    const isFirstMessage = conversation.messages.length === 0;

    // Add user message
    addUserMessage(conversationId, content);

    // Generate title if first message
    if (isFirstMessage) {
      const title = generateConversationTitle(content);
      updateConversationTitle(conversationId, title);
    }

    // Run the 3-stage council process
    const [stage1Results, stage2Results, stage3Result, metadata] =
      runFullCouncil(content) as [any[], any[], any, any];

    // Add assistant message with all stages
    addAssistantMessage(
      conversationId,
      stage1Results,
      stage2Results,
      stage3Result
    );

    // Return the complete response with metadata
    return c.json({
      stage1: stage1Results,
      stage2: stage2Results,
      stage3: stage3Result,
      metadata,
    });
  } catch (error) {
    console.error("Error sending message:", error);
    return c.json({ error: "Failed to process message" }, { status: 500 });
  }
});

// Send a message (streaming SSE response)
app.post("/api/conversations/:conversationId/message/stream", async (c) => {
  try {
    const conversationId = c.req.param("conversationId");
    const body = await c.req.json<{ content: string }>();
    const content = body.content;

    if (!content) {
      return c.json({ error: "Message content is required" }, { status: 400 });
    }

    // Check if conversation exists
    const conversation = getConversation(conversationId);
    if (!conversation) {
      return c.json({ error: "Conversation not found" }, { status: 404 });
    }

    // Check if this is the first message
    const isFirstMessage = conversation.messages.length === 0;

    // Create a readable stream for SSE
    const stream = new ReadableStream<string>({
      async start(controller) {
        try {
          // Add user message
          addUserMessage(conversationId, content);

          // Start title generation in parallel (don't await yet)
          let titlePromise: Promise<string> | null = null;
          if (isFirstMessage) {
            titlePromise = Promise.resolve(generateConversationTitle(content));
          }

          // Stage 1: Collect responses
          controller.enqueue(
            `data: ${JSON.stringify({ type: "stage1_start" })}\n\n`
          );
          const stage1Results = stage1CollectResponses(content) as any[];
          controller.enqueue(
            `data: ${JSON.stringify({
              type: "stage1_complete",
              data: stage1Results,
            })}\n\n`
          );

          // Stage 2: Collect rankings
          controller.enqueue(
            `data: ${JSON.stringify({ type: "stage2_start" })}\n\n`
          );
          const [stage2Results, labelToModel] = stage2CollectRankings(
            content,
            stage1Results
          ) as [any[], any];
          const aggregateRankings = calculateAggregateRankings(
            stage2Results,
            labelToModel
          );
          controller.enqueue(
            `data: ${JSON.stringify({
              type: "stage2_complete",
              data: stage2Results,
              metadata: {
                label_to_model: labelToModel,
                aggregate_rankings: aggregateRankings,
              },
            })}\n\n`
          );

          // Stage 3: Synthesize final answer
          controller.enqueue(
            `data: ${JSON.stringify({ type: "stage3_start" })}\n\n`
          );
          const stage3Result = stage3SynthesizeFinal(
            content,
            stage1Results,
            stage2Results
          ) as any;
          controller.enqueue(
            `data: ${JSON.stringify({
              type: "stage3_complete",
              data: stage3Result,
            })}\n\n`
          );

          // Wait for title generation if it was started
          if (titlePromise) {
            const title = await titlePromise;
            updateConversationTitle(conversationId, title);
            controller.enqueue(
              `data: ${JSON.stringify({
                type: "title_complete",
                data: { title },
              })}\n\n`
            );
          }

          // Save complete assistant message
          addAssistantMessage(
            conversationId,
            stage1Results,
            stage2Results,
            stage3Result
          );

          // Send completion event
          controller.enqueue(
            `data: ${JSON.stringify({ type: "complete" })}\n\n`
          );
          controller.close();
        } catch (error) {
          // Send error event
          const errorMessage =
            error instanceof Error ? error.message : String(error);
          console.error("Error in stream:", errorMessage);
          controller.enqueue(
            `data: ${JSON.stringify({
              type: "error",
              message: errorMessage,
            })}\n\n`
          );
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (error) {
    console.error("Error in SSE endpoint:", error);
    return c.json({ error: "Failed to start stream" }, { status: 500 });
  }
});

// Export app for deployment
export default app;

// Start server if running directly
if (typeof Bun !== "undefined" && Bun.serve) {
  const port = Number.parseInt(process.env.PORT || "8001", 10);
  console.log(`Server running on http://0.0.0.0:${port}`);
  Bun.serve({
    port,
    fetch: app.fetch,
  });
}
