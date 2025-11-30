import { ReactNode } from "react";
import Sidebar from "./Sidebar";
import type { ConversationMetadata } from "../types";
import {
  SidebarProvider,
  SidebarInset,
  SidebarTrigger,
} from "./ui/sidebar";

interface LayoutProps {
  conversations: ConversationMetadata[];
  currentConversationId?: string;
  onSelectConversation: (conversationId: string) => void;
  onNewConversation: () => void;
  children?: ReactNode;
}

export function Layout({
  conversations,
  currentConversationId,
  onSelectConversation,
  onNewConversation,
  children,
}: LayoutProps) {
  return (
    <SidebarProvider>
      <Sidebar
        conversations={conversations}
        currentConversationId={currentConversationId}
        onSelectConversation={onSelectConversation}
        onNewConversation={onNewConversation}
      />
      <SidebarInset>
        <header className="flex h-12 shrink-0 items-center gap-2 border-b px-4">
          <SidebarTrigger className="-ml-1" />
        </header>
        <div className="flex flex-1 flex-col overflow-hidden">
          {children || (
            <div className="flex items-center justify-center h-full text-muted-foreground">
              <p>Select or create a conversation to begin</p>
            </div>
          )}
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
