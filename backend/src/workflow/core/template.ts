import { Effect } from "effect"
import type { TemplateError } from "./errors"

/**
 * Template variable context - variables available for template rendering
 */
export interface TemplateContext {
  readonly [key: string]: unknown
}

/**
 * Template definition with name and content
 */
export interface Template {
  readonly name: string
  readonly content: string
}

/**
 * Template engine interface for rendering Liquid templates
 */
export interface TemplateEngine {
  /**
   * Render a template string with the given context
   * @param templateString - The template content to render
   * @param context - Variables available during rendering
   * @returns Effect that either renders successfully or fails
   */
  render(
    templateString: string,
    context: TemplateContext
  ): Effect.Effect<string, TemplateError>

  /**
   * Render a named template
   * @param template - Template object with name and content
   * @param context - Variables available during rendering
   * @returns Effect that either renders successfully or fails
   */
  renderTemplate(
    template: Template,
    context: TemplateContext
  ): Effect.Effect<string, TemplateError>

  /**
   * Validate template syntax
   * @param templateString - The template to validate
   * @returns Effect that validates the template syntax
   */
  validate(templateString: string): Effect.Effect<void, TemplateError>
}

/**
 * Create a template from name and content
 */
export function createTemplate(name: string, content: string): Template {
  return { name, content }
}
