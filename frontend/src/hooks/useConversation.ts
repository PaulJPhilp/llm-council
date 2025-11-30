import { useCallback, useEffect, useState } from "react";
import { api } from "../api";
import type { Conversation } from "../types";

export function useConversation(conversationId: string | null) {
	const [conversation, setConversation] = useState<Conversation | null>(null);
	const [isLoading, setIsLoading] = useState(false);
	const [error, setError] = useState<Error | null>(null);

	const loadConversation = useCallback(
		async (id: string) => {
			setIsLoading(true);
			setError(null);
			try {
				const conv = await api.getConversation(id);
				setConversation(conv);
			} catch (err) {
				const error = err instanceof Error ? err : new Error("Failed to load conversation");
				setError(error);
				throw error;
			} finally {
				setIsLoading(false);
			}
		},
		[],
	);

	useEffect(() => {
		if (conversationId) {
			loadConversation(conversationId);
		} else {
			setConversation(null);
		}
	}, [conversationId, loadConversation]);

	return {
		conversation,
		isLoading,
		error,
		loadConversation,
		setConversation,
	};
}

