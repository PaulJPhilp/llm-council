import { describe, it, expect, beforeEach, vi } from "vitest"
import { Effect } from "effect"
import {
  ParallelQueryStage,
  PeerRankingStage,
  SynthesisStage,
  parseRankingFromText,
  calculateAggregateRankings,
  type ParallelQueryOutput,
  type PeerRankingOutput
} from "./index"
import { createLiquidTemplateEngine } from "../core/template-engine"
import { WorkflowContextBuilder } from "../core/context"
import type { StageResult } from "../core/stage"
import type { OpenRouterClient } from "../../openrouter"
import type { TemplateEngine } from "../core/template"
import type { WorkflowServices } from "../core/context"
import { TestLayer } from "../../runtime.test"

// Helper to create dependency maps for test execution
const createEmptyDependencies = (): ReadonlyMap<string, StageResult> => new Map()

const createPeerRankingDependencies = (
  parallelQueryOutput: ParallelQueryOutput
): ReadonlyMap<string, StageResult> => {
  const result: StageResult = {
    data: parallelQueryOutput
  }
  return new Map([["parallel-query", result]])
}

const createSynthesisDependencies = (
  parallelQueryOutput: ParallelQueryOutput,
  peerRankingOutput: PeerRankingOutput
): ReadonlyMap<string, StageResult> => {
  const parallelResult: StageResult = {
    data: parallelQueryOutput
  }
  const rankingResult: StageResult = {
    data: peerRankingOutput
  }
  return new Map([
    ["parallel-query", parallelResult],
    ["peer-ranking", rankingResult]
  ])
}

// Mock OpenRouter client
const createMockOpenRouter = (responses: Record<string, { content: string; reasoning_details?: unknown } | null>) => ({
  queryModel: vi.fn((model: string) =>
    Effect.promise(async () => responses[model] || { content: "", reasoning_details: null })
  ),
  queryModelsParallel: vi.fn((models: string[]) =>
    Effect.promise(async () => {
      const result: Record<string, { content: string; reasoning_details?: unknown } | null> = {}
      for (const model of models) {
        result[model] = responses[model] || null
      }
      return result
    })
  )
})

// Helper to create test context
const createTestContext = (
  openRouter: OpenRouterClient,
  templates: TemplateEngine,
  userQuery = "What is AI?"
) => {
  const services: WorkflowServices = {
    openRouter,
    templates,
    storage: {} as any,
    config: {} as any
  }

  return new WorkflowContextBuilder(userQuery, services).build()
}

describe("ParallelQueryStage", () => {
  let stage: ParallelQueryStage
  let templateEngine: TemplateEngine
  let mockOpenRouter: ReturnType<typeof createMockOpenRouter>

  beforeEach(() => {
    templateEngine = createLiquidTemplateEngine()
    stage = new ParallelQueryStage({
      models: ["model-a", "model-b"],
      systemPrompt: "You are a helpful assistant."
    })
  })

  it("should query multiple models in parallel", async () => {
    mockOpenRouter = createMockOpenRouter({
      "model-a": { content: "Response A" },
      "model-b": { content: "Response B" }
    })

    const ctx = createTestContext(
      mockOpenRouter as unknown as OpenRouterClient,
      templateEngine
    )

    const result = await Effect.runPromise(
      stage.execute(ctx, createEmptyDependencies()).pipe(Effect.provide(TestLayer))
    )

    expect(result.data.queries).toHaveLength(2)
    expect(result.data.successCount).toBe(2)
    expect(result.data.failureCount).toBe(0)
    expect(result.data.queries[0].response).toBe("Response A")
    expect(result.data.queries[1].response).toBe("Response B")
  })

  it("should handle partial failures gracefully", async () => {
    mockOpenRouter = createMockOpenRouter({
      "model-a": { content: "Response A" },
      "model-b": null
    })

    const ctx = createTestContext(
      mockOpenRouter as unknown as OpenRouterClient,
      templateEngine
    )

    const result = await Effect.runPromise(
      stage.execute(ctx, createEmptyDependencies()).pipe(Effect.provide(TestLayer))
    )

    expect(result.data.queries).toHaveLength(2)
    expect(result.data.successCount).toBe(1)
    expect(result.data.failureCount).toBe(1)
    expect(result.data.queries[0].response).toBe("Response A")
    expect(result.data.queries[1].response).toBeNull()
  })

  it("should fail when all models fail", async () => {
    mockOpenRouter = createMockOpenRouter({
      "model-a": null,
      "model-b": null
    })

    const ctx = createTestContext(
      mockOpenRouter as unknown as OpenRouterClient,
      templateEngine
    )

    const result = await Effect.runPromise(
      Effect.flip(stage.execute(ctx, createEmptyDependencies())).pipe(Effect.provide(TestLayer))
    )

    expect(result._tag).toBe("StageExecutionError")
  })

  it("should support custom user prompt templates", async () => {
    const stageWithTemplate = new ParallelQueryStage({
      models: ["model-a"],
      userPromptTemplate: "Answer this carefully: {{ userQuery }}"
    })

    mockOpenRouter = createMockOpenRouter({
      "model-a": { content: "Response" }
    })

    const ctx = createTestContext(
      mockOpenRouter as unknown as OpenRouterClient,
      templateEngine
    )

    const result = await Effect.runPromise(stageWithTemplate.execute(ctx, createEmptyDependencies(.pipe(Effect.provide(TestLayer))))

    expect(result.data).toBeDefined()
  })

  it("should include reasoning details when available", async () => {
    mockOpenRouter = createMockOpenRouter({
      "model-a": { content: "Response A", reasoning_details: { steps: 5 } }
    })

    const ctx = createTestContext(
      mockOpenRouter as unknown as OpenRouterClient,
      templateEngine
    )

    const result = await Effect.runPromise(
      stage.execute(ctx, createEmptyDependencies()).pipe(Effect.provide(TestLayer))
    )

    expect(result.data.queries[0].reasoning).toEqual({ steps: 5 })
  })
})

describe("PeerRankingStage", () => {
  let stage: PeerRankingStage
  let templateEngine: TemplateEngine
  let mockOpenRouter: ReturnType<typeof createMockOpenRouter>
  let parallelQueryOutput: ParallelQueryOutput

  beforeEach(() => {
    templateEngine = createLiquidTemplateEngine()
    stage = new PeerRankingStage({
      models: ["evaluator-a", "evaluator-b"]
    })

    parallelQueryOutput = {
      queries: [
        { model: "model-a", response: "Response A content" },
        { model: "model-b", response: "Response B content" }
      ],
      successCount: 2,
      failureCount: 0
    }
  })

  it("should parse ranking from evaluation text", () => {
    const evaluationText = `Response A provides good detail but misses Y...
Response B is accurate but lacks depth...

FINAL RANKING:
1. Response B
2. Response A`

    const ranking = parseRankingFromText(evaluationText)
    expect(ranking).toEqual(["Response B", "Response A"])
  })

  it("should handle ranking text with extra whitespace", () => {
    const evaluationText = `Some evaluation here.

FINAL RANKING:
1.  Response A
2.  Response C
3.  Response B

Some trailing text`

    const ranking = parseRankingFromText(evaluationText)
    expect(ranking).toEqual(["Response A", "Response C", "Response B"])
  })

  it("should return empty array if no ranking section found", () => {
    const evaluationText = `This is just an evaluation without proper format.`
    const ranking = parseRankingFromText(evaluationText)
    expect(ranking).toEqual([])
  })

  it("should collect rankings from multiple models", async () => {
    mockOpenRouter = createMockOpenRouter({
      "evaluator-a": {
        content: `Evaluation A
FINAL RANKING:
1. Response B
2. Response A`
      },
      "evaluator-b": {
        content: `Evaluation B
FINAL RANKING:
1. Response A
2. Response B`
      }
    })

    const ctx = createTestContext(
      mockOpenRouter as unknown as OpenRouterClient,
      templateEngine,
      "What is AI?"
    )

    const result = await Effect.runPromise(
      stage.execute(ctx, createPeerRankingDependencies(parallelQueryOutput)).pipe(Effect.provide(TestLayer))
    )

    expect(result.data.rankings).toHaveLength(2)
    expect(result.data.rankings[0].model).toBe("evaluator-a")
    expect(result.data.rankings[0].parsedRanking).toEqual(["Response B", "Response A"])
    expect(result.data.rankings[1].model).toBe("evaluator-b")
    expect(result.data.rankings[1].parsedRanking).toEqual(["Response A", "Response B"])
  })

  it("should anonymize responses with letters", async () => {
    mockOpenRouter = createMockOpenRouter({
      "evaluator-a": {
        content: `FINAL RANKING:
1. Response A
2. Response B`
      }
    })

    const ctx = createTestContext(
      mockOpenRouter as unknown as OpenRouterClient,
      templateEngine,
      "What is AI?"
    )

    const result = await Effect.runPromise(
      stage.execute(ctx, createPeerRankingDependencies(parallelQueryOutput)).pipe(Effect.provide(TestLayer))
    )

    expect(result.data.labelToModel["Response A"]).toBe("model-a")
    expect(result.data.labelToModel["Response B"]).toBe("model-b")
  })

  it("should calculate aggregate rankings correctly", () => {
    const rankings = [
      {
        model: "evaluator-a",
        rawEvaluation: "eval",
        parsedRanking: ["Response B", "Response A"] as readonly string[]
      },
      {
        model: "evaluator-b",
        rawEvaluation: "eval",
        parsedRanking: ["Response A", "Response B"] as readonly string[]
      }
    ]

    const labelToModel = {
      "Response A": "model-a",
      "Response B": "model-b"
    }

    const aggregates = calculateAggregateRankings(rankings, labelToModel)

    expect(aggregates).toHaveLength(2)
    // Response B has ranks [1, 2], average = 1.5
    // Response A has ranks [2, 1], average = 1.5
    const modelBAggregate = aggregates.find((a) => a.model === "model-b")
    const modelAAggregate = aggregates.find((a) => a.model === "model-a")

    expect(modelBAggregate?.averageRank).toBe(1.5)
    expect(modelAAggregate?.averageRank).toBe(1.5)
  })

  it("should handle partial ranking failures", async () => {
    mockOpenRouter = createMockOpenRouter({
      "evaluator-a": {
        content: `FINAL RANKING:
1. Response B
2. Response A`
      },
      "evaluator-b": null
    })

    const ctx = createTestContext(
      mockOpenRouter as unknown as OpenRouterClient,
      templateEngine,
      "What is AI?"
    )

    let executed = false
    try {
      const result = await Effect.runPromise(
      stage.execute(ctx, createPeerRankingDependencies(parallelQueryOutput)).pipe(Effect.provide(TestLayer))
    )
      executed = !!result && result.data !== null
    } catch {
      // Should not throw
    }

    expect(executed).toBe(true)
  })

  it("should fail when no evaluators provide rankings", async () => {
    mockOpenRouter = createMockOpenRouter({
      "evaluator-a": null,
      "evaluator-b": null
    })

    const ctx = createTestContext(
      mockOpenRouter as unknown as OpenRouterClient,
      templateEngine,
      "What is AI?"
    )

    const result = await Effect.runPromise(
      Effect.flip(stage.execute(ctx, createPeerRankingDependencies(parallelQueryOutput))).pipe(Effect.provide(TestLayer))
    )

    expect(result._tag).toBe("StageExecutionError")
  })
})

describe("SynthesisStage", () => {
  let stage: SynthesisStage
  let templateEngine: TemplateEngine
  let mockOpenRouter: ReturnType<typeof createMockOpenRouter>

  beforeEach(() => {
    templateEngine = createLiquidTemplateEngine()
    stage = new SynthesisStage({
      chairmanModel: "chairman"
    })
  })

  it("should synthesize final answer using chairman model", async () => {
    mockOpenRouter = createMockOpenRouter({
      "chairman": { content: "Final synthesis answer" }
    })

    const services: WorkflowServices = {
      openRouter: mockOpenRouter as unknown as OpenRouterClient,
      templates: templateEngine,
      storage: {} as any,
      config: {} as any
    }

    const ctx = new WorkflowContextBuilder("What is AI?", services).build()

    const parallelQueryOutput: ParallelQueryOutput = {
      queries: [
        { model: "model-a", response: "Response A" },
        { model: "model-b", response: "Response B" }
      ],
      successCount: 2,
      failureCount: 0
    }

    const peerRankingOutput: PeerRankingOutput = {
      labelToModel: {
        "Response A": "model-a",
        "Response B": "model-b"
      },
      rankings: [
        {
          model: "evaluator",
          rawEvaluation: "eval",
          parsedRanking: ["Response B", "Response A"] as readonly string[]
        }
      ],
      aggregateRankings: [
        { model: "model-b", averageRank: 1, rankingCount: 1 },
        { model: "model-a", averageRank: 2, rankingCount: 1 }
      ]
    }

    let hasCorrectAnswer = false
    try {
      const result = await Effect.runPromise(
        stage.execute(ctx, createSynthesisDependencies(parallelQueryOutput, peerRankingOutput)).pipe(Effect.provide(TestLayer))
      )
      if (result && result.data?.finalAnswer === "Final synthesis answer") {
        hasCorrectAnswer = true
      }
    } catch {
      // Should not throw
    }

    expect(hasCorrectAnswer).toBe(true)
  })

  it("should fail when chairman model doesn't respond", async () => {
    mockOpenRouter = createMockOpenRouter({
      "chairman": { content: "" }
    })

    const services: WorkflowServices = {
      openRouter: mockOpenRouter as unknown as OpenRouterClient,
      templates: templateEngine,
      storage: {} as any,
      config: {} as any
    }

    const ctx = new WorkflowContextBuilder("What is AI?", services).build()

    const parallelQueryOutput: ParallelQueryOutput = {
      queries: [{ model: "model-a", response: "Response A" }],
      successCount: 1,
      failureCount: 0
    }

    const peerRankingOutput: PeerRankingOutput = {
      labelToModel: { "Response A": "model-a" },
      rankings: [
        {
          model: "evaluator",
          rawEvaluation: "eval",
          parsedRanking: ["Response A"] as readonly string[]
        }
      ],
      aggregateRankings: [
        { model: "model-a", averageRank: 1, rankingCount: 1 }
      ]
    }

    const result = await Effect.runPromise(
      Effect.flip(stage.execute(ctx, createSynthesisDependencies(parallelQueryOutput, peerRankingOutput))).pipe(Effect.provide(TestLayer))
    )

    expect(result._tag).toBe("StageExecutionError")
  })

  it("should include reasoning details from chairman", async () => {
    mockOpenRouter = createMockOpenRouter({
      "chairman": {
        content: "Final answer",
        reasoning_details: { analysis: "detailed" }
      }
    })

    const services: WorkflowServices = {
      openRouter: mockOpenRouter as unknown as OpenRouterClient,
      templates: templateEngine,
      storage: {} as any,
      config: {} as any
    }

    const ctx = new WorkflowContextBuilder("What is AI?", services).build()

    const parallelQueryOutput: ParallelQueryOutput = {
      queries: [{ model: "model-a", response: "Response A" }],
      successCount: 1,
      failureCount: 0
    }

    const peerRankingOutput: PeerRankingOutput = {
      labelToModel: { "Response A": "model-a" },
      rankings: [
        {
          model: "evaluator",
          rawEvaluation: "eval",
          parsedRanking: ["Response A"] as readonly string[]
        }
      ],
      aggregateRankings: [
        { model: "model-a", averageRank: 1, rankingCount: 1 }
      ]
    }

    let hasReasoning = false
    try {
      const result = await Effect.runPromise(
        stage.execute(ctx, createSynthesisDependencies(parallelQueryOutput, peerRankingOutput)).pipe(Effect.provide(TestLayer))
      )
      if (result && result.data?.reasoning && (result.data.reasoning as any).analysis === "detailed") {
        hasReasoning = true
      }
    } catch {
      // Should not throw
    }

    expect(hasReasoning).toBe(true)
  })

  it("should fail when parallel-query result is missing", async () => {
    mockOpenRouter = createMockOpenRouter({
      "chairman": { content: "Answer" }
    })

    const services: WorkflowServices = {
      openRouter: mockOpenRouter as unknown as OpenRouterClient,
      templates: templateEngine,
      storage: {} as any,
      config: {} as any
    }

    const ctx = new WorkflowContextBuilder("What is AI?", services).build()

    const peerRankingOutput: PeerRankingOutput = {
      labelToModel: {},
      rankings: [],
      aggregateRankings: []
    }

    // Pass only peer-ranking, missing parallel-query
    const incompleteDependencies: ReadonlyMap<string, StageResult> = new Map([
      [
        "peer-ranking",
        {
          stageId: "peer-ranking",
          data: peerRankingOutput,
          success: true,
          timestamp: new Date()
        }
      ]
    ])

    let errorThrown = false
    try {
      await Effect.runPromise(
        stage.execute(ctx, incompleteDependencies).pipe(Effect.provide(TestLayer))
      )
    } catch (error) {
      errorThrown = true
    }

    expect(errorThrown).toBe(true)
  })

  it("should support custom synthesis prompt template", async () => {
    const stageWithTemplate = new SynthesisStage({
      chairmanModel: "chairman",
      synthesisPromptTemplate:
        "Summarize this question: {{ userQuery }}\n\nResponses: {{ responses }}"
    })

    mockOpenRouter = createMockOpenRouter({
      "chairman": { content: "Synthesis" }
    })

    const services: WorkflowServices = {
      openRouter: mockOpenRouter as unknown as OpenRouterClient,
      templates: templateEngine,
      storage: {} as any,
      config: {} as any
    }

    const ctx = new WorkflowContextBuilder("What is AI?", services).build()

    const parallelQueryOutput: ParallelQueryOutput = {
      queries: [{ model: "model-a", response: "Response A" }],
      successCount: 1,
      failureCount: 0
    }

    const peerRankingOutput: PeerRankingOutput = {
      labelToModel: { "Response A": "model-a" },
      rankings: [
        {
          model: "evaluator",
          rawEvaluation: "eval",
          parsedRanking: ["Response A"] as readonly string[]
        }
      ],
      aggregateRankings: [
        { model: "model-a", averageRank: 1, rankingCount: 1 }
      ]
    }

    let executed = false
    try {
      const result = await Effect.runPromise(stageWithTemplate.execute(ctx, createSynthesisDependencies(parallelQueryOutput, peerRankingOutput.pipe(Effect.provide(TestLayer)))
      )
      if (result && result.data) {
        executed = true
      }
    } catch (error) {
      // Custom template might fail if it's not valid, that's ok
    }

    expect(executed).toBe(true)
  })
})
