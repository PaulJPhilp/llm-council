import type { FC } from "react";
import type { ConversationMetadata } from "../types";
import {
  Sidebar as ShadcnSidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "./ui/sidebar";
import { Plus } from "lucide-react";
import { Button } from "./ui/button";
import { cn } from "@/lib/utils";

type SidebarProps = {
  conversations: ConversationMetadata[];
  currentConversationId?: string;
  onSelectConversation: (id: string) => void;
  onNewConversation: () => void;
};

const SidebarContentInner: FC<SidebarProps> = ({
  conversations,
  currentConversationId,
  onSelectConversation,
  onNewConversation,
}) => {
  const { state } = useSidebar();
  const isCollapsed = state === "collapsed";

  return (
    <>
      <SidebarHeader className="h-10 px-2 flex items-center justify-between gap-1 border-b">
        {!isCollapsed && (
          <h1 className="text-xs font-semibold truncate">LLM Council</h1>
        )}
        <Button
          size="icon"
          variant="ghost"
          className={cn(
            "h-7 w-7",
            !isCollapsed && "w-auto px-2",
          )}
          onClick={onNewConversation}
        >
          <Plus className="h-3.5 w-3.5" />
          {!isCollapsed && <span className="text-xs ml-1">New</span>}
        </Button>
      </SidebarHeader>

      <SidebarContent className="px-1 py-1">
        <SidebarGroup>
          {!isCollapsed && (
            <SidebarGroupLabel className="px-2 text-[10px] text-muted-foreground uppercase">
              Conversations
            </SidebarGroupLabel>
          )}
          <SidebarGroupContent>
            {conversations.length === 0 ? (
              <div className="px-2 py-3 text-[10px] text-center text-muted-foreground">
                {!isCollapsed && "No conversations"}
              </div>
            ) : (
              <SidebarMenu>
                {conversations.map((conv) => (
                  <SidebarMenuItem key={conv.id}>
                    <SidebarMenuButton
                      isActive={conv.id === currentConversationId}
                      onClick={() => onSelectConversation(conv.id)}
                      size="sm"
                      className="h-7 px-2 text-xs"
                      tooltip={conv.title || "New Conversation"}
                    >
                      <span className="truncate flex-1 text-left">
                        {conv.title || "New Conversation"}
                      </span>
                      {!isCollapsed && (
                        <span className="text-[10px] text-muted-foreground ml-1">
                          {conv.message_count}
                        </span>
                      )}
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            )}
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </>
  );
};

const Sidebar: FC<SidebarProps> = (props) => {
  return (
    <ShadcnSidebar collapsible="icon" className="border-r">
      <SidebarContentInner {...props} />
    </ShadcnSidebar>
  );
};

export default Sidebar;
