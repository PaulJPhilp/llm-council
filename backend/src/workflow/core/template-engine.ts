import { Effect } from "effect"
import { Liquid } from "liquidjs"
import type { TemplateEngine, TemplateContext, Template } from "./template"
import { TemplateError } from "./errors"

/**
 * Liquid template engine implementation using liquidjs
 */
class LiquidTemplateEngine implements TemplateEngine {
  private engine: Liquid

  constructor() {
    this.engine = new Liquid()
  }

  /**
   * Render a template string with the given context
   */
  render(
    templateString: string,
    context: TemplateContext
  ): Effect.Effect<string, TemplateError> {
    return Effect.promise(async () => {
      try {
        const tpl = this.engine.parse(templateString)
        return await this.engine.render(tpl, context)
      } catch (error) {
        throw new TemplateError({
          message: error instanceof Error ? error.message : String(error),
          templateName: "inline",
          cause: error
        })
      }
    })
  }

  /**
   * Render a named template
   */
  renderTemplate(
    template: Template,
    context: TemplateContext
  ): Effect.Effect<string, TemplateError> {
    return Effect.promise(async () => {
      try {
        const tpl = this.engine.parse(template.content)
        return await this.engine.render(tpl, context)
      } catch (error) {
        throw new TemplateError({
          message: error instanceof Error ? error.message : String(error),
          templateName: template.name,
          cause: error
        })
      }
    })
  }

  /**
   * Validate template syntax
   */
  validate(templateString: string): Effect.Effect<void, TemplateError> {
    return Effect.sync(() => {
      try {
        this.engine.parse(templateString)
      } catch (error) {
        throw new TemplateError({
          message: error instanceof Error ? error.message : String(error),
          templateName: "validation",
          cause: error
        })
      }
    })
  }
}

/**
 * Create a Liquid template engine instance
 */
export function createLiquidTemplateEngine(): TemplateEngine {
  return new LiquidTemplateEngine()
}

/**
 * Singleton instance for default use
 */
export const liquidTemplateEngine = createLiquidTemplateEngine()
