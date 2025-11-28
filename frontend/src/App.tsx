import { type FC, useCallback, useEffect, useState } from "react";
import { api } from "./api";
import { Layout } from "./components/Layout";
import { ChatArea } from "./components/ChatArea";
import type { Conversation, ConversationMetadata, StreamEvent } from "./types";

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

const App: FC = () => {
  const [conversations, setConversations] = useState<ConversationMetadata[]>(
    []
  );
  const [currentConversationId, setCurrentConversationId] = useState<
    string | null
  >(null);
  const [currentConversation, setCurrentConversation] = useState<
    (Conversation & { messages: ExtendedMessage[] }) | null
  >(null);
  const [isLoading, setIsLoading] = useState(false);

  const loadConversations = useCallback(async () => {
    try {
      const convs = await api.listConversations();
      setConversations(convs);
    } catch (error) {
      console.error("Failed to load conversations:", error);
    }
  }, []);

  const loadConversation = useCallback(async (id: string) => {
    try {
      const conv = await api.getConversation(id);
      setCurrentConversation(
        conv as Conversation & { messages: ExtendedMessage[] }
      );
    } catch (error) {
      console.error("Failed to load conversation:", error);
    }
  }, []);

  // Load conversations on mount
  useEffect(() => {
    loadConversations();
  }, [loadConversations]);

  // Load conversation details when selected
  useEffect(() => {
    if (currentConversationId) {
      loadConversation(currentConversationId);
    }
  }, [currentConversationId, loadConversation]);

  const handleNewConversation = async () => {
    try {
      const newConv = await api.createConversation();
      setConversations([
        {
          id: newConv.id,
          created_at: newConv.created_at,
          title: newConv.title,
          message_count: 0,
        },
        ...conversations,
      ]);
      setCurrentConversationId(newConv.id);
    } catch (error) {
      console.error("Failed to create conversation:", error);
    }
  };

  const handleSelectConversation = (id: string) => {
    setCurrentConversationId(id);
  };

  const handleSendMessage = async (content: string) => {
    if (!(currentConversationId && currentConversation)) {
      return;
    }

    setIsLoading(true);
    try {
      // Optimistically add user message to UI
      const userMessage: ExtendedMessage = { role: "user", content };
      setCurrentConversation((prev) => {
        if (!prev) {
          return prev;
        }
        return {
          ...prev,
          messages: [...prev.messages, userMessage],
        } as typeof prev;
      });

      // Create a partial assistant message that will be updated progressively
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

      // Add the partial assistant message
      setCurrentConversation((prev) => {
        if (!prev) {
          return prev;
        }
        return {
          ...prev,
          messages: [...prev.messages, assistantMessage],
        } as typeof prev;
      });

      // Send message with streaming
      await api.sendMessageStream(
        currentConversationId,
        content,
        (eventType: string, event: StreamEvent) => {
          switch (eventType) {
            case "stage1_start":
              setCurrentConversation((prev) => {
                if (!prev) {
                  return prev;
                }
                const messages = [...prev.messages];
                const lastMsg = messages.at(-1);
                if (lastMsg?.loading) {
                  lastMsg.loading.stage1 = true;
                }
                return { ...prev, messages };
              });
              break;

            case "stage1_complete":
              setCurrentConversation((prev) => {
                if (!prev) {
                  return prev;
                }
                const messages = [...prev.messages];
                const lastMsg = messages.at(-1);
                if (lastMsg) {
                  lastMsg.stage1 = event.data;
                  if (lastMsg.loading) {
                    lastMsg.loading.stage1 = false;
                  }
                }
                return { ...prev, messages };
              });
              break;

            case "stage2_start":
              setCurrentConversation((prev) => {
                if (!prev) {
                  return prev;
                }
                const messages = [...prev.messages];
                const lastMsg = messages.at(-1);
                if (lastMsg?.loading) {
                  lastMsg.loading.stage2 = true;
                }
                return { ...prev, messages };
              });
              break;

            case "stage2_complete":
              setCurrentConversation((prev) => {
                if (!prev) {
                  return prev;
                }
                const messages = [...prev.messages];
                const lastMsg = messages.at(-1);
                if (lastMsg) {
                  lastMsg.stage2 = event.data;
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  lastMsg.metadata = (event as any).metadata;
                  if (lastMsg.loading) {
                    lastMsg.loading.stage2 = false;
                  }
                }
                return { ...prev, messages };
              });
              break;

            case "stage3_start":
              setCurrentConversation((prev) => {
                if (!prev) {
                  return prev;
                }
                const messages = [...prev.messages];
                const lastMsg = messages.at(-1);
                if (lastMsg?.loading) {
                  lastMsg.loading.stage3 = true;
                }
                return { ...prev, messages };
              });
              break;

            case "stage3_complete":
              setCurrentConversation((prev) => {
                if (!prev) {
                  return prev;
                }
                const messages = [...prev.messages];
                const lastMsg = messages.at(-1);
                if (lastMsg) {
                  lastMsg.stage3 = event.data;
                  if (lastMsg.loading) {
                    lastMsg.loading.stage3 = false;
                  }
                }
                return { ...prev, messages };
              });
              break;

            case "title_complete":
              // Reload conversations to get updated title
              loadConversations();
              break;

            case "complete":
              // Stream complete, reload conversations list
              loadConversations();
              setIsLoading(false);
              break;

            case "error":
              console.error("Stream error:", event);
              setIsLoading(false);
              break;

            default:
              console.log("Unknown event type:", eventType);
          }
        }
      );
    } catch (error) {
      console.error("Failed to send message:", error);
      // Remove optimistic messages on error
      setCurrentConversation((prev) => {
        if (!prev) {
          return prev;
        }
        return {
          ...prev,
          messages: prev.messages.slice(0, -2),
        };
      });
      setIsLoading(false);
    }
  };

  return (
    <Layout
      conversations={conversations}
      currentConversationId={currentConversationId || undefined}
      onNewConversation={handleNewConversation}
      onSelectConversation={handleSelectConversation}
    >
      <ChatArea
        conversation={currentConversation as Conversation | undefined}
        isLoading={isLoading}
        onSendMessage={handleSendMessage}
      />
    </Layout>
  );
};

export default App;
