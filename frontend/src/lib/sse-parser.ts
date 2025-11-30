/**
 * Utility for parsing Server-Sent Events (SSE) streams
 */

export interface SSEParserOptions {
	onEvent: (eventType: string, data: unknown) => void;
	onError?: (error: Error) => void;
}

/**
 * Parse SSE stream from a ReadableStream
 */
export async function parseSSEStream(
	reader: ReadableStreamDefaultReader<Uint8Array>,
	options: SSEParserOptions,
): Promise<void> {
	const decoder = new TextDecoder();

	try {
		while (true) {
			const { done, value } = await reader.read();
			if (done) {
				break;
			}

			const chunk = decoder.decode(value);
			const lines = chunk.split("\n");

			for (const line of lines) {
				if (line.startsWith("data: ")) {
					const data = line.slice(6);
					try {
						const event = JSON.parse(data) as { type: string; [key: string]: unknown };
						options.onEvent(event.type, event);
					} catch (e) {
						const error = e instanceof Error ? e : new Error("Failed to parse SSE event");
						if (options.onError) {
							options.onError(error);
						} else {
							console.error("Failed to parse SSE event:", error);
						}
					}
				}
			}
		}
	} finally {
		reader.cancel();
	}
}

