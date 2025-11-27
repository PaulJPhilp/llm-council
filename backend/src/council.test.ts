import { describe, expect, it } from "vitest";
import { calculateAggregateRankings, parseRankingFromText } from "./council";
import type { Stage2Response } from "./storage";

describe("Council Functions", () => {
  describe("parseRankingFromText", () => {
    it("should parse numbered list format", () => {
      const text = `Response A is good
Response B is better

FINAL RANKING:
1. Response B
2. Response A`;

      const result = parseRankingFromText(text);
      expect(result).toEqual(["Response B", "Response A"]);
    });

    it("should handle multiple responses", () => {
      const text = `FINAL RANKING:
1. Response C
2. Response A
3. Response B`;

      const result = parseRankingFromText(text);
      expect(result).toEqual(["Response C", "Response A", "Response B"]);
    });

    it("should fallback to extracting patterns if no FINAL RANKING section", () => {
      const text = `Response A: good
Response C: best
Response B: okay`;

      const result = parseRankingFromText(text);
      expect(result).toContain("Response A");
      expect(result).toContain("Response B");
      expect(result).toContain("Response C");
    });

    it("should return empty array for text without responses", () => {
      const text = "This text has no response patterns";
      const result = parseRankingFromText(text);
      expect(result).toEqual([]);
    });

    it("should handle whitespace variations", () => {
      const text = `FINAL RANKING:
1.   Response A
2.Response B
3. Response C`;

      const result = parseRankingFromText(text);
      expect(result.length).toBe(3);
      expect(result[0]).toEqual("Response A");
    });
  });

  describe("calculateAggregateRankings", () => {
    it("should calculate average rankings correctly", () => {
      const stage2Results: Stage2Response[] = [
        {
          model: "model1",
          ranking: "evaluation 1",
          parsed_ranking: ["Response A", "Response B", "Response C"],
        },
        {
          model: "model2",
          ranking: "evaluation 2",
          parsed_ranking: ["Response B", "Response A", "Response C"],
        },
      ];

      const labelToModel: Record<string, string> = {
        "Response A": "openai/gpt-4",
        "Response B": "anthropic/claude",
        "Response C": "google/gemini",
      };

      const result = calculateAggregateRankings(stage2Results, labelToModel);

      // Response A: positions [1, 2] -> average 1.5
      // Response B: positions [2, 1] -> average 1.5
      // Response C: positions [3, 3] -> average 3
      expect(result.length).toBe(3);
      expect(result[0].model).toEqual("openai/gpt-4");
      expect(result[0].average_rank).toBe(1.5);
      expect(result[0].rankings_count).toBe(2);
    });

    it("should sort by average rank ascending", () => {
      const stage2Results: Stage2Response[] = [
        {
          model: "model1",
          ranking: "eval1",
          parsed_ranking: ["Response C", "Response A", "Response B"],
        },
        {
          model: "model2",
          ranking: "eval2",
          parsed_ranking: ["Response A", "Response B", "Response C"],
        },
      ];

      const labelToModel: Record<string, string> = {
        "Response A": "model_a",
        "Response B": "model_b",
        "Response C": "model_c",
      };

      const result = calculateAggregateRankings(stage2Results, labelToModel);

      // Verify sorted by average rank
      for (let i = 0; i < result.length - 1; i++) {
        expect(result[i].average_rank).toBeLessThanOrEqual(
          result[i + 1].average_rank
        );
      }
    });

    it("should handle missing labels gracefully", () => {
      const stage2Results: Stage2Response[] = [
        {
          model: "model1",
          ranking: "eval1",
          parsed_ranking: ["Response A", "Response B"],
        },
      ];

      const labelToModel: Record<string, string> = {
        "Response A": "model_a",
        // Response B is missing
      };

      const result = calculateAggregateRankings(stage2Results, labelToModel);

      // Should only include Response A
      expect(result.length).toBe(1);
      expect(result[0].model).toEqual("model_a");
    });

    it("should handle empty rankings", () => {
      const stage2Results: Stage2Response[] = [];
      const labelToModel: Record<string, string> = {};

      const result = calculateAggregateRankings(stage2Results, labelToModel);

      expect(result).toEqual([]);
    });
  });
});
