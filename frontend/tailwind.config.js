/**
 * Tailwind CSS v4 Configuration
 * 
 * Design tokens are defined in index.css using CSS variables.
 * Tailwind v4 uses @import "tailwindcss" in CSS instead of @tailwind directives.
 * This config file only specifies content paths for JIT compilation.
 */
export default {
	content: ["./index.html", "./src/**/*.{ts,tsx}"],
	// Theme customization moved to CSS @theme or CSS variables
	// See index.css for design tokens
};
