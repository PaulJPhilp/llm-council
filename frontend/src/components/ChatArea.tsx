import { useState } from "react"
import type { Conversation } from "../types"

interface ChatAreaProps {
  conversation?: Conversation
  isLoading?: boolean
  onSendMessage: (content: string) => void
}

export function ChatArea({
  conversation,
  isLoading = false,
  onSendMessage,
}: ChatAreaProps) {
  const [input, setInput] = useState("")

  const handleSend = () => {
    if (input.trim()) {
      onSendMessage(input.trim())
      setInput("")
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  if (!conversation) {
    return (
      <div className="flex items-center justify-center h-full text-gray-500">
        <p>Select or create a conversation to begin</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto p-6 space-y-4 bg-gray-50">
        {conversation.messages.length === 0 ? (
          <div className="flex items-center justify-center h-full text-gray-500">
            <p>Start a conversation by sending a message</p>
          </div>
        ) : (
          conversation.messages.map((message, index) => (
            <div
              key={index}
              className={`flex ${
                message.role === "user" ? "justify-end" : "justify-start"
              }`}
            >
              <div
                className={`max-w-xs lg:max-w-md xl:max-w-lg p-4 rounded-lg ${
                  message.role === "user"
                    ? "bg-blue-500 text-white"
                    : "bg-white text-gray-900 border border-gray-200"
                }`}
              >
                {message.role === "user" ? (
                  <p className="text-sm">{message.content}</p>
                ) : (
                  <div className="text-sm">
                    {/* TODO: Render workflow visualization for v3 messages, simple response for v1 */}
                    <p>Assistant response</p>
                  </div>
                )}
              </div>
            </div>
          ))
        )}
        {isLoading && (
          <div className="flex justify-start">
            <div className="bg-white text-gray-900 border border-gray-200 p-4 rounded-lg">
              <div className="flex space-x-2">
                <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"></div>
                <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce delay-100"></div>
                <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce delay-200"></div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Input Area */}
      <div className="border-t border-gray-200 bg-white p-4">
        <div className="flex gap-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type your message... (Shift+Enter for newline)"
            className="flex-1 p-3 border border-gray-200 rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
            rows={3}
            disabled={isLoading}
          />
          <button
            onClick={handleSend}
            disabled={isLoading || !input.trim()}
            className="px-6 py-3 bg-blue-500 text-white rounded-lg font-medium disabled:bg-gray-400 disabled:cursor-not-allowed hover:bg-blue-600"
          >
            Send
          </button>
        </div>
      </div>
    </div>
  )
}
