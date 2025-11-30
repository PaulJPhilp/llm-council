import { useOptimistic } from "react";
import type { Message } from "../types";

/**
 * Hook for optimistic message updates using React 19's useOptimistic
 */
export function useOptimisticMessages(initialMessages: Message[]) {
	const [optimisticMessages, addOptimisticMessage] = useOptimistic(
		initialMessages,
		(state: Message[], newMessage: Message) => {
			// Add ID if not present for stable keys
			const messageWithId: Message = {
				...newMessage,
				id: newMessage.id || `msg-${Date.now()}-${Math.random().toString(36).substring(7)}`,
			};
			return [...state, messageWithId];
		},
	);

	const updateLastMessage = (updater: (msg: Message) => Message) => {
		// Note: useOptimistic doesn't support updating, so we need to work with the actual state
		// This is a limitation - we'll still use setState for updates
		return optimisticMessages;
	};

	return {
		messages: optimisticMessages,
		addOptimisticMessage,
		updateLastMessage,
	};
}

