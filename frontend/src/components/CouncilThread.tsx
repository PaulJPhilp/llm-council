import { FC, useRef, useEffect } from "react";
import ReactMarkdown from "react-markdown";
import type { Conversation, AssistantMessage, UserMessage } from "../types";
import Stage1Enhanced from "./Stage1Enhanced";
import Stage2Enhanced from "./Stage2Enhanced";
import Stage3Enhanced from "./Stage3Enhanced";
import "./ChatInterface.css";

interface CouncilThreadProps {
  conversation?: Conversation;
  isLoading?: boolean;
}

// Extended message type to include loading states
interface ExtendedMessage extends AssistantMessage {
  loading?: {
    stage1?: boolean;
    stage2?: boolean;
    stage3?: boolean;
  };
}

/**
 * Council-optimized message thread component
 * Displays messages with specialized rendering for 3-stage council responses
 * Compatible with assistant-ui runtime pattern but customized for council architecture
 */
const CouncilThread: FC<CouncilThreadProps> = ({ conversation, isLoading }) => {
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [conversation?.messages.length]);

  if (!conversation) {
    return (
      <div className="messages-container">
        <div className="empty-state">
          <h2>Welcome to LLM Council</h2>
          <p>Create a new conversation to get started</p>
        </div>
      </div>
    );
  }

  return (
    <div className="messages-container">
      {conversation.messages.length === 0 ? (
        <div className="empty-state">
          <h2>Start a conversation</h2>
          <p>Ask a question to consult the LLM Council</p>
        </div>
      ) : (
        conversation.messages.map((msg, index) => (
          <div key={index} className="message-group">
            {msg.role === "user" ? (
              <div className="user-message">
                <div className="message-label">You</div>
                <div className="message-content">
                  <div className="markdown-content">
                    <ReactMarkdown>
                      {(msg as UserMessage).content}
                    </ReactMarkdown>
                  </div>
                </div>
              </div>
            ) : (
              <div className="assistant-message">
                <div className="message-label">LLM Council</div>

                {/* Stage 1 */}
                {(msg as ExtendedMessage).loading?.stage1 && (
                  <div className="stage-loading">
                    <div className="spinner"></div>
                    <span>
                      Running Stage 1: Collecting individual responses...
                    </span>
                  </div>
                )}
                {(msg as ExtendedMessage).stage1 && (
                  <Stage1Enhanced responses={(msg as ExtendedMessage).stage1} />
                )}

                {/* Stage 2 */}
                {(msg as ExtendedMessage).loading?.stage2 && (
                  <div className="stage-loading">
                    <div className="spinner"></div>
                    <span>Running Stage 2: Peer rankings...</span>
                  </div>
                )}
                {(msg as ExtendedMessage).stage2 && (
                  <Stage2Enhanced
                    rankings={(msg as ExtendedMessage).stage2}
                    labelToModel={
                      (msg as ExtendedMessage).metadata?.label_to_model
                    }
                    aggregateRankings={
                      (msg as ExtendedMessage).metadata
                        ?.aggregate_rankings
                    }
                  />
                )}

                {/* Stage 3 */}
                {(msg as ExtendedMessage).loading?.stage3 && (
                  <div className="stage-loading">
                    <div className="spinner"></div>
                    <span>Running Stage 3: Final synthesis...</span>
                  </div>
                )}
                {(msg as ExtendedMessage).stage3 && (
                  <Stage3Enhanced
                    stage3={(msg as ExtendedMessage).stage3}
                  />
                )}
              </div>
            )}
          </div>
        ))
      )}

      {isLoading && (
        <div className="loading-indicator">
          <div className="spinner"></div>
          <span>Consulting the council...</span>
        </div>
      )}

      <div ref={messagesEndRef} />
    </div>
  );
};

export default CouncilThread;
