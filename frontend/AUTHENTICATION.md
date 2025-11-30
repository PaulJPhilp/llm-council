# Frontend Authentication Setup

The frontend now requires authentication to communicate with the backend API.

## Configuration

### Option 1: Environment Variable (Development)

Create a `.env` file in the `frontend/` directory:

```env
VITE_AUTH_TOKEN=Bearer your-token-here
# OR
VITE_AUTH_TOKEN=ApiKey your-api-key-here
```

### Option 2: LocalStorage (Production)

The frontend will automatically check `localStorage.getItem("auth_token")` if no environment variable is set.

You can set it programmatically:
```javascript
localStorage.setItem("auth_token", "Bearer your-token-here");
// OR
localStorage.setItem("auth_token", "ApiKey your-api-key-here");
```

## Token Formats

The backend supports two authentication formats:

1. **Bearer Token**: `Bearer <token>`
2. **API Key**: `ApiKey <key>`

If you provide a token without a prefix, it will default to `Bearer`.

## Example

For development, add to `frontend/.env`:
```env
VITE_AUTH_TOKEN=Bearer test-token-123
```

For production, set it in your application initialization:
```javascript
// In your app initialization code
localStorage.setItem("auth_token", "Bearer production-token");
```

