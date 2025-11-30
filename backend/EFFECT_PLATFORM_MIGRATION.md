# Effect Platform HTTP Migration

## Status: In Progress

This document tracks the migration from Hono to Effect Platform HTTP.

## Changes Made

### ✅ Completed

1. **Created Effect Platform HTTP app** (`src/http/app.ts`)
   - All routes converted to `Http.router.get/post` handlers
   - Handlers return `Effect<HttpResponse>`
   - Error mapping to HTTP status codes

2. **Updated auth service** (`src/auth.ts`)
   - Changed from Hono `Context` to Effect Platform `HttpRequest`
   - Uses `Http.request.header()` to extract Authorization header
   - Returns `Effect<UserIdentity, AuthenticationError>`

3. **Updated server** (`src/server.ts`)
   - Uses `Http.server.serve()` with `NodeHttpServer.layer()`
   - All services provided via Layer composition
   - Uses `Layer.launch()` to run server

4. **Removed Hono dependencies**
   - Deleted `src/main.ts` (old Hono app)
   - Deleted `src/http/middleware.ts` (Hono-specific middleware)

### ⚠️ Needs Verification

1. **Request Access Pattern**
   - Currently using `yield* Http.request.HttpRequest` in handlers
   - Need to verify this service is automatically available in router context
   - May need to provide `HttpRequest` service explicitly

2. **Route Parameter Extraction**
   - Currently using regex on `url.pathname` to extract params
   - Effect Platform HTTP should provide better parameter extraction
   - Need to find correct API for route params

3. **Request Body Parsing**
   - Using `Http.request.schemaBodyJson(Schema)` pattern
   - Need to verify this is the correct API
   - May need different approach for JSON parsing

4. **Middleware**
   - Created `Http.middleware.make()` for logging and CORS
   - Need to verify middleware composition works correctly
   - CORS headers may need different approach

5. **SSE Streaming**
   - Using `Http.response.stream()` with `ReadableStream`
   - Should work, but need to verify headers are set correctly

6. **Testing**
   - Test file (`main.test.ts`) needs complete rewrite
   - Effect Platform HTTP apps don't have `.fetch()` method
   - Need to use Effect Platform test utilities or create test adapter

## API Endpoints

All endpoints remain the same:
- `GET /` - Health check
- `GET /api/conversations` - List conversations (requires auth)
- `POST /api/conversations` - Create conversation (requires auth)
- `GET /api/conversations/:id` - Get conversation (requires auth)
- `GET /api/workflows` - List workflows (public)
- `GET /api/workflows/:id` - Get workflow (public)
- `POST /api/conversations/:id/execute/stream` - Execute workflow (requires auth, SSE)

## Next Steps

1. **Verify Request Access**: Test that `Http.request.HttpRequest` is available in handlers
2. **Fix Route Params**: Use proper Effect Platform API for parameter extraction
3. **Fix Body Parsing**: Verify `Http.request.schemaBodyJson` works correctly
4. **Test Server**: Start server and verify all endpoints work
5. **Update Tests**: Rewrite tests to work with Effect Platform HTTP
6. **Remove Hono**: Remove `hono` from `package.json` once migration is complete

## Known Issues

- Route parameter extraction uses regex (should use router's param extraction)
- Request body parsing API may be incorrect
- Middleware composition may need adjustment
- Tests need complete rewrite

## Files Changed

- ✅ `src/http/app.ts` - New Effect Platform HTTP app
- ✅ `src/auth.ts` - Updated to use HttpRequest
- ✅ `src/server.ts` - Updated to use Effect Platform server
- ❌ `src/main.ts` - Deleted (old Hono app)
- ❌ `src/http/middleware.ts` - Deleted (Hono-specific)
- ⚠️ `src/main.test.ts` - Needs update for Effect Platform

