import { ReactNode } from "react"
import Sidebar from "./Sidebar"
import type { ConversationMetadata } from "../types"

interface LayoutProps {
  conversations: ConversationMetadata[]
  currentConversationId?: string
  onSelectConversation: (conversationId: string) => void
  onNewConversation: () => void
  children?: ReactNode
}

export function Layout({
  conversations,
  currentConversationId,
  onSelectConversation,
  onNewConversation,
  children,
}: LayoutProps) {
  return (
    <div className="flex h-screen w-screen bg-gray-50">
      {/* Left Sidebar - Conversation List */}
      <aside className="w-64 border-r border-gray-200 bg-white flex flex-col overflow-hidden">
        <Sidebar
          conversations={conversations}
          currentConversationId={currentConversationId}
          onSelectConversation={onSelectConversation}
          onNewConversation={onNewConversation}
        />
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col overflow-hidden">
        {/* Main Content - Chat Area */}
        <div className="flex-1 overflow-hidden bg-white">
          {children || (
            <div className="flex items-center justify-center h-full text-gray-500">
              <p>Select or create a conversation to begin</p>
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
