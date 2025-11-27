import type { FC } from "react";
import type { ConversationMetadata } from "../types";
import "./Sidebar.css";

type SidebarProps = {
  conversations: ConversationMetadata[];
  currentConversationId?: string;
  onSelectConversation: (id: string) => void;
  onNewConversation: () => void;
};

const Sidebar: FC<SidebarProps> = ({
  conversations,
  currentConversationId,
  onSelectConversation,
  onNewConversation,
}) => (
  <aside aria-label="Conversations" className="sidebar" role="navigation">
    <div className="sidebar-header">
      <h1>LLM Council</h1>
      <button
        aria-label="Create a new conversation"
        className="new-conversation-btn"
        onClick={onNewConversation}
      >
        + New Conversation
      </button>
    </div>

    <nav
      aria-label="Conversation history"
      className="conversation-list"
      role="region"
    >
      {conversations.length === 0 ? (
        <div aria-live="polite" className="no-conversations" role="status">
          No conversations yet
        </div>
      ) : (
        <ul className="conversation-items">
          {conversations.map((conv) => (
            <li key={conv.id}>
              <button
                aria-current={
                  conv.id === currentConversationId ? "page" : undefined
                }
                aria-label={`${conv.title || "New Conversation"}, ${conv.message_count} messages`}
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

export default Sidebar;
