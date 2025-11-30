/**
 * Server startup script using Effect Platform
 * Run with: bun src/server.ts
 * Or with custom port: PORT=8002 bun src/server.ts
 */

import { NodeHttpServer, NodeRuntime } from "@effect/platform-node";
import * as Http from "@effect/platform/HttpServer";
import { Effect, Layer } from "effect";
import { app } from "./http/app";
import { logInfo, logError } from "./observability";
import { ProductionLayer } from "./runtime";

const port = Number.parseInt(process.env.PORT || "8001", 10);

// Create server layer with all dependencies
// Http.serve returns a Layer that needs the app and server dependencies
// Note: NodeHttpServer uses Node.js HTTP server which automatically handles:
// - Connection pooling via event loop
// - Keep-alive connections (default 5 seconds, configurable via server.keepAliveTimeout)
// - Max connections are managed by OS limits and Node.js event loop capacity
const ServerLive = Http.serve(app).pipe(
  Layer.provide(ProductionLayer),
  Layer.provide(NodeHttpServer.layer({ port }))
);

// Launch the server
Layer.launch(ServerLive).pipe(
  Effect.tap(() =>
    logInfo("Server started", {
      port,
      host: "0.0.0.0",
    })
  ),
  Effect.catchAll((error) =>
    logError("Failed to start server", error, {
      port,
    }).pipe(
      Effect.andThen(() =>
        Effect.sync(() => {
          process.exit(1);
        })
      )
    )
  ),
  NodeRuntime.runMain
);
