import { describe, it, expect, beforeEach, vi } from "vitest"
import { Effect } from "effect"
import { createLLMCouncilWorkflow } from "./llm-council"
import { executeWorkflow } from "../core/executor"
import { createLiquidTemplateEngine } from "../core/template-engine"
import type { WorkflowServices } from "../core/context"
import type { OpenRouterClient } from "../../openrouter"
import type { TemplateEngine } from "../core/template"
import type { ParallelQueryOutput } from "../stages"
import type { PeerRankingOutput } from "../stages"
import { TestLayer } from "../../runtime.test"

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

// Helper to create test services
const createTestServices = (
  openRouter: OpenRouterClient,
  templates: TemplateEngine
): WorkflowServices => ({
  openRouter,
  templates,
  storage: {} as any,
  config: {} as any
})

describe("LLM Council Workflow Integration", () => {
  let templateEngine: TemplateEngine
  let mockOpenRouter: ReturnType<typeof createMockOpenRouter>

  beforeEach(() => {
    templateEngine = createLiquidTemplateEngine()
  })

  it("should execute complete 3-stage workflow successfully", async () => {
    mockOpenRouter = createMockOpenRouter({
      "model-a": { content: "Response from Model A" },
      "model-b": { content: "Response from Model B" },
      "chairman": { content: "Final synthesis answer" }
    })

    const services = createTestServices(
      mockOpenRouter as unknown as OpenRouterClient,
      templateEngine
    )

    const workflow = createLLMCouncilWorkflow({
      councilModels: ["model-a", "model-b"],
      chairmanModel: "chairman"
    })

    const result = await Effect.runPromise(
      executeWorkflow(workflow, "What is AI?", services).pipe(Effect.provide(TestLayer))
    )

    // Verify all 3 stages have results
    expect(result.stageResults.has("parallel-query")).toBe(true)
    expect(result.stageResults.has("peer-ranking")).toBe(true)
    expect(result.stageResults.has("synthesis")).toBe(true)

    // Verify stage 1 output
    const stage1 = result.stageResults.get("parallel-query")?.data as ParallelQueryOutput
    expect(stage1.queries).toHaveLength(2)
    expect(stage1.successCount).toBe(2)
    expect(stage1.failureCount).toBe(0)

    // Verify stage 2 output
    const stage2 = result.stageResults.get("peer-ranking")?.data as PeerRankingOutput
    expect(stage2.rankings).toBeDefined()
    expect(stage2.aggregateRankings).toBeDefined()

    // Verify stage 3 output
    const stage3 = result.stageResults.get("synthesis")?.data as any
    expect(stage3.finalAnswer).toBe("Final synthesis answer")
  })

  it("should handle partial failures gracefully", async () => {
    mockOpenRouter = createMockOpenRouter({
      "model-a": { content: "Response A" },
      "model-b": null, // Failure
      "chairman": { content: "Final answer despite one model failure" }
    })

    const services = createTestServices(
      mockOpenRouter as unknown as OpenRouterClient,
      templateEngine
    )

    const workflow = createLLMCouncilWorkflow({
      councilModels: ["model-a", "model-b"],
      chairmanModel: "chairman"
    })

    const result = await Effect.runPromise(
      executeWorkflow(workflow, "What is AI?", services).pipe(Effect.provide(TestLayer))
    )

    // Should still complete successfully
    expect(result.stageResults.size).toBe(3)

    // Stage 1 should show the failure
    const stage1 = result.stageResults.get("parallel-query")?.data as ParallelQueryOutput
    expect(stage1.failureCount).toBe(1)
    expect(stage1.successCount).toBe(1)
  })

  it("should calculate aggregate rankings correctly", async () => {
    mockOpenRouter = createMockOpenRouter({
      "model-a": { content: "Response A content" },
      "model-b": { content: "Response B content" },
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
      },
      "chairman": { content: "Synthesis" }
    })

    const workflowConfig = {
      councilModels: ["model-a", "model-b"],
      chairmanModel: "chairman"
    }

    // Create custom workflow for testing with evaluators as council members
    const customWorkflow = createLLMCouncilWorkflow(workflowConfig)
    // Modify to use evaluators for peer ranking stage
    ;(customWorkflow.stages[1] as any).models_ = ["evaluator-a", "evaluator-b"]

    const services = createTestServices(
      mockOpenRouter as unknown as OpenRouterClient,
      templateEngine
    )

    const result = await Effect.runPromise(executeWorkflow(customWorkflow, "What is AI?", services.pipe(Effect.provide(TestLayer)))

    // Check aggregate rankings
    const stage2 = result.stageResults.get("peer-ranking")?.data as PeerRankingOutput
    expect(stage2.aggregateRankings).toHaveLength(2)

    // Both responses should have average rank of 1.5
    const modelAAggregate = stage2.aggregateRankings.find((a) => a.model === "model-a")
    const modelBAggregate = stage2.aggregateRankings.find((a) => a.model === "model-b")

    expect(modelAAggregate?.averageRank).toBe(1.5)
    expect(modelBAggregate?.averageRank).toBe(1.5)
  })

  it("should fail when no council models respond", async () => {
    mockOpenRouter = createMockOpenRouter({
      "model-a": null,
      "model-b": null
    })

    const services = createTestServices(
      mockOpenRouter as unknown as OpenRouterClient,
      templateEngine
    )

    const workflow = createLLMCouncilWorkflow({
      councilModels: ["model-a", "model-b"],
      chairmanModel: "chairman"
    })

    const result = await Effect.runPromise(
      Effect.flip(executeWorkflow(workflow, "What is AI?", services)).pipe(Effect.provide(TestLayer))
    )

    // Should be a stage execution error because all models failed
    expect(result._tag).toBe("StageExecutionError")
  })

  it("should emit progress events during execution", async () => {
    mockOpenRouter = createMockOpenRouter({
      "model-a": { content: "Response A" },
      "model-b": { content: "Response B" },
      "chairman": { content: "Final answer" }
    })

    const services = createTestServices(
      mockOpenRouter as unknown as OpenRouterClient,
      templateEngine
    )

    const workflow = createLLMCouncilWorkflow({
      councilModels: ["model-a", "model-b"],
      chairmanModel: "chairman"
    })

    const events: any[] = []
    const onProgress = (event: any) => {
      events.push(event)
    }

    await Effect.runPromise(
      executeWorkflow(workflow, "What is AI?", services, onProgress).pipe(Effect.provide(TestLayer))
    )

    // Should have stage events
    expect(events.length).toBeGreaterThan(0)

    // Should have stage_start and stage_complete events
    const eventTypes = events.map((e) => e.type)
    expect(eventTypes).toContain("stage_start")
    expect(eventTypes).toContain("stage_complete")
  })

  it("should include reasoning details when available", async () => {
    mockOpenRouter = createMockOpenRouter({
      "model-a": {
        content: "Response A",
        reasoning_details: { thought_process: "Detailed reasoning" }
      },
      "model-b": { content: "Response B" },
      "chairman": {
        content: "Final answer",
        reasoning_details: { analysis: "Chairman analysis" }
      }
    })

    const services = createTestServices(
      mockOpenRouter as unknown as OpenRouterClient,
      templateEngine
    )

    const workflow = createLLMCouncilWorkflow({
      councilModels: ["model-a", "model-b"],
      chairmanModel: "chairman"
    })

    const result = await Effect.runPromise(
      executeWorkflow(workflow, "What is AI?", services).pipe(Effect.provide(TestLayer))
    )

    // Check stage 1 reasoning
    const stage1 = result.stageResults.get("parallel-query")?.data as ParallelQueryOutput
    expect(stage1.queries[0].reasoning).toBeDefined()

    // Check stage 3 reasoning
    const stage3 = result.stageResults.get("synthesis")?.data as any
    expect(stage3.reasoning).toBeDefined()
  })

  it("should execute with custom prompts", async () => {
    mockOpenRouter = createMockOpenRouter({
      "model-a": { content: "Custom response A" },
      "model-b": { content: "Custom response B" },
      "chairman": { content: "Custom final answer" }
    })

    const services = createTestServices(
      mockOpenRouter as unknown as OpenRouterClient,
      templateEngine
    )

    const workflow = createLLMCouncilWorkflow({
      councilModels: ["model-a", "model-b"],
      chairmanModel: "chairman",
      systemPrompt: "Custom system instruction",
      rankingPromptTemplate: "Custom ranking prompt: {{ userQuery }}",
      synthesisPromptTemplate: "Custom synthesis prompt: {{ userQuery }}"
    })

    const result = await Effect.runPromise(executeWorkflow(workflow, "Test question?", services.pipe(Effect.provide(TestLayer)))

    expect(result.stageResults.size).toBe(3)
  })

  it("should maintain data consistency across stages", async () => {
    mockOpenRouter = createMockOpenRouter({
      "model-a": { content: "Response A" },
      "model-b": { content: "Response B" },
      "chairman": { content: "Final synthesis" }
    })

    const services = createTestServices(
      mockOpenRouter as unknown as OpenRouterClient,
      templateEngine
    )

    const workflow = createLLMCouncilWorkflow({
      councilModels: ["model-a", "model-b"],
      chairmanModel: "chairman"
    })

    const result = await Effect.runPromise(
      executeWorkflow(workflow, "What is AI?", services).pipe(Effect.provide(TestLayer))
    )

    // Stage 2 should have label mapping that matches stage 1 models
    const stage1 = result.stageResults.get("parallel-query")?.data as ParallelQueryOutput
    const stage2 = result.stageResults.get("peer-ranking")?.data as PeerRankingOutput

    const stage1Models = stage1.queries.map((q) => q.model)
    const stage2Models = Object.values(stage2.labelToModel)

    expect(stage2Models.sort()).toEqual(stage1Models.sort())
  })
})
