/**
 * Type definitions for LLM Council Frontend
 */

/** Individual response from a council member model */
export interface Stage1Response {
  model: string;
  content: string;
  reasoning_details?: string;
}

/** Ranking evaluation from a model */
export interface Stage2Ranking {
  model: string;
  ranking: string; // Raw ranking text
  parsed_ranking: string[]; // Extracted ranking like ["Response A", "Response B", ...]
}

/** Final synthesized response from chairman */
export interface Stage3Response {
  model: string;
  response: string;
}

/** Metadata about aggregated rankings */
export interface AggregateRanking {
  model: string;
  average_rank: number;
  rankings_count: number;
}

/** Mapping from anonymous response labels to actual model names */
export type LabelToModelMap = Record<string, string>;

/** Metadata about the council response */
export interface CouncilMetadata {
  label_to_model: LabelToModelMap; // Maps "Response A" -> "openai/gpt-5.1"
  aggregate_rankings: AggregateRanking[];
}

/** Assistant message with all council stages and metadata */
export interface AssistantMessage {
  role: "assistant";
  stage1: Stage1Response[];
  stage2: Stage2Ranking[];
  stage3: Stage3Response;
  metadata?: CouncilMetadata;
}

/** User message */
export interface UserMessage {
  role: "user";
  content: string;
}

/** Union of all message types */
export type Message = UserMessage | AssistantMessage;

/** Conversation structure */
export interface Conversation {
  id: string;
  created_at: string;
  title: string;
  messages: Message[];
}

/** Metadata returned when listing conversations */
export interface ConversationMetadata {
  id: string;
  created_at: string;
  title: string;
  message_count: number;
}

/** API Response for creating conversation */
export interface CreateConversationResponse {
  id: string;
  created_at: string;
  title: string;
  messages: Message[];
}

/** API Response for getting conversation */
export interface GetConversationResponse {
  id: string;
  created_at: string;
  title: string;
  messages: Message[];
}

/** API Response for sending message (batch) */
export interface SendMessageResponse {
  role: "assistant";
  stage1: Stage1Response[];
  stage2: Stage2Ranking[];
  stage3: Stage3Response;
  metadata: CouncilMetadata;
  title?: string;
}

/** SSE Event types for streaming */
export type StreamEventType =
  | "stage1_start"
  | "stage1_complete"
  | "stage2_start"
  | "stage2_complete"
  | "stage3_start"
  | "stage3_complete"
  | "title_complete"
  | "complete"
  | "error";

/** SSE Event structure */
export interface StreamEvent {
  type: StreamEventType;
  data?: unknown;
  error?: string;
}

/** Type guard for assistant messages */
export function isAssistantMessage(msg: Message): msg is AssistantMessage {
  return msg.role === "assistant";
}

/** Type guard for user messages */
export function isUserMessage(msg: Message): msg is UserMessage {
  return msg.role === "user";
}
