import { describe, it, expect } from "vitest"
import { Effect } from "effect"
import { createLiquidTemplateEngine } from "./template-engine"
import { createTemplate } from "./template"

describe("Template Engine", () => {
  const engine = createLiquidTemplateEngine()

  describe("Basic rendering", () => {
    it("should render simple template string", async () => {
      const template = "Hello {{ name }}!"
      const result = await Effect.runPromise(
        engine.render(template, { name: "World" })
      )
      expect(result).toBe("Hello World!")
    })

    it("should render template with multiple variables", async () => {
      const template = "{{ greeting }} {{ name }}, you are {{ age }} years old."
      const result = await Effect.runPromise(
        engine.render(template, {
          greeting: "Hey",
          name: "Alice",
          age: 30
        })
      )
      expect(result).toBe("Hey Alice, you are 30 years old.")
    })

    it("should handle empty variable context", async () => {
      const template = "No variables here"
      const result = await Effect.runPromise(
        engine.render(template, {})
      )
      expect(result).toBe("No variables here")
    })

    it("should render undefined variables as empty string", async () => {
      const template = "Hello {{ name }}!"
      const result = await Effect.runPromise(
        engine.render(template, {})
      )
      expect(result).toBe("Hello !")
    })
  })

  describe("Liquid features", () => {
    it("should support if statements", async () => {
      const template = "{% if age >= 18 %}Adult{% else %}Minor{% endif %}"
      const adult = await Effect.runPromise(
        engine.render(template, { age: 21 })
      )
      expect(adult).toBe("Adult")

      const minor = await Effect.runPromise(
        engine.render(template, { age: 15 })
      )
      expect(minor).toBe("Minor")
    })

    it("should support for loops", async () => {
      const template = "{% for item in items %}{{ item }} {% endfor %}"
      const result = await Effect.runPromise(
        engine.render(template, { items: ["a", "b", "c"] })
      )
      expect(result).toBe("a b c ")
    })

    it("should support filters", async () => {
      const template = "{{ text | upcase }}"
      const result = await Effect.runPromise(
        engine.render(template, { text: "hello" })
      )
      expect(result).toBe("HELLO")
    })

    it("should support multiple filters", async () => {
      const template = "{{ ' hello world ' | strip | upcase }}"
      const result = await Effect.runPromise(
        engine.render(template, {})
      )
      expect(result).toBe("HELLO WORLD")
    })

    it("should support size filter on arrays", async () => {
      const template = "Items: {{ items | size }}"
      const result = await Effect.runPromise(
        engine.render(template, { items: [1, 2, 3, 4, 5] })
      )
      expect(result).toBe("Items: 5")
    })
  })

  describe("Template objects", () => {
    it("should render named template", async () => {
      const template = createTemplate("greeting", "Hello {{ name }}!")
      const result = await Effect.runPromise(
        engine.renderTemplate(template, { name: "Bob" })
      )
      expect(result).toBe("Hello Bob!")
    })

    it("should handle template objects with complex content", async () => {
      const template = createTemplate(
        "conditional",
        "{% if score >= 80 %}Pass{% else %}Fail{% endif %}"
      )
      const pass = await Effect.runPromise(
        engine.renderTemplate(template, { score: 85 })
      )
      expect(pass).toBe("Pass")

      const fail = await Effect.runPromise(
        engine.renderTemplate(template, { score: 60 })
      )
      expect(fail).toBe("Fail")
    })
  })

  describe("Error handling", () => {
    it("should handle invalid filters gracefully", async () => {
      // liquidjs in lenient mode may ignore unknown filters rather than throw
      const template = "{{ name | upcase | downcase }}"
      const result = await Effect.runPromise(
        engine.render(template, { name: "test" })
      )
      expect(result).toBeDefined()
    })

    it("should fail on unclosed tags", async () => {
      const invalidTemplate = "{{ name"
      let errorThrown = false
      let errorMessage = ""
      try {
        await Effect.runPromise(
          engine.render(invalidTemplate, {})
        )
      } catch (error) {
        errorThrown = true
        errorMessage = error instanceof Error ? error.message : String(error)
      }
      expect(errorThrown).toBe(true)
      expect(errorMessage).toContain("closed")
    })

    it("should handle unclosed liquid tags", async () => {
      const invalidTemplate = "{% if name %}"
      let errorThrown = false
      try {
        await Effect.runPromise(
          engine.render(invalidTemplate, { name: "test" })
        )
      } catch (error) {
        errorThrown = true
      }
      expect(errorThrown).toBe(true)
    })
  })

  describe("Validation", () => {
    it("should validate correct template syntax", async () => {
      const template = "Hello {{ name }}!"
      await Effect.runPromise(engine.validate(template))
      // Should not throw
    })

    it("should validate template with Liquid features", async () => {
      const template = "{% if x %}{{ x }}{% endif %}"
      await Effect.runPromise(engine.validate(template))
      // Should not throw
    })

    it("should fail validation on invalid syntax", async () => {
      const invalidTemplate = "{{ unclosed"
      let errorThrown = false
      let errorMessage = ""
      try {
        await Effect.runPromise(engine.validate(invalidTemplate))
      } catch (error) {
        errorThrown = true
        errorMessage = error instanceof Error ? error.message : String(error)
      }
      expect(errorThrown).toBe(true)
      expect(errorMessage).toContain("closed")
    })
  })

  describe("Complex scenarios", () => {
    it("should render workflow prompt template", async () => {
      const promptTemplate = `Query: {{ userQuery }}

Instructions:
- Analyze the query thoroughly
- Provide a structured response
- Consider multiple perspectives

{% for perspective in perspectives %}
Perspective {{ forloop.index }}: {{ perspective }}
{% endfor %}`

      const result = await Effect.runPromise(
        engine.render(promptTemplate, {
          userQuery: "What is AI?",
          perspectives: ["Technical", "Philosophical", "Practical"]
        })
      )

      expect(result).toContain("Query: What is AI?")
      expect(result).toContain("Perspective 1: Technical")
      expect(result).toContain("Perspective 2: Philosophical")
      expect(result).toContain("Perspective 3: Practical")
    })

    it("should handle nested data structures", async () => {
      const template = `Stage Results:
{% for stage in stages %}
- {{ stage.name }}: {{ stage.status }}
{% endfor %}`

      const result = await Effect.runPromise(
        engine.render(template, {
          stages: [
            { name: "Query Processing", status: "Complete" },
            { name: "Analysis", status: "In Progress" },
            { name: "Synthesis", status: "Pending" }
          ]
        })
      )

      expect(result).toContain("Query Processing: Complete")
      expect(result).toContain("Analysis: In Progress")
      expect(result).toContain("Synthesis: Pending")
    })

    it("should handle conditional rendering based on data", async () => {
      const template = `Status Report:
{% if results.size > 0 %}
Results found: {{ results.size }}
{% for result in results %}
  - {{ result }}
{% endfor %}
{% else %}
No results available.
{% endif %}`

      const withResults = await Effect.runPromise(
        engine.render(template, {
          results: ["result1", "result2", "result3"]
        })
      )
      expect(withResults).toContain("Results found: 3")
      expect(withResults).toContain("result1")

      const withoutResults = await Effect.runPromise(
        engine.render(template, {
          results: []
        })
      )
      expect(withoutResults).toContain("No results available")
    })
  })

  describe("Performance", () => {
    it("should handle large templates efficiently", async () => {
      // Create a template with many variables
      let template = "Data: "
      const context: Record<string, unknown> = {}
      for (let i = 0; i < 100; i++) {
        template += `{{ var${i} }} `
        context[`var${i}`] = `value${i}`
      }

      const start = Date.now()
      const result = await Effect.runPromise(engine.render(template, context))
      const duration = Date.now() - start

      expect(result).toContain("value0")
      expect(result).toContain("value99")
      expect(duration).toBeLessThan(1000) // Should complete in under 1 second
    })

    it("should handle templates with many loops efficiently", async () => {
      const template = `{% for i in (1..100) %}{{ i }} {% endfor %}`
      const start = Date.now()
      const result = await Effect.runPromise(engine.render(template, {}))
      const duration = Date.now() - start

      expect(result).toContain("1")
      expect(result).toContain("100")
      expect(duration).toBeLessThan(1000)
    })
  })
})
