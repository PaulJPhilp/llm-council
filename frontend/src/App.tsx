import { useEffect, useState, type FC } from "react";
import { api } from "./api";
import { ChatArea } from "./components/ChatArea";
import { Layout } from "./components/Layout";
import { Toaster } from "./components/Toaster";
import { WorkflowSelector } from "./components/WorkflowSelector";
import { useConversation } from "./hooks/useConversation";
import { useConversations } from "./hooks/useConversations";
import { useMessageStreaming } from "./hooks/useMessageStreaming";
import { toast } from "./lib/toast";
import type { Conversation } from "./types";

const App: FC = () => {
	const [currentConversationId, setCurrentConversationId] = useState<
		string | null
	>(null);
	const [selectedWorkflowId, setSelectedWorkflowId] = useState<string>("");
	const {
		conversations,
		loadConversations,
		addConversation,
		updateConversationTitle,
	} = useConversations();
	const {
		conversation: currentConversation,
		setConversation,
		loadConversation,
	} = useConversation(currentConversationId);
	const { sendMessage, isLoading } = useMessageStreaming();

	const handleNewConversation = async () => {
		try {
			const newConv = await api.createConversation();
			addConversation({
				id: newConv.id,
				created_at: newConv.created_at,
				title: newConv.title,
				message_count: 0,
			});
			setCurrentConversationId(newConv.id);
			setConversation(newConv);
		} catch (error) {
			const message =
				error instanceof Error
					? error.message
					: "Failed to create conversation";
			toast.error(message);
		}
	};

	const handleSelectConversation = (id: string) => {
		setCurrentConversationId(id);
	};

	const handleSelectWorkflow = (workflowId: string) => {
		setSelectedWorkflowId(workflowId);
		// Persist workflow selection to localStorage
		localStorage.setItem("selected_workflow_id", workflowId);
	};

	// Load persisted workflow selection on mount
	useEffect(() => {
		const persisted = localStorage.getItem("selected_workflow_id");
		if (persisted) {
			setSelectedWorkflowId(persisted);
		}
	}, []);

	const handleSendMessage = async (content: string) => {
		if (!currentConversationId) {
			toast.error("Please select or create a conversation first");
			return;
		}
		if (!selectedWorkflowId) {
			toast.error("Please select a workflow first");
			return;
		}
		if (!currentConversation) {
			toast.info("Loading conversation...");
			try {
				await loadConversation(currentConversationId);
			} catch (error) {
				const message =
					error instanceof Error
						? error.message
						: "Failed to load conversation";
				toast.error(message);
				return;
			}
		}

		try {
			await sendMessage(
				currentConversationId,
				content,
				currentConversation,
				setConversation,
				{
					workflowId: selectedWorkflowId,
					onComplete: () => {
						loadConversations();
					},
					onTitleUpdate: (title) => {
						if (currentConversationId) {
							updateConversationTitle(currentConversationId, title);
						}
						loadConversations();
					},
					onError: (error) => {
						toast.error(error.message || "Failed to send message");
					},
				},
			);
		} catch (error) {
			const message =
				error instanceof Error ? error.message : "Failed to send message";
			toast.error(message);
		}
	};

	return (
		<>
			<Layout
				conversations={conversations}
				currentConversationId={currentConversationId || undefined}
				onNewConversation={handleNewConversation}
				onSelectConversation={handleSelectConversation}
			>
				<div className="flex flex-col h-full">
					{/* Workflow Selector */}
					<div className="border-b border-border bg-background">
						<WorkflowSelector
							onSelectWorkflow={handleSelectWorkflow}
							isLoading={isLoading}
						/>
					</div>
					{/* Chat Area */}
					<ChatArea
						conversation={currentConversation as Conversation | undefined}
						isLoading={isLoading}
						onSendMessage={handleSendMessage}
					/>
				</div>
			</Layout>
			<Toaster />
		</>
	);
};

export default App;
