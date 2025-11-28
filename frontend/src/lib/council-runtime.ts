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

        // Use v3 workflow API if workflowId provided, otherwise fall back to v1 API
        if (workflowId) {
          const progressEvents: unknown[] = [];
          const stageResults: Record<string, unknown> = {};

          // Start streaming with v3 API
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
            label_to_model: {},
            aggregate_rankings: [],
            custom: {
              workflowId: workflowId,
              nodes: [],
              edges: [],
              stageResults,
              progressEvents: progressEvents as any,
            },
          };
        } else {
          // Fall back to v1 API (sendMessageStream)
          await api.sendMessageStream(
            conversation.id,
            userMessage.content,
            (eventType: string, event: unknown) => {
              onStreamEvent?.(eventType, event);

              // Update assistant message as events arrive
              const eventData = event as Record<string, unknown>;
              switch (eventType) {
                case "stage1_complete":
                  assistantMessage.stage1 = (eventData.data ||
                    []) as typeof assistantMessage.stage1;
                  break;
                case "stage2_complete":
                  assistantMessage.stage2 = (eventData.data ||
                    []) as typeof assistantMessage.stage2;
                  assistantMessage.metadata = (eventData.metadata ||
                    {}) as typeof assistantMessage.metadata;
                  break;
                case "stage3_complete":
                  assistantMessage.stage3 = (eventData.data || {
                    model: "",
                    response: "",
                  }) as typeof assistantMessage.stage3;
                  break;
              }
            }
          );
        }

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
