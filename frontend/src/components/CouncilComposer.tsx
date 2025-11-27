import { FC, useState } from "react";
import "./ChatInterface.css";

interface CouncilComposerProps {
  onSendMessage: (content: string) => void;
  isDisabled?: boolean;
  showComposer?: boolean;
}

/**
 * Council-optimized input composer component
 * Handles message composition with Enter to send, Shift+Enter for new lines
 * Compatible with assistant-ui composer pattern
 */
const CouncilComposer: FC<CouncilComposerProps> = ({
  onSendMessage,
  isDisabled = false,
  showComposer = true,
}) => {
  const [input, setInput] = useState("");

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (input.trim() && !isDisabled) {
      onSendMessage(input);
      setInput("");
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Submit on Enter (without Shift)
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e as unknown as React.FormEvent<HTMLFormElement>);
    }
  };

  if (!showComposer) {
    return null;
  }

  return (
    <form className="input-form" onSubmit={handleSubmit}>
      <textarea
        className="message-input"
        placeholder="Ask your question... (Shift+Enter for new line, Enter to send)"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={handleKeyDown}
        disabled={isDisabled}
        rows={3}
      />
      <button
        type="submit"
        className="send-button"
        disabled={!input.trim() || isDisabled}
      >
        Send
      </button>
    </form>
  );
};

export default CouncilComposer;
