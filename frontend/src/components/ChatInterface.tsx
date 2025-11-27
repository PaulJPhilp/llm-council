import { FC } from "react";
import type { Conversation } from "../types";
import CouncilThread from "./CouncilThread";
import CouncilComposer from "./CouncilComposer";
import "./ChatInterface.css";

interface ChatInterfaceProps {
  conversation?: Conversation;
  onSendMessage: (content: string) => void;
  isLoading: boolean;
}

/**
 * Main chat interface component
 * Composes CouncilThread for message display and CouncilComposer for input
 * Follows assistant-ui component composition pattern
 */
const ChatInterface: FC<ChatInterfaceProps> = ({
  conversation,
  onSendMessage,
  isLoading,
}) => {
  // Show composer only on empty conversation
  const showComposer = !conversation || conversation.messages.length === 0;

  return (
    <div className="chat-interface">
      <CouncilThread conversation={conversation} isLoading={isLoading} />
      <CouncilComposer
        onSendMessage={onSendMessage}
        isDisabled={isLoading}
        showComposer={showComposer}
      />
    </div>
  );
};

export default ChatInterface;
