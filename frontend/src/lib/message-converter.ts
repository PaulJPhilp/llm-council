/**
 * Message format converters between LLM Council format and assistant-ui format
 */

import type {
  AssistantMessage,
  UserMessage,
  Message,
  Stage1Response,
  Stage2Ranking,
  Stage3Response,
  CouncilMetadata,
} from "../types";

/** Extended message type that includes UI state */
export type UIMessage = Message & {
  loading?: {
    stage1: boolean;
    stage2: boolean;
    stage3: boolean;
  };
};

/**
 * Convert an assistant message to a display-friendly format
 * Extracts key information for UI rendering
 */
export function messageToDisplayFormat(
  message: UIMessage
): {
  role: string;
  isUser: boolean;
  userContent?: string;
  stage1?: Stage1Response[];
  stage2?: Stage2Ranking[];
  stage3?: Stage3Response;
  metadata?: CouncilMetadata;
  loading?: { stage1: boolean; stage2: boolean; stage3: boolean };
} {
  const msg = message as UserMessage | AssistantMessage;
  if (msg.role === "user") {
    return {
      role: "user",
      isUser: true,
      userContent: (msg as UserMessage).content,
    };
  }

  const assistantMsg = msg as AssistantMessage & { loading?: Record<string, boolean> };
  return {
    role: "assistant",
    isUser: false,
    stage1: assistantMsg.stage1,
    stage2: assistantMsg.stage2,
    stage3: assistantMsg.stage3,
    metadata: assistantMsg.metadata,
    loading: assistantMsg.loading as { stage1: boolean; stage2: boolean; stage3: boolean },
  };
}

/**
 * Get the main text content to display for a message
 * For user messages, returns the user's input
 * For assistant messages, returns the Stage 3 synthesis
 */
export function getMainContent(message: Message): string {
  if (message.role === "user") {
    return (message as UserMessage).content;
  }

  const assistantMsg = message as AssistantMessage;
  return assistantMsg.stage3?.response || "(No response available)";
}

/**
 * Check if all stages are complete for an assistant message
 */
export function isMessageComplete(message: Message): boolean {
  if (message.role === "user") return true;

  const assistantMsg = message as AssistantMessage;
  return !!(
    assistantMsg.stage1 &&
    assistantMsg.stage2 &&
    assistantMsg.stage3 &&
    assistantMsg.metadata
  );
}

/**
 * Check if any stages are loading
 */
export function isMessageLoading(message: Message): boolean {
  if (message.role === "user") return false;

  const msg = message as UIMessage;
  if (!msg.loading) return false;

  return msg.loading.stage1 || msg.loading.stage2 || msg.loading.stage3;
}
