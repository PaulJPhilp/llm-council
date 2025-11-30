/**
 * Council Runtime Adapter for assistant-ui using ExternalStoreRuntime
 *
 * This adapter bridges the existing LLM Council message format with assistant-ui's
 * runtime expectations, using ExternalStoreRuntime to maintain full control over state.
 */

import { useExternalStoreRuntime } from "@assistant-ui/react";
import { api } from "../api";
import type { AssistantMessage, Conversation, UserMessage } from "../types";
import { getMainContent } from "./message-converter";

export type UseCouncilRuntimeOptions = {
  conversation: Conversation | null;
  onConversationChange: (messages: (AssistantMessage | UserMessage)[]) => void;
  onStreamEvent?: (eventType: string, data: unknown) => void;
  workflowId?: string;
};

/**
 * Custom hook for managing council runtime with assistant-ui
 *
 * Uses ExternalStoreRuntime to preserve the full 3-stage message format
 * while providing assistant-ui with the necessary message structure.
 */
export function useCouncilRuntime({
  conversation,
  onConversationChange,
  onStreamEvent,
  workflowId,
}: UseCouncilRuntimeOptions) {
  const runtime = useExternalStoreRuntime({
    // Current messages in the conversation
    messages: conversation?.messages || [],

    // Whether we're currently waiting for a response
    isRunning: false,

    // Handle new messages from the user
    async onNew(message) {
      if (!conversation) {
        return;
      }

      try {
        // Add user message to conversation
        const userMessage: UserMessage = {
          role: "user",
          content:
            message.content[0]?.type === "text" ? message.content[0].text : "",
        };

        const updatedMessages = [...(conversation.messages || []), userMessage];
        onConversationChange(updatedMessages);

        // Create empty assistant message to show loading states
        const assistantMessage: AssistantMessage = {
          role: "assistant",
          stage1: [],
          stage2: [],
          stage3: {
            model: "",
            response: "",
          },
          metadata: {
            label_to_model: {},
            aggregate_rankings: [],
            custom: {
              workflowId: workflowId || "llm-council-v1",
              nodes: [],
              edges: [],
              stageResults: {},
              progressEvents: [],
            },
          },
        };

        // Require workflowId - the old v1 API is no longer available
        if (!workflowId) {
          throw new Error("workflowId is required. Please select a workflow before sending a message.");
        }

        const progressEvents: unknown[] = [];
        const stageResults: Record<string, unknown> = {};

        // Start streaming with workflow API
        await api.executeWorkflowStream(
          conversation.id,
          userMessage.content,
          workflowId,
          (event) => {
            onStreamEvent?.(event.type, event);
            progressEvents.push(event);

            // Capture stage results
            if (event.type === "stage_complete" && event.stageId && event.data) {
              stageResults[event.stageId] = event.data;

              // Map stage IDs to message properties for backward compatibility
              if (event.stageId === "parallel-query") {
                assistantMessage.stage1 = event.data as typeof assistantMessage.stage1;
              } else if (event.stageId === "peer-ranking") {
                assistantMessage.stage2 = event.data as typeof assistantMessage.stage2;
                // Save metadata from peer-ranking stage
                if (event.metadata && typeof event.metadata === "object") {
                  assistantMessage.metadata = {
                    ...assistantMessage.metadata,
                    ...(event.metadata as typeof assistantMessage.metadata),
                  };
                }
              } else if (event.stageId === "synthesis") {
                assistantMessage.stage3 = event.data as typeof assistantMessage.stage3;
              }
            }

            // Update custom metadata
            const customMetadata = assistantMessage.metadata?.custom as Record<string, unknown>;
            if (customMetadata) {
              customMetadata.progressEvents = progressEvents;
              customMetadata.stageResults = stageResults;
            }
          }
        );

        // Add completed assistant message with workflow metadata
        assistantMessage.metadata = {
          ...assistantMessage.metadata,
          custom: {
            workflowId: workflowId,
            nodes: [],
            edges: [],
            stageResults,
            progressEvents: progressEvents as any,
          },
        };

        // Add completed assistant message
        onConversationChange([...updatedMessages, assistantMessage]);
      } catch (error) {
        console.error("Failed to send message:", error);
        throw error;
      }
    },

    // Convert messages to assistant-ui format for display
    convertMessage(message: AssistantMessage | UserMessage) {
      if (message.role === "user") {
        return {
          role: "user" as const,
          content: [
            {
              type: "text" as const,
              text: (message as UserMessage).content,
            },
          ],
        };
      }

      return {
        role: "assistant" as const,
        content: [
          {
            type: "text" as const,
            text: getMainContent(message),
          },
        ],
      };
    },
  });

  return runtime;
}
