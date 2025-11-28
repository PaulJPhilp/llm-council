import { randomUUID } from "node:crypto"
import { Hono } from "hono"
import { cors } from "hono/cors"
import {
  calculateAggregateRankings,
  generateConversationTitle,
  runFullCouncil,
  stage1CollectResponses,
  stage2CollectRankings,
  stage3SynthesizeFinal,
} from "./council"
import {
  addAssistantMessage,
  addUserMessage,
  type Conversation,
  type ConversationMetadata,
  type Stage1Response,
  type Stage2Response,
  type Stage3Response,
  createConversation,
  getConversation,
  listConversations,
  updateConversationTitle,
} from "./storage"
import { WorkflowRegistry } from "./workflow/registry"
import { executeCouncilWorkflow } from "./workflow/workflows/council-integration"

// Initialize Hono app
const app = new Hono()

// Initialize Workflow Registry with default models
const workflowRegistry = new WorkflowRegistry()

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
    const conversations = await listConversations();
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
    const conversation = await createConversation(conversationId);
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
    const conversation = await getConversation(conversationId);

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
    const conversation = await getConversation(conversationId);
    if (!conversation) {
      return c.json({ error: "Conversation not found" }, { status: 404 });
    }

    // Check if this is the first message
    const isFirstMessage = conversation.messages.length === 0;

    // Add user message
    await addUserMessage(conversationId, content);

    // Generate title if first message
    if (isFirstMessage) {
      const title = await generateConversationTitle(content);
      await updateConversationTitle(conversationId, title);
    }

    // Run the 3-stage council process
    const [stage1Results, stage2Results, stage3Result, metadata] =
      await runFullCouncil(content) as [any[], any[], any, any];

    // Add assistant message with all stages
    await addAssistantMessage(
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
    const conversation = await getConversation(conversationId);
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
          await addUserMessage(conversationId, content);

          // Start title generation in parallel (don't await yet)
          let titlePromise: Promise<string> | null = null;
          if (isFirstMessage) {
            titlePromise = generateConversationTitle(content);
          }

          // Stage 1: Collect responses
          controller.enqueue(
            `data: ${JSON.stringify({ type: "stage1_start" })}\n\n`
          );
          const stage1Results = await stage1CollectResponses(content) as any[];
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
          const [stage2Results, labelToModel] = await stage2CollectRankings(
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
          const stage3Result = await stage3SynthesizeFinal(
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
            await updateConversationTitle(conversationId, title);
            controller.enqueue(
              `data: ${JSON.stringify({
                type: "title_complete",
                data: { title },
              })}\n\n`
            );
          }

          // Save complete assistant message
          await addAssistantMessage(
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

// V2 API Endpoints - Using new workflow system

// Send a message via workflow system (batch response)
app.post("/api/v2/conversations/:conversationId/message", async (c) => {
  try {
    const conversationId = c.req.param("conversationId");
    const body = await c.req.json<{ content: string }>();
    const content = body.content;

    if (!content) {
      return c.json({ error: "Message content is required" }, { status: 400 });
    }

    // Check if conversation exists
    const conversation = await getConversation(conversationId);
    if (!conversation) {
      return c.json({ error: "Conversation not found" }, { status: 404 });
    }

    // Check if this is the first message
    const isFirstMessage = conversation.messages.length === 0;

    // Add user message
    await addUserMessage(conversationId, content);

    // Generate title if first message
    if (isFirstMessage) {
      const title = await generateConversationTitle(content);
      await updateConversationTitle(conversationId, title);
    }

    // Run the workflow-based council process
    const [stage1Results, stage2Results, stage3Result, metadata] =
      await runFullCouncil(content) as [any[], any[], any, any];

    // Add assistant message with all stages
    await addAssistantMessage(
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
    console.error("Error sending message via v2:", error);
    return c.json({ error: "Failed to process message" }, { status: 500 });
  }
});

// Send a message via workflow system (streaming SSE response)
app.post("/api/v2/conversations/:conversationId/message/stream", async (c) => {
  try {
    const conversationId = c.req.param("conversationId");
    const body = await c.req.json<{ content: string }>();
    const content = body.content;

    if (!content) {
      return c.json({ error: "Message content is required" }, { status: 400 });
    }

    // Check if conversation exists
    const conversation = await getConversation(conversationId);
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
          await addUserMessage(conversationId, content);

          // Start title generation in parallel (don't await yet)
          let titlePromise: Promise<string> | null = null;
          if (isFirstMessage) {
            titlePromise = generateConversationTitle(content);
          }

          // Run workflow
          const [stage1Results, stage2Results, stage3Result, metadata] =
            await runFullCouncil(content) as [any[], any[], any, any];

          const stage1Data = stage1Results;
          const stage2Data = stage2Results;
          const stage3Data = stage3Result;

          // Emit stage complete events
          controller.enqueue(
            `data: ${JSON.stringify({
              type: "stage1_complete",
              data: stage1Data,
            })}\n\n`
          );

          controller.enqueue(
            `data: ${JSON.stringify({
              type: "stage2_complete",
              data: stage2Data,
              metadata: metadata?.labelToModel || {},
            })}\n\n`
          );

          controller.enqueue(
            `data: ${JSON.stringify({
              type: "stage3_complete",
              data: stage3Data,
            })}\n\n`
          );

          // Wait for title generation if it was started
          if (titlePromise) {
            const title = await titlePromise;
            await updateConversationTitle(conversationId, title);
            controller.enqueue(
              `data: ${JSON.stringify({
                type: "title_complete",
                data: { title },
              })}\n\n`
            );
          }

          // Save complete assistant message
          await addAssistantMessage(
            conversationId,
            stage1Data,
            stage2Data,
            stage3Data
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
          console.error("Error in v2 stream:", errorMessage);
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
    console.error("Error in v2 SSE endpoint:", error);
    return c.json({ error: "Failed to start stream" }, { status: 500 });
  }
});

// V3 API Endpoints - Workflow-based execution

// List available workflows
app.get("/api/v3/workflows", async (c) => {
  try {
    const workflows = workflowRegistry.list()
    return c.json(workflows)
  } catch (error) {
    console.error("Error listing workflows:", error)
    return c.json({ error: "Failed to list workflows" }, { status: 500 })
  }
})

// Get a specific workflow with DAG representation
app.get("/api/v3/workflows/:workflowId", async (c) => {
  try {
    const workflowId = c.req.param("workflowId")
    const workflow = workflowRegistry.get(workflowId)

    if (!workflow) {
      return c.json({ error: "Workflow not found" }, { status: 404 })
    }

    const dag = workflowRegistry.toDAG(workflow)

    return c.json({
      id: workflow.id,
      name: workflow.name,
      version: workflow.version,
      description: workflow.description,
      dag,
    })
  } catch (error) {
    console.error("Error getting workflow:", error)
    return c.json({ error: "Failed to get workflow" }, { status: 500 })
  }
})

// Execute a workflow via streaming SSE
app.post("/api/v3/conversations/:conversationId/execute/stream", async (c) => {
  try {
    const conversationId = c.req.param("conversationId")
    const body = await c.req.json<{ content: string; workflowId: string }>()
    const { content, workflowId } = body

    if (!content) {
      return c.json({ error: "Message content is required" }, { status: 400 })
    }

    if (!workflowId) {
      return c.json({ error: "Workflow ID is required" }, { status: 400 })
    }

    // Verify workflow exists
    const workflow = workflowRegistry.get(workflowId)
    if (!workflow) {
      return c.json({ error: "Workflow not found" }, { status: 404 })
    }

    // Check if conversation exists
    const conversation = await getConversation(conversationId)
    if (!conversation) {
      return c.json({ error: "Conversation not found" }, { status: 404 })
    }

    // Check if this is the first message
    const isFirstMessage = conversation.messages.length === 0

    // Create a readable stream for SSE
    const stream = new ReadableStream<string>({
      async start(controller) {
        try {
          // Add user message
          await addUserMessage(conversationId, content)

          // Start title generation in parallel if first message
          let titlePromise: Promise<string> | null = null
          if (isFirstMessage) {
            titlePromise = generateConversationTitle(content)
          }

          // Track progress events
          const progressEvents: unknown[] = []
          const stageResults: Record<string, unknown> = {}

          // Execute workflow with progress callback
          await executeCouncilWorkflow(content, (event) => {
            progressEvents.push(event)

            // Stream the event to client
            controller.enqueue(`data: ${JSON.stringify(event)}\n\n`)

            // Capture stage results
            if (event.type === "stage_complete" && "stageId" in event) {
              stageResults[event.stageId as string] = event.data
            }
          })

          // Wait for title if started
          if (titlePromise) {
            const title = await titlePromise
            await updateConversationTitle(conversationId, title)
            controller.enqueue(
              `data: ${JSON.stringify({
                type: "title_complete",
                data: { title },
              })}\n\n`
            )
          }

          // Save the assistant message with workflow metadata
          // TODO: Update storage schema to support workflow format
          await addAssistantMessage(
            conversationId,
            (stageResults["parallel-query"] || []) as Stage1Response[],
            (stageResults["peer-ranking"] || []) as Stage2Response[],
            (stageResults["synthesis"] || {}) as Stage3Response
          )

          // Send completion event
          controller.enqueue(
            `data: ${JSON.stringify({ type: "workflow_complete" })}\n\n`
          )
          controller.close()
        } catch (error) {
          // Send error event
          const errorMessage =
            error instanceof Error ? error.message : String(error)
          console.error("Error in workflow stream:", errorMessage)
          controller.enqueue(
            `data: ${JSON.stringify({
              type: "error",
              message: errorMessage,
            })}\n\n`
          )
          controller.close()
        }
      },
    })

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    })
  } catch (error) {
    console.error("Error in workflow SSE endpoint:", error)
    return c.json({ error: "Failed to start stream" }, { status: 500 })
  }
})

// Export app for deployment
export default app
