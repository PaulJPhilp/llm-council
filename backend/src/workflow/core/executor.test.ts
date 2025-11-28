import { describe, it, expect, beforeEach } from "vitest"
import { Effect } from "effect"
import { BaseStage } from "./stage"
import { executeWorkflow } from "./executor"
import type { WorkflowServices } from "./context"

// Mock services for testing
const createMockServices = (): WorkflowServices => ({
  openRouter: {} as any,
  storage: {} as any,
  config: {} as any,
  templates: {
    render: () => Effect.succeed("rendered template"),
    renderTemplate: () => Effect.succeed("rendered template"),
    validate: () => Effect.succeed(undefined)
  }
})

// Helper stage for testing
class TestStage extends BaseStage<unknown, { value: string }> {
  constructor(
    id: string,
    private outputValue?: string,
    dependencies?: string[]
  ) {
    super(id, `Test Stage ${id}`, "test", dependencies || [])
  }

  execute() {
    return Effect.succeed(this.success({ value: this.outputValue || this.id }))
  }
}

describe("Workflow Executor", () => {
  let mockServices: WorkflowServices

  beforeEach(() => {
    mockServices = createMockServices()
  })

  describe("Linear workflow (no dependencies)", () => {
    it("should execute stages in order", async () => {
      const stage1 = new TestStage("stage1", "result1")
      const stage2 = new TestStage("stage2", "result2")
      const stage3 = new TestStage("stage3", "result3")

      const workflow = {
        id: "test-linear",
        name: "Linear Test",
        version: "1.0.0",
        stages: [stage1, stage2, stage3]
      }

      const events: any[] = []
      const result = await Effect.runPromise(
        executeWorkflow(workflow, "test query", mockServices, (event) => {
          events.push(event)
        })
      )

      expect(result.stageResults.size).toBe(3)
      expect((result.stageResults.get("stage1")?.data as any)?.value).toBe("result1")
      expect((result.stageResults.get("stage2")?.data as any)?.value).toBe("result2")
      expect((result.stageResults.get("stage3")?.data as any)?.value).toBe("result3")
      expect(result.workflowId).toBe("test-linear")

      // Check events
      const startEvents = events.filter((e) => e.type === "stage_start")
      expect(startEvents).toHaveLength(3)
      expect(startEvents[0].stageId).toBe("stage1")
      expect(startEvents[1].stageId).toBe("stage2")
      expect(startEvents[2].stageId).toBe("stage3")
    })
  })

  describe("DAG workflow with dependencies", () => {
    it("should respect dependencies and execute in topological order", async () => {
      const stage1 = new TestStage("stage1")
      const stage2a = new TestStage("stage2a", "result2a", ["stage1"])
      const stage2b = new TestStage("stage2b", "result2b", ["stage1"])
      const stage3 = new TestStage("stage3", "result3", ["stage2a", "stage2b"])

      const workflow = {
        id: "test-dag",
        name: "DAG Test",
        version: "1.0.0",
        stages: [stage3, stage1, stage2b, stage2a] // Intentionally out of order
      }

      const executionOrder: string[] = []
      const result = await Effect.runPromise(
        executeWorkflow(workflow, "test query", mockServices, (event) => {
          if (event.type === "stage_start") {
            executionOrder.push(event.stageId!)
          }
        })
      )

      // stage1 should execute first
      expect(executionOrder[0]).toBe("stage1")
      // stage2a and stage2b should execute after stage1 (order doesn't matter)
      expect([executionOrder[1], executionOrder[2]]).toEqual(
        expect.arrayContaining(["stage2a", "stage2b"])
      )
      // stage3 should execute last
      expect(executionOrder[3]).toBe("stage3")

      // All results should be available
      expect(result.stageResults.size).toBe(4)
    })

    it("should handle diamond dependency pattern", async () => {
      const stage1 = new TestStage("stage1")
      const stage2a = new TestStage("stage2a", "result2a", ["stage1"])
      const stage2b = new TestStage("stage2b", "result2b", ["stage1"])
      const stage3 = new TestStage("stage3", "result3", ["stage2a", "stage2b"])

      const workflow = {
        id: "test-diamond",
        name: "Diamond Test",
        version: "1.0.0",
        stages: [stage1, stage2a, stage2b, stage3]
      }

      const result = await Effect.runPromise(
        executeWorkflow(workflow, "test query", mockServices)
      )

      expect(result.stageResults.size).toBe(4)
      expect((result.stageResults.get("stage3")?.data as any).value).toBe("result3")
    })
  })

  describe("Cycle detection", () => {
    it("should fail when workflow has circular dependencies", async () => {
      // Create stages with circular dependency
      const stage1 = new TestStage("stage1", "result1", ["stage2"])
      const stage2 = new TestStage("stage2", "result2", ["stage1"])

      const workflow = {
        id: "test-cycle",
        name: "Cycle Test",
        version: "1.0.0",
        stages: [stage1, stage2]
      }

      let errorThrown = false
      let errorMessage = ""
      try {
        await Effect.runPromise(
          executeWorkflow(workflow, "test query", mockServices)
        )
      } catch (error) {
        errorThrown = true
        errorMessage = error instanceof Error ? error.message : String(error)
      }

      expect(errorThrown).toBe(true)
      expect(errorMessage).toContain("circular")
    })
  })

  describe("Validation", () => {
    it("should fail with missing dependency", async () => {
      const stage1 = new TestStage("stage1", "result1", ["nonexistent"])

      const workflow = {
        id: "test-missing",
        name: "Missing Dep Test",
        version: "1.0.0",
        stages: [stage1]
      }

      let errorThrown = false
      let errorMessage = ""
      try {
        await Effect.runPromise(
          executeWorkflow(workflow, "test query", mockServices)
        )
      } catch (error) {
        errorThrown = true
        errorMessage = error instanceof Error ? error.message : String(error)
      }

      expect(errorThrown).toBe(true)
      expect(errorMessage).toContain("unknown stage")
    })

    it("should fail with missing workflow ID", async () => {
      const stage1 = new TestStage("stage1")

      const workflow = {
        id: "",
        name: "No ID Test",
        version: "1.0.0",
        stages: [stage1]
      }

      let errorThrown = false
      let errorMessage = ""
      try {
        await Effect.runPromise(
          executeWorkflow(workflow, "test query", mockServices)
        )
      } catch (error) {
        errorThrown = true
        errorMessage = error instanceof Error ? error.message : String(error)
      }

      expect(errorThrown).toBe(true)
      expect(errorMessage).toContain("id")
    })

    it("should fail with no stages", async () => {
      const workflow = {
        id: "test-no-stages",
        name: "No Stages Test",
        version: "1.0.0",
        stages: []
      }

      let errorThrown = false
      let errorMessage = ""
      try {
        await Effect.runPromise(
          executeWorkflow(workflow, "test query", mockServices)
        )
      } catch (error) {
        errorThrown = true
        errorMessage = error instanceof Error ? error.message : String(error)
      }

      expect(errorThrown).toBe(true)
      expect(errorMessage).toContain("stage")
    })
  })

  describe("Progress events", () => {
    it("should emit stage start and complete events", async () => {
      const stage1 = new TestStage("stage1")
      const stage2 = new TestStage("stage2")

      const workflow = {
        id: "test-events",
        name: "Events Test",
        version: "1.0.0",
        stages: [stage1, stage2]
      }

      const events: any[] = []
      await Effect.runPromise(
        executeWorkflow(workflow, "test query", mockServices, (event) => {
          events.push(event)
        })
      )

      const startEvents = events.filter((e) => e.type === "stage_start")
      const completeEvents = events.filter((e) => e.type === "stage_complete")
      const workflowCompleteEvents = events.filter((e) => e.type === "workflow_complete")

      expect(startEvents).toHaveLength(2)
      expect(completeEvents).toHaveLength(2)
      expect(workflowCompleteEvents).toHaveLength(1)

      // Verify event structure
      expect(startEvents[0]).toHaveProperty("stageId", "stage1")
      expect(startEvents[0]).toHaveProperty("timestamp")
      expect(completeEvents[0]).toHaveProperty("data")
      expect(completeEvents[0]).toHaveProperty("metadata")
    })

    it("should include metadata in complete events", async () => {
      class MetadataStage extends BaseStage<unknown, { value: string }> {
        constructor(id: string) {
          super(id, `Stage ${id}`, "test")
        }

        execute() {
          return Effect.succeed({
            data: { value: "test" },
            metadata: { custom: "metadata", count: 42 }
          })
        }
      }

      const stage = new MetadataStage("stage1")
      const workflow = {
        id: "test-metadata",
        name: "Metadata Test",
        version: "1.0.0",
        stages: [stage]
      }

      const events: any[] = []
      await Effect.runPromise(
        executeWorkflow(workflow, "test query", mockServices, (event) => {
          events.push(event)
        })
      )

      const completeEvent = events.find((e) => e.type === "stage_complete" && e.stageId === "stage1")
      expect(completeEvent?.metadata).toEqual({ custom: "metadata", count: 42 })
    })
  })

  describe("Execution timing", () => {
    it("should track execution time", async () => {
      const stage1 = new TestStage("stage1")

      const workflow = {
        id: "test-timing",
        name: "Timing Test",
        version: "1.0.0",
        stages: [stage1]
      }

      const result = await Effect.runPromise(
        executeWorkflow(workflow, "test query", mockServices)
      )

      expect(result.executionTimeMs).toBeGreaterThanOrEqual(0)
      expect(result.startedAt).toBeDefined()
      expect(result.completedAt).toBeDefined()
    })
  })
})
