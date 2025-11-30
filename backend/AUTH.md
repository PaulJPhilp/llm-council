# Authentication & Authorization

This document describes the authentication and authorization system implemented for the Ensemble backend.

## Overview

The backend now requires authentication for all `/api/*` endpoints. Users must provide an `Authorization` header with a Bearer token or API key.

## Authentication

### How It Works

1. **Token Extraction**: The `authMiddleware` extracts the `Authorization` header from incoming requests
2. **Token Validation**: Currently accepts any non-empty token (for development)
3. **User Identity**: The token is used to derive a `userId` (first 20 characters of token)
4. **Context Storage**: User identity is stored in Hono context for use in route handlers

### Supported Formats

- **Bearer Token**: `Authorization: Bearer <token>`
- **API Key**: `Authorization: ApiKey <key>`

### Example Request

```bash
curl -X GET http://localhost:8001/api/conversations \
  -H "Authorization: Bearer my-user-token-12345"
```

## Authorization

### Conversation Ownership

All conversations are now associated with a `user_id`. Users can only:
- Create conversations (automatically assigned their `user_id`)
- List their own conversations
- Access conversations they own
- Send messages to conversations they own

### Authorization Checks

Before accessing a conversation, the system:
1. Extracts user identity from the request
2. Loads the conversation
3. Compares `conversation.user_id` with `user.userId`
4. Returns `403 Forbidden` if they don't match

## Implementation Details

### Files

- **`src/auth.ts`**: Authentication service with Effect patterns
  - `AuthService`: Extracts user identity from requests
  - `extractUserFromRequest()`: Parses Authorization header
  - `authorizeResource()`: Checks resource ownership

- **`src/http/middleware.ts`**: Hono middleware
  - `authMiddleware`: Required authentication for protected routes
  - `optionalAuthMiddleware`: Optional authentication (not currently used)
  - `requireAuth()`: Helper to get user from context

- **`src/storage.ts`**: Updated to support user ownership
  - `Conversation` type now includes `user_id` field
  - `createConversation()` requires `userId` parameter
  - `listConversations()` filters by `userId`

- **`src/main.ts`**: Routes updated with auth
  - All `/api/*` routes use `authMiddleware`
  - Routes extract user with `requireAuth(c)`
  - Authorization checks before accessing conversations

## Public Endpoints

The following endpoints do **not** require authentication:
- `GET /` - Health check
- `GET /api/v3/workflows` - List workflows (workflow definitions are public)
- `GET /api/v3/workflows/:id` - Get workflow details

## Protected Endpoints

All other endpoints require authentication:
- `GET /api/conversations` - List user's conversations
- `POST /api/conversations` - Create conversation
- `GET /api/conversations/:id` - Get conversation (with ownership check)
- `POST /api/conversations/:id/message` - Send message (with ownership check)
- `POST /api/conversations/:id/message/stream` - Stream message (with ownership check)
- `POST /api/v3/conversations/:id/execute/stream` - Execute workflow (with ownership check)

## Error Responses

### 401 Unauthorized
Returned when:
- Missing `Authorization` header
- Invalid token format
- Empty token

Example:
```json
{
  "error": "Unauthorized",
  "message": "Missing Authorization header",
  "code": "missing_token"
}
```

### 403 Forbidden
Returned when:
- User tries to access a conversation they don't own

Example:
```json
{
  "error": "Forbidden"
}
```

## Future Enhancements

The current implementation is a foundation that can be extended:

1. **JWT Tokens**: Replace simple token validation with JWT verification
2. **Token Database**: Store API keys in database with expiration
3. **OAuth Integration**: Support OAuth providers (Google, GitHub, etc.)
4. **Role-Based Access**: Add roles (admin, user) and permissions
5. **Session Management**: Track active sessions and support logout
6. **Rate Limiting**: Per-user rate limits based on authentication

## Development Notes

For local development, you can use any non-empty token:

```bash
# Example: Use a simple token
Authorization: Bearer dev-user-123

# The system will extract "dev-user-123" as the userId
```

In production, implement proper token validation (JWT, database lookup, etc.) in `src/auth.ts` → `extractUserFromRequest()`.

