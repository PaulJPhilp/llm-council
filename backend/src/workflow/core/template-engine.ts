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
    const engine = this.engine;
    return Effect.gen(function* () {
      const tpl = yield* Effect.try({
        try: () => engine.parse(templateString),
        catch: (error) =>
          new TemplateError({
            message: error instanceof Error ? error.message : String(error),
            templateName: "inline",
            cause: error,
          }),
      });

      return yield* Effect.tryPromise({
        try: () => engine.render(tpl, context),
        catch: (error) =>
          new TemplateError({
            message: error instanceof Error ? error.message : String(error),
            templateName: "inline",
            cause: error,
          }),
      });
    });
  }

  /**
   * Render a named template
   */
  renderTemplate(
    template: Template,
    context: TemplateContext
  ): Effect.Effect<string, TemplateError> {
    const engine = this.engine;
    return Effect.gen(function* () {
      const tpl = yield* Effect.try({
        try: () => engine.parse(template.content),
        catch: (error) =>
          new TemplateError({
            message: error instanceof Error ? error.message : String(error),
            templateName: template.name,
            cause: error,
          }),
      });

      return yield* Effect.tryPromise({
        try: () => engine.render(tpl, context),
        catch: (error) =>
          new TemplateError({
            message: error instanceof Error ? error.message : String(error),
            templateName: template.name,
            cause: error,
          }),
      });
    });
  }

  /**
   * Validate template syntax
   */
  validate(templateString: string): Effect.Effect<void, TemplateError> {
    const engine = this.engine;
    return Effect.try({
      try: () => {
        engine.parse(templateString);
      },
      catch: (error) =>
        new TemplateError({
          message: error instanceof Error ? error.message : String(error),
          templateName: "validation",
          cause: error,
        }),
    });
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
