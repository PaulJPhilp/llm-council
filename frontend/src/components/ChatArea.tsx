import { useEffect, useRef, useState } from "react";
import type { AssistantMessage, Conversation, Message } from "../types";
import { isAssistantMessage } from "../types";
import { WorkflowMessageRenderer } from "./WorkflowMessageRenderer";
import { Button } from "./ui/button";
import { Card } from "./ui/card";
import { Skeleton } from "./ui/skeleton";
import { Textarea } from "./ui/textarea";

interface ChatAreaProps {
	conversation?: Conversation;
	isLoading?: boolean;
	onSendMessage: (content: string) => void;
}

export function ChatArea({
	conversation,
	isLoading = false,
	onSendMessage,
}: ChatAreaProps) {
	const [input, setInput] = useState("");
	const textareaRef = useRef<HTMLTextAreaElement>(null);

	function handleSend() {
		if (input.trim()) {
			onSendMessage(input.trim());
			setInput("");
			// Refocus textarea after sending
			setTimeout(() => {
				textareaRef.current?.focus();
			}, 0);
		}
	}

	function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
		if (e.key === "Enter" && !e.shiftKey) {
			e.preventDefault();
			handleSend();
		} else if (e.key === "Escape") {
			setInput("");
			textareaRef.current?.blur();
		}
	}

	// Auto-focus textarea when conversation changes
	useEffect(() => {
		if (conversation && !isLoading) {
			textareaRef.current?.focus();
		}
	}, [conversation, isLoading]);

	// Render assistant message - all messages use WorkflowMessageRenderer
	function renderAssistantMessage(
		message: Message & {
			loading?: {
				stage1: boolean;
				stage2: boolean;
				stage3: boolean;
			};
		},
		isLoading: boolean,
	) {
		if (!isAssistantMessage(message)) {
			return null;
		}

		return (
			<WorkflowMessageRenderer
				message={message as AssistantMessage}
				isLoading={isLoading || message.loading?.stage3 || false}
			/>
		);
	}

	if (!conversation) {
		return (
			<div className="flex items-center justify-center h-full text-muted-foreground">
				<p>Select or create a conversation to begin</p>
			</div>
		);
	}

	return (
		<div className="flex flex-col h-full">
			{/* Messages Area */}
			<section
				className="flex-1 overflow-y-auto p-6 space-y-4 bg-muted/30"
				aria-label="Conversation messages"
				aria-live="polite"
				aria-atomic="false"
			>
				{conversation.messages.length === 0 ? (
					<div className="flex items-center justify-center h-full text-muted-foreground">
						<p>Start a conversation by sending a message</p>
					</div>
				) : (
					<ul className="space-y-4 list-none">
						{conversation.messages.map((message, index) => {
							// Use message ID if available, otherwise generate stable key
							const messageKey =
								message.id ||
								`msg-${message.role}-${message.role === "user" ? message.content?.substring(0, 20) : "assistant"}-${index}`;

							return (
								<li
									key={messageKey}
									className={`flex ${
										message.role === "user" ? "justify-end" : "justify-start"
									}`}
								>
									{message.role === "user" ? (
										<Card className="max-w-xs lg:max-w-md xl:max-w-lg p-4 bg-primary text-primary-foreground border-primary">
											<p className="text-sm">{message.content}</p>
										</Card>
									) : (
										<Card className="w-full p-4">
											<div className="text-sm w-full max-w-none">
												{renderAssistantMessage(
													message as Message & {
														loading?: {
															stage1: boolean;
															stage2: boolean;
															stage3: boolean;
														};
													},
													isLoading &&
														index === conversation.messages.length - 1,
												)}
											</div>
										</Card>
									)}
								</li>
							);
						})}
					</ul>
				)}
				{isLoading && (
					<div className="flex justify-start">
						<Card className="p-4">
							<div className="flex space-x-2">
								<Skeleton className="h-2 w-2 rounded-full" />
								<Skeleton className="h-2 w-2 rounded-full" />
								<Skeleton className="h-2 w-2 rounded-full" />
							</div>
						</Card>
					</div>
				)}
			</section>

			{/* Input Area */}
			<div className="border-t border-border bg-background p-4">
				<div className="flex gap-2">
					<Textarea
						ref={textareaRef}
						value={input}
						onChange={(e) => setInput(e.target.value)}
						onKeyDown={handleKeyDown}
						placeholder="Type your message... (Shift+Enter for newline)"
						className="flex-1 resize-none"
						rows={3}
						disabled={isLoading}
						aria-label="Message input"
						aria-describedby="message-input-help"
					/>
					<span id="message-input-help" className="sr-only">
						Press Enter to send, Shift+Enter for newline
					</span>
					<Button
						type="button"
						onClick={handleSend}
						disabled={isLoading || !input.trim()}
						aria-label="Send message"
					>
						Send
					</Button>
				</div>
			</div>
		</div>
	);
}
