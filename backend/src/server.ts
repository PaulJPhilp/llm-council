/**
 * Server startup script
 * Run with: bun src/server.ts
 * Or with custom port: PORT=8002 bun src/server.ts
 */

import app from "./main";

const port = Number.parseInt(process.env.PORT || "8001", 10);

console.log(`Starting LLM Council API server on http://0.0.0.0:${port}`);

Bun.serve({
  port,
  fetch: app.fetch,
});

console.log(`✓ Server running on http://0.0.0.0:${port}`);
