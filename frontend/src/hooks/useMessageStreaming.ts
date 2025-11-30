import { useState } from "react";
import { api } from "../api";
import type { Conversation, WorkflowProgressEvent } from "../types";

type ExtendedMessage = {
  role: string;
  content?: string;
  stage1?: unknown;
  stage2?: unknown;
  stage3?: unknown;
  metadata?: unknown;
  loading?: {
    stage1: boolean;
    stage2: boolean;
    stage3: boolean;
  };
};

type UseMessageStreamingOptions = {
  workflowId: string;
  onComplete?: () => void;
  onError?: (error: Error) => void;
  onTitleUpdate?: (title: string) => void;
};

export function useMessageStreaming() {
  const [isLoading, setIsLoading] = useState(false);

  async function sendMessage(
    conversationId: string,
    content: string,
    currentConversation: Conversation | null,
    setConversation: (
      updater: (prev: Conversation | null) => Conversation | null
    ) => void,
    options: UseMessageStreamingOptions
  ) {
    if (!currentConversation) {
      throw new Error("Conversation not loaded");
    }

    if (!options.workflowId) {
      throw new Error("Workflow ID is required");
    }

    setIsLoading(true);

    try {
      // Optimistically add user message
      const userMessage: ExtendedMessage = { role: "user", content };
      setConversation((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          messages: [...prev.messages, userMessage],
        } as Conversation;
      });

      // Create partial assistant message
      const assistantMessage: ExtendedMessage = {
        role: "assistant",
        stage1: null,
        stage2: null,
        stage3: null,
        metadata: null,
        loading: {
          stage1: false,
          stage2: false,
          stage3: false,
        },
      };

      setConversation((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          messages: [...prev.messages, assistantMessage],
        } as Conversation;
      });

      // Track stage results as they come in
      const stageResults: Record<string, unknown> = {};

      // Execute workflow with streaming
      await api.executeWorkflowStream(
        conversationId,
        content,
        options.workflowId,
        (event: WorkflowProgressEvent) => {
          setConversation((prev) => {
            if (!prev) return prev;
            const messages = [...prev.messages];
            const lastMsg = messages.at(-1) as ExtendedMessage | undefined;

            if (!lastMsg || lastMsg.role !== "assistant") return prev;

            switch (event.type) {
              case "stage_start":
                // Stage started - update loading state based on stage ID
                if (event.stageId) {
                  if (event.stageId === "parallel-query" && lastMsg.loading) {
                    lastMsg.loading.stage1 = true;
                  } else if (event.stageId === "peer-ranking" && lastMsg.loading) {
                    lastMsg.loading.stage2 = true;
                  } else if (event.stageId === "synthesis" && lastMsg.loading) {
                    lastMsg.loading.stage3 = true;
                  }
                }
                break;

              case "stage_complete":
                // Stage completed - save result and update loading state
                if (event.stageId && event.data) {
                  stageResults[event.stageId] = event.data;

                  // Map stage IDs to message properties
                  if (event.stageId === "parallel-query") {
                    lastMsg.stage1 = event.data;
                    if (lastMsg.loading) {
                      lastMsg.loading.stage1 = false;
                    }
                  } else if (event.stageId === "peer-ranking") {
                    lastMsg.stage2 = event.data;
                    // Save metadata from peer-ranking stage (labelToModel, aggregateRankings)
                    if (event.metadata && typeof event.metadata === "object") {
                      lastMsg.metadata = event.metadata;
                    }
                    if (lastMsg.loading) {
                      lastMsg.loading.stage2 = false;
                    }
                  } else if (event.stageId === "synthesis") {
                    lastMsg.stage3 = event.data;
                    if (lastMsg.loading) {
                      lastMsg.loading.stage3 = false;
                    }
                  }
                }
                break;

              case "workflow_complete":
                // Workflow completed - ensure all loading states are false
                if (lastMsg.loading) {
                  lastMsg.loading.stage1 = false;
                  lastMsg.loading.stage2 = false;
                  lastMsg.loading.stage3 = false;
                }
                // Update metadata with workflow results if available
                if (event.data && typeof event.data === "object") {
                  lastMsg.metadata = event.data;
                }
                break;

              case "stage_error":
                // Stage error occurred
                if (options.onError) {
                  options.onError(
                    new Error(
                      event.message ||
                        `Stage ${event.stageId || "unknown"} failed: ${event.data?.toString() || "Unknown error"}`
                    )
                  );
                }
                // Clear loading states on error
                if (lastMsg.loading) {
                  lastMsg.loading.stage1 = false;
                  lastMsg.loading.stage2 = false;
                  lastMsg.loading.stage3 = false;
                }
                break;
            }

            return { ...prev, messages } as Conversation;
          });
        }
      );

      if (options.onComplete) {
        options.onComplete();
      }
    } catch (error) {
      // Remove optimistic messages on error
      setConversation((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          messages: prev.messages.slice(0, -2),
        };
      });

      const err =
        error instanceof Error ? error : new Error("Failed to send message");
      if (options.onError) {
        options.onError(err);
      }
      throw err;
    } finally {
      setIsLoading(false);
    }
  }

  return {
    sendMessage,
    isLoading,
  };
}
