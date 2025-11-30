/**
 * API client for the LLM Council backend.
 */

import { parseSSEStream } from "./lib/sse-parser";
import type {
  Conversation,
  ConversationMetadata,
  SendMessageResponse,
  StreamEvent,
  WorkflowMetadata,
  WorkflowDefinition,
  WorkflowProgressEvent,
  DAGRepresentation,
} from "./types";

const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:8001";

// Get authentication token from environment or localStorage
const getAuthToken = (): string | null => {
  // Check environment variable first (for development)
  const envToken = import.meta.env.VITE_AUTH_TOKEN;
  if (envToken) return envToken;
  
  // Check localStorage (for production)
  return localStorage.getItem("auth_token");
};

// Create headers with authentication
const createHeaders = (includeContentType = false): HeadersInit => {
  const headers: HeadersInit = {};
  
  if (includeContentType) {
    headers["Content-Type"] = "application/json";
  }
  
  const token = getAuthToken();
  if (token) {
    // Support both Bearer and ApiKey formats
    if (token.startsWith("Bearer ") || token.startsWith("ApiKey ")) {
      headers["Authorization"] = token;
    } else {
      // Default to Bearer token
      headers["Authorization"] = `Bearer ${token}`;
    }
  }
  
  return headers;
};

type StreamEventCallback = (eventType: string, event: StreamEvent) => void;

export const api = {
  /**
   * List all conversations.
   */
  async listConversations(): Promise<ConversationMetadata[]> {
    const response = await fetch(`${API_BASE}/api/conversations`, {
      headers: createHeaders(),
    });
    if (!response.ok) {
      throw new Error("Failed to list conversations");
    }
    return response.json();
  },

  /**
   * Create a new conversation.
   */
  async createConversation(): Promise<Conversation> {
    const response = await fetch(`${API_BASE}/api/conversations`, {
      method: "POST",
      headers: createHeaders(true),
      body: JSON.stringify({}),
    });
    if (!response.ok) {
      throw new Error("Failed to create conversation");
    }
    return response.json();
  },

  /**
   * Get a specific conversation.
   */
  async getConversation(conversationId: string): Promise<Conversation> {
    const response = await fetch(
      `${API_BASE}/api/conversations/${conversationId}`,
      {
        headers: createHeaders(),
      }
    );
    if (!response.ok) {
      throw new Error("Failed to get conversation");
    }
    return response.json();
  },

  /**
   * Send a message in a conversation (deprecated - use executeWorkflowStream instead).
   * @deprecated Use executeWorkflowStream instead
   */
  async sendMessage(
    conversationId: string,
    content: string
  ): Promise<SendMessageResponse> {
    throw new Error("sendMessage is deprecated. Use executeWorkflowStream instead.");
  },

  /**
   * Send a message and receive streaming updates (deprecated - use executeWorkflowStream instead).
   * @deprecated Use executeWorkflowStream instead
   */
  async sendMessageStream(
    conversationId: string,
    content: string,
    onEvent: StreamEventCallback
  ): Promise<void> {
    throw new Error("sendMessageStream is deprecated. Use executeWorkflowStream instead.");
  },

  /**
   * List all available workflows.
   */
  async listWorkflows(): Promise<WorkflowMetadata[]> {
    const response = await fetch(`${API_BASE}/api/workflows`, {
      headers: createHeaders(),
    });
    if (!response.ok) {
      throw new Error("Failed to list workflows");
    }
    return response.json();
  },

  /**
   * Get a specific workflow definition with DAG.
   */
  async getWorkflow(
    workflowId: string
  ): Promise<WorkflowDefinition & { dag: DAGRepresentation }> {
    const response = await fetch(`${API_BASE}/api/workflows/${workflowId}`, {
      headers: createHeaders(),
    });
    if (!response.ok) {
      throw new Error(`Failed to get workflow: ${workflowId}`);
    }
    return response.json();
  },

  /**
   * Execute a workflow and receive streaming progress updates.
   */
  async executeWorkflowStream(
    conversationId: string,
    content: string,
    workflowId: string,
    onEvent: (event: WorkflowProgressEvent) => void
  ): Promise<void> {
    const response = await fetch(
      `${API_BASE}/api/conversations/${conversationId}/execute/stream`,
      {
        method: "POST",
        headers: createHeaders(true),
        body: JSON.stringify({ content, workflowId }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text().catch(() => "Failed to execute workflow");
      throw new Error(errorText || "Failed to execute workflow");
    }

    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error("No readable stream returned");
    }

    await parseSSEStream(reader, {
      onEvent: (_eventType, event) => {
        onEvent(event as WorkflowProgressEvent);
      },
    });
  },
};
