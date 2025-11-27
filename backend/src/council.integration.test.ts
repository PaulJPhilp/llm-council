import { describe, expect, it, vi } from "vitest";
import {
  runFullCouncil,
  stage1CollectResponses,
  stage2CollectRankings,
  stage3SynthesizeFinal,
} from "./council";

vi.mock("./openrouter");

// biome-ignore lint/performance/noNamespaceImport: Required for vi.mock() to work
import * as openrouter from "./openrouter";

// Mock OpenRouter responses
const mockResponses = {
  stage1: {
    "openai/gpt-5.1": {
      content:
        "Machine learning is a branch of AI that enables learning from data.",
      reasoning_details: undefined,
    },
    "google/gemini-3-pro-preview": {
      content:
        "ML uses algorithms to find patterns in data without explicit programming.",
      reasoning_details: undefined,
    },
    "anthropic/claude-sonnet-4.5": {
      content: "Machine learning systems improve through experience with data.",
      reasoning_details: undefined,
    },
    "x-ai/grok-4": {
      content: "ML enables computers to learn and adapt from experience.",
      reasoning_details: undefined,
    },
  },
  stage2Ranking: {
    "openai/gpt-5.1": {
      content: `Response A is concise and accurate.
Response B is good but less technical.
Response C is comprehensive and practical.
Response D is brief but lacks depth.

FINAL RANKING:
1. Response C
2. Response A
3. Response B
4. Response D`,
      reasoning_details: undefined,
    },
    "google/gemini-3-pro-preview": {
      content: `Response A provides good definition.
Response B is clear and accessible.
Response C is comprehensive and well-explained.
Response D is too brief.

FINAL RANKING:
1. Response C
2. Response B
3. Response A
4. Response D`,
      reasoning_details: undefined,
    },
    "anthropic/claude-sonnet-4.5": {
      content: `Response A is technical and accurate.
Response B explains the practical aspect.
Response C provides holistic view.
Response D lacks sufficient detail.

FINAL RANKING:
1. Response C
2. Response A
3. Response B
4. Response D`,
      reasoning_details: undefined,
    },
    "x-ai/grok-4": {
      content: `Response A is basic but solid.
Response B is good explanation.
Response C is the most comprehensive.
Response D is insufficient.

FINAL RANKING:
1. Response C
2. Response B
3. Response A
4. Response D`,
      reasoning_details: undefined,
    },
  },
  stage3: {
    content: `Machine learning is a transformative field of artificial intelligence that enables computer systems to learn and improve from data without being explicitly programmed for each task.

Key aspects:
- It uses algorithms to identify patterns in data
- Systems improve through experience and exposure to more data
- Applications span from image recognition to natural language processing
- Requires both computational resources and quality data

The most effective ML systems combine domain expertise, proper data preparation, and appropriate algorithm selection for the specific problem at hand.`,
    reasoning_details: undefined,
  },
};

describe("Council Integration Tests", () => {
  describe("Stage 1: Collect Responses", () => {
    it("should collect responses from all models with mocked API", async () => {
      // Mock queryModelsParallel to return test data
      vi.spyOn(openrouter, "queryModelsParallel").mockResolvedValueOnce(
        mockResponses.stage1
      );

      const results = await stage1CollectResponses("What is machine learning?");

      expect(results).toHaveLength(4);
      expect(results).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            model: "openai/gpt-5.1",
            response: expect.stringContaining("Machine learning"),
          }),
          expect.objectContaining({
            model: "google/gemini-3-pro-preview",
            response: expect.stringContaining("algorithms"),
          }),
        ])
      );

      // Verify all models are represented
      const models = results.map((r) => r.model);
      expect(models).toContain("openai/gpt-5.1");
      expect(models).toContain("google/gemini-3-pro-preview");
      expect(models).toContain("anthropic/claude-sonnet-4.5");
      expect(models).toContain("x-ai/grok-4");

      vi.restoreAllMocks();
    });

    it("should handle failed responses gracefully", async () => {
      // Mock one model failing
      const partialResponses = {
        "openai/gpt-5.1": mockResponses.stage1["openai/gpt-5.1"],
        "google/gemini-3-pro-preview": null,
        "anthropic/claude-sonnet-4.5":
          mockResponses.stage1["anthropic/claude-sonnet-4.5"],
        "x-ai/grok-4": mockResponses.stage1["x-ai/grok-4"],
      };

      vi.spyOn(openrouter, "queryModelsParallel").mockResolvedValueOnce(
        partialResponses as any
      );

      const results = await stage1CollectResponses("Test query");

      // Should have 3 responses (one model failed)
      expect(results).toHaveLength(3);
      expect(results.map((r) => r.model)).not.toContain(
        "google/gemini-3-pro-preview"
      );

      vi.restoreAllMocks();
    });

    it("should return empty array if all models fail", async () => {
      const emptyResponses = {
        "openai/gpt-5.1": null,
        "google/gemini-3-pro-preview": null,
        "anthropic/claude-sonnet-4.5": null,
        "x-ai/grok-4": null,
      };

      vi.spyOn(openrouter, "queryModelsParallel").mockResolvedValueOnce(
        emptyResponses as any
      );

      const results = await stage1CollectResponses("Test query");

      expect(results).toHaveLength(0);

      vi.restoreAllMocks();
    });
  });

  describe("Stage 2: Collect Rankings", () => {
    it("should collect rankings from all models", async () => {
      const stage1Results = [
        {
          model: "openai/gpt-5.1",
          response: mockResponses.stage1["openai/gpt-5.1"].content,
        },
        {
          model: "google/gemini-3-pro-preview",
          response: mockResponses.stage1["google/gemini-3-pro-preview"].content,
        },
        {
          model: "anthropic/claude-sonnet-4.5",
          response: mockResponses.stage1["anthropic/claude-sonnet-4.5"].content,
        },
        {
          model: "x-ai/grok-4",
          response: mockResponses.stage1["x-ai/grok-4"].content,
        },
      ];

      vi.spyOn(openrouter, "queryModelsParallel").mockResolvedValueOnce(
        mockResponses.stage2Ranking as any
      );

      const [rankings, labelToModel] = await stage2CollectRankings(
        "What is machine learning?",
        stage1Results
      );

      expect(rankings).toHaveLength(4);
      expect(labelToModel).toBeDefined();
      expect(Object.keys(labelToModel)).toContain("Response A");
      expect(Object.keys(labelToModel)).toContain("Response B");
      expect(Object.keys(labelToModel)).toContain("Response C");
      expect(Object.keys(labelToModel)).toContain("Response D");

      // Verify parsed rankings
      for (const ranking of rankings) {
        expect(ranking.model).toBeDefined();
        expect(ranking.ranking).toBeDefined();
        expect(ranking.parsed_ranking).toBeInstanceOf(Array);
        expect(ranking.parsed_ranking.length).toBeGreaterThan(0);
      }

      vi.restoreAllMocks();
    });

    it("should create correct label_to_model mapping", async () => {
      const stage1Results = [
        { model: "model-a", response: "Response A content" },
        { model: "model-b", response: "Response B content" },
        { model: "model-c", response: "Response C content" },
      ];

      vi.spyOn(openrouter, "queryModelsParallel").mockResolvedValueOnce({
        "model-a": {
          content: `FINAL RANKING:
1. Response C
2. Response A
3. Response B`,
        },
      } as any);

      const [, labelToModel] = await stage2CollectRankings(
        "Test query",
        stage1Results
      );

      expect(labelToModel["Response A"]).toBe("model-a");
      expect(labelToModel["Response B"]).toBe("model-b");
      expect(labelToModel["Response C"]).toBe("model-c");

      vi.restoreAllMocks();
    });

    it("should parse rankings correctly", async () => {
      const stage1Results = [
        { model: "model-1", response: "Response 1" },
        { model: "model-2", response: "Response 2" },
      ];

      vi.spyOn(openrouter, "queryModelsParallel").mockResolvedValueOnce({
        "model-1": {
          content: `Analysis of responses...

FINAL RANKING:
1. Response B
2. Response A`,
        },
      } as any);

      const [rankings] = await stage2CollectRankings("Test", stage1Results);

      expect(rankings[0].parsed_ranking).toEqual(["Response B", "Response A"]);

      vi.restoreAllMocks();
    });
  });

  describe("Stage 3: Synthesize Final", () => {
    it("should synthesize final answer from chairman", async () => {
      const stage1Results = [
        { model: "model-a", response: "Response A" },
        { model: "model-b", response: "Response B" },
      ];

      const stage2Results = [
        {
          model: "model-a",
          ranking: "FINAL RANKING:\n1. Response B\n2. Response A",
          parsed_ranking: ["Response B", "Response A"],
        },
      ];

      vi.spyOn(openrouter, "queryModel").mockResolvedValueOnce(
        mockResponses.stage3 as any
      );

      const result = await stage3SynthesizeFinal(
        "Test query",
        stage1Results,
        stage2Results
      );

      expect(result.model).toBeDefined();
      expect(result.response).toContain("machine learning");
      expect(result.response.length).toBeGreaterThan(100);

      vi.restoreAllMocks();
    });

    it("should handle chairman failure gracefully", async () => {
      const stage1Results = [{ model: "model-a", response: "Response A" }];
      const stage2Results = [
        {
          model: "model-a",
          ranking: "Ranking",
          parsed_ranking: ["Response A"],
        },
      ];

      vi.spyOn(openrouter, "queryModel").mockResolvedValueOnce(null);

      const result = await stage3SynthesizeFinal(
        "Test query",
        stage1Results,
        stage2Results
      );

      expect(result.response).toContain("Error");

      vi.restoreAllMocks();
    });
  });

  describe("Full Council Flow", () => {
    it("should run complete 3-stage council process", async () => {
      // Mock all API calls
      vi.spyOn(openrouter, "queryModelsParallel")
        .mockResolvedValueOnce(mockResponses.stage1 as any) // Stage 1
        .mockResolvedValueOnce(mockResponses.stage2Ranking as any); // Stage 2

      vi.spyOn(openrouter, "queryModel").mockResolvedValueOnce(
        mockResponses.stage3 as any // Stage 3
      );

      const [stage1, stage2, stage3, metadata] = await runFullCouncil(
        "What is machine learning?"
      );

      // Verify Stage 1
      expect(stage1).toHaveLength(4);
      expect(stage1[0]).toHaveProperty("model");
      expect(stage1[0]).toHaveProperty("response");

      // Verify Stage 2
      expect(stage2).toHaveLength(4);
      expect(stage2[0]).toHaveProperty("model");
      expect(stage2[0]).toHaveProperty("ranking");
      expect(stage2[0]).toHaveProperty("parsed_ranking");

      // Verify Stage 3
      expect(stage3).toHaveProperty("model");
      expect(stage3).toHaveProperty("response");
      expect(stage3.response.length).toBeGreaterThan(50);

      // Verify Metadata
      expect(metadata).toHaveProperty("label_to_model");
      expect(metadata).toHaveProperty("aggregate_rankings");
      expect(Object.keys(metadata.label_to_model).length).toBe(4);
      expect(metadata.aggregate_rankings.length).toBeGreaterThan(0);

      // Verify aggregate rankings are sorted
      for (let i = 0; i < metadata.aggregate_rankings.length - 1; i++) {
        expect(metadata.aggregate_rankings[i].average_rank).toBeLessThanOrEqual(
          metadata.aggregate_rankings[i + 1].average_rank
        );
      }

      vi.restoreAllMocks();
    });

    it("should handle complete failure of all models", async () => {
      const emptyResponses = {
        "openai/gpt-5.1": null,
        "google/gemini-3-pro-preview": null,
        "anthropic/claude-sonnet-4.5": null,
        "x-ai/grok-4": null,
      };

      vi.spyOn(openrouter, "queryModelsParallel").mockResolvedValueOnce(
        emptyResponses as any
      );

      const [stage1, stage2, stage3] = await runFullCouncil("Test query");

      expect(stage1).toHaveLength(0);
      expect(stage2).toHaveLength(0);
      expect(stage3.response).toContain("Error");

      vi.restoreAllMocks();
    });

    it("should handle partial failures in stage 2", async () => {
      vi.spyOn(openrouter, "queryModelsParallel")
        .mockResolvedValueOnce(mockResponses.stage1 as any)
        .mockResolvedValueOnce({
          "openai/gpt-5.1": mockResponses.stage2Ranking["openai/gpt-5.1"],
          "google/gemini-3-pro-preview": null, // One model fails
          "anthropic/claude-sonnet-4.5":
            mockResponses.stage2Ranking["anthropic/claude-sonnet-4.5"],
          "x-ai/grok-4": mockResponses.stage2Ranking["x-ai/grok-4"],
        } as any);

      vi.spyOn(openrouter, "queryModel").mockResolvedValueOnce(
        mockResponses.stage3 as any
      );

      const [stage1, stage2, stage3, metadata] =
        await runFullCouncil("Test query");

      expect(stage1).toHaveLength(4);
      expect(stage2).toHaveLength(3); // One model failed
      expect(stage3.response.length).toBeGreaterThan(50);
      expect(metadata.aggregate_rankings.length).toBeGreaterThan(0);

      vi.restoreAllMocks();
    });
  });

  describe("Metadata Calculation", () => {
    it("should calculate aggregate rankings correctly", async () => {
      vi.spyOn(openrouter, "queryModelsParallel")
        .mockResolvedValueOnce(mockResponses.stage1 as any)
        .mockResolvedValueOnce(mockResponses.stage2Ranking as any);

      vi.spyOn(openrouter, "queryModel").mockResolvedValueOnce(
        mockResponses.stage3 as any
      );

      const [, , , metadata] = await runFullCouncil("Test query");

      // Verify aggregate rankings structure
      expect(metadata.aggregate_rankings).toBeInstanceOf(Array);
      for (const ranking of metadata.aggregate_rankings) {
        expect(ranking).toHaveProperty("model");
        expect(ranking).toHaveProperty("average_rank");
        expect(ranking).toHaveProperty("rankings_count");
        expect(typeof ranking.average_rank).toBe("number");
        expect(typeof ranking.rankings_count).toBe("number");
      }

      // All models should be ranked
      const rankedModels = metadata.aggregate_rankings.map((r) => r.model);
      expect(rankedModels).toContain("openai/gpt-5.1");
      expect(rankedModels).toContain("anthropic/claude-sonnet-4.5");

      vi.restoreAllMocks();
    });
  });
});
