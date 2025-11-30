import { useCallback, useEffect, useState } from "react";
import { api } from "../api";
import type { Conversation, ConversationMetadata } from "../types";

export function useConversations() {
	const [conversations, setConversations] = useState<ConversationMetadata[]>([]);
	const [isLoading, setIsLoading] = useState(false);
	const [error, setError] = useState<Error | null>(null);

	const loadConversations = useCallback(async () => {
		setIsLoading(true);
		setError(null);
		try {
			const convs = await api.listConversations();
			setConversations(convs);
		} catch (err) {
			const error = err instanceof Error ? err : new Error("Failed to load conversations");
			setError(error);
			throw error;
		} finally {
			setIsLoading(false);
		}
	}, []);

	useEffect(() => {
		loadConversations();
	}, [loadConversations]);

	const addConversation = useCallback((conversation: ConversationMetadata) => {
		setConversations((prev) => [conversation, ...prev]);
	}, []);

	const updateConversationTitle = useCallback((id: string, title: string) => {
		setConversations((prev) =>
			prev.map((conv) => (conv.id === id ? { ...conv, title } : conv)),
		);
	}, []);

	return {
		conversations,
		isLoading,
		error,
		loadConversations,
		addConversation,
		updateConversationTitle,
	};
}

