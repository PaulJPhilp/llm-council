import type { FC } from "react";
import type { Conversation } from "../types";
import CouncilComposer from "./CouncilComposer";
import CouncilThread from "./CouncilThread";
import "./ChatInterface.css";

type ChatInterfaceProps = {
  conversation?: Conversation;
  onSendMessage: (content: string) => void;
  isLoading: boolean;
};

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
        isDisabled={isLoading}
        onSendMessage={onSendMessage}
        showComposer={showComposer}
      />
    </div>
  );
};

export default ChatInterface;
