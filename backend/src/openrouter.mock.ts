/**
 * Mock OpenRouter Client
 * Returns realistic fake responses for UI testing
 * Activated with: MOCK_MODE=true
 */

import type { ChatMessage } from "./openrouter";

const mockResponses = {
  "claude-3-5-sonnet-20241022": `Machine learning is a subset of artificial intelligence that enables systems to learn and improve from experience without being explicitly programmed.

Key aspects include:
- **Supervised Learning**: Models learn from labeled data (e.g., email spam detection)
- **Unsupervised Learning**: Models find patterns in unlabeled data (e.g., customer clustering)
- **Reinforcement Learning**: Models learn through trial and error with rewards

Real-world applications span from recommendation systems (Netflix, Spotify) to natural language processing (ChatGPT) to computer vision (autonomous vehicles).`,

  "gpt-4o": `Machine learning represents one of the most transformative technologies of the 21st century, fundamentally changing how we approach problem-solving.

At its core, ML systems:
1. Ingest vast amounts of data
2. Identify patterns and relationships
3. Make predictions or decisions based on those patterns

The field has evolved from simple statistical models to deep neural networks with billions of parameters. Modern applications include generative AI, medical diagnosis, autonomous systems, and drug discovery.`,

  "gpt-4-turbo": `Machine learning is the science of getting computers to learn without explicit programming, pioneered by Arthur Samuel in 1959.

Three fundamental paradigms:
- **Supervised**: Learns from input-output pairs
- **Unsupervised**: Discovers hidden structure
- **Semi-supervised**: Combines labeled and unlabeled data

Modern ML powers recommendation engines, natural language understanding, computer vision, and predictive analytics across industries.`,

  "gemini-2.5-flash": `Machine learning enables computers to improve performance on tasks through experience rather than explicit instructions.

Core components:
- **Data**: The fuel that powers learning
- **Algorithms**: Mathematical techniques for pattern recognition
- **Models**: The learned representations that make predictions

From simple linear regression to transformer-based language models, ML has become essential infrastructure for modern AI systems, powering everything from search engines to healthcare diagnostics.`,
};

const mockEvaluations = {
  "claude-3-5-sonnet-20241022": `Response A provides a clear, well-structured definition of machine learning with excellent categorization of learning types. The examples are practical and relevant.

Response B offers a more philosophical perspective with emphasis on the transformative nature of ML, but could be more specific about practical implementation.

Response C delivers a historical context and clearly delineates the three paradigms, though the explanation could be deeper.

Response D is comprehensive and covers modern applications well, providing good context for why ML matters today.

FINAL RANKING:
1. Response A
2. Response D
3. Response B
4. Response C`,

  "gpt-4o": `Evaluating these responses on clarity, accuracy, and practical utility:

Response A excels in organization and provides clear distinctions between learning types with concrete examples.

Response B emphasizes historical significance and scale but could provide more actionable understanding.

Response C is concise and historically grounded, offering good framework but lacking depth.

Response D balances theory with modern applications effectively.

FINAL RANKING:
1. Response D
2. Response A
3. Response C
4. Response B`,

  "gpt-4-turbo": `Analyzing for technical accuracy and pedagogical value:

Response A: Clear taxonomy with practical examples - excellent for beginners
Response B: Good on transformation narrative but abstract
Response C: Strong historical perspective and framework
Response D: Strong on modern relevance and breadth

FINAL RANKING:
1. Response A
2. Response D
3. Response C
4. Response B`,

  "gemini-2.5-flash": `Assessment of response quality across dimensions:

Response A: Clear, organized, accessible - strong pedagogical approach
Response B: Emphasizes importance but less concrete
Response C: Provides foundation through history, good framework
Response D: Modern perspective, comprehensive coverage

FINAL RANKING:
1. Response A
2. Response D
3. Response C
4. Response B`,
};

/**
 * Create a mock OpenRouter client for UI testing
 */
export function createMockOpenRouterClient(): {
  queryModel: (model: string, messages: ChatMessage[]) => Promise<{ content: string; reasoning_details?: unknown }>;
  queryModelsParallel: (models: string[], messages: ChatMessage[]) => Promise<Record<string, { content: string; reasoning_details?: unknown } | null>>;
} {
  const queryModel = async (model: string, messages: ChatMessage[]) => {
      // Simulate network delay
      await new Promise((resolve) => setTimeout(resolve, Math.random() * 1000 + 500));

      const lastMessage = messages[messages.length - 1]?.content || "";

      // Return mock evaluation if it looks like a ranking prompt
      if (
        lastMessage.toLowerCase().includes("final ranking") ||
        lastMessage.toLowerCase().includes("evaluate")
      ) {
        const evals = mockEvaluations as Record<string, string>;
        return {
          content:
            evals[model] ||
            evals["claude-3-5-sonnet-20241022"] ||
            "Mock evaluation response",
          reasoning_details: { evaluation_depth: "comprehensive" },
        };
      }

      // Return mock response for main queries
      const responses = mockResponses as Record<string, string>;
      return {
        content:
          responses[model] ||
          responses["claude-3-5-sonnet-20241022"] ||
          "Mock response for: " + lastMessage.substring(0, 50),
        reasoning_details: { generation_time: Math.random() * 2000 },
      };
    };

  const queryModelsParallel = async (
    models: string[],
    messages: ChatMessage[]
  ) => {
    // Simulate parallel queries with slight variations in timing
    const results: Record<string, { content: string; reasoning_details?: unknown } | null> = {};

    for (const model of models) {
      await new Promise((resolve) => setTimeout(resolve, Math.random() * 500));
      const response = await queryModel(model, messages);
      results[model] = response;
    }

    return results;
  };

  return {
    queryModel,
    queryModelsParallel,
  };
}
