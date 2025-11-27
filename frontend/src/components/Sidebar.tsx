import { FC } from "react";
import type { ConversationMetadata } from "../types";
import "./Sidebar.css";

interface SidebarProps {
  conversations: ConversationMetadata[];
  currentConversationId?: string;
  onSelectConversation: (id: string) => void;
  onNewConversation: () => void;
}

const Sidebar: FC<SidebarProps> = ({
  conversations,
  currentConversationId,
  onSelectConversation,
  onNewConversation,
}) => {
  return (
    <aside className="sidebar" role="navigation" aria-label="Conversations">
      <div className="sidebar-header">
        <h1>LLM Council</h1>
        <button
          className="new-conversation-btn"
          onClick={onNewConversation}
          aria-label="Create a new conversation"
        >
          + New Conversation
        </button>
      </div>

      <nav className="conversation-list" role="region" aria-label="Conversation history">
        {conversations.length === 0 ? (
          <div className="no-conversations" role="status" aria-live="polite">
            No conversations yet
          </div>
        ) : (
          <ul className="conversation-items" role="list">
            {conversations.map((conv) => (
              <li key={conv.id} role="listitem">
                <button
                  className={`conversation-item ${
                    conv.id === currentConversationId ? "active" : ""
                  }`}
                  onClick={() => onSelectConversation(conv.id)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      onSelectConversation(conv.id);
                    }
                  }}
                  aria-current={
                    conv.id === currentConversationId ? "page" : undefined
                  }
                  aria-label={`${conv.title || "New Conversation"}, ${conv.message_count} messages`}
                >
                  <div className="conversation-title">
                    {conv.title || "New Conversation"}
                  </div>
                  <div className="conversation-meta">
                    {conv.message_count} messages
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </nav>
    </aside>
  );
};

export default Sidebar;
