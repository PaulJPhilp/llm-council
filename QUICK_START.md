# Quick Start - TypeScript Backend

Get the LLM Council TypeScript backend up and running in 5 minutes.

## Prerequisites

- Node.js 18 or higher
- npm
- OpenRouter API key (get one at https://openrouter.ai)

## 1. Setup Environment (1 min)

```bash
cd backend
cp .env.example .env
```

Edit `.env` and add your OpenRouter API key:
```
OPENROUTER_API_KEY=your_key_here
```

## 2. Install Dependencies (2 min)

```bash
npm install
```

## 3. Start Development Server (< 1 min)

```bash
npm run dev
```

You should see:
```
Server running on http://0.0.0.0:8001
```

## 4. Test It Works (1 min)

In another terminal:

```bash
# Create a conversation
curl -X POST http://localhost:8001/api/conversations

# List conversations
curl http://localhost:8001/api/conversations

# Health check
curl http://localhost:8001/
```

You should see JSON responses.

## 5. Start the Full App

```bash
# From project root
./start.sh
```

This starts both:
- Backend: http://localhost:8001
- Frontend: http://localhost:5173

Open http://localhost:5173 in your browser and start asking questions!

## Available Commands

```bash
# Development (hot-reload)
npm run dev

# Build for production
npm run build

# Run compiled version
npm start

# Run tests
npm test

# Run tests once (CI)
npm run test:run

# Type checking
npx tsc --noEmit
```

## Quick Test: Send a Message

```bash
# 1. Create a conversation
CONV_ID=$(curl -s -X POST http://localhost:8001/api/conversations | jq -r '.id')

# 2. Send a message
curl -X POST http://localhost:8001/api/conversations/$CONV_ID/message \
  -H "Content-Type: application/json" \
  -d '{"content": "What is AI?"}'
```

## Project Structure

```
backend/
├── src/main.ts          # Web app & routes
├── src/config.ts        # Settings
├── src/openrouter.ts    # API client
├── src/storage.ts       # Save conversations
├── src/council.ts       # 3-stage logic
├── package.json         # Dependencies
└── tsconfig.json        # TypeScript settings
```

## Environment Variables

```
OPENROUTER_API_KEY       # Required: Your API key
NODE_ENV                 # Optional: development or production
```

## Troubleshooting

| Issue | Solution |
|-------|----------|
| `OPENROUTER_API_KEY not set` | Add key to `.env` file |
| `Port 8001 already in use` | `kill -9 $(lsof -t -i:8001)` or change port |
| `Module not found` | Run `npm install` |
| `TypeScript errors` | Run `npm run build` to see errors |

## Next Steps

1. **Read the docs**: Check `backend/README.md` for detailed documentation
2. **Run tests**: `npm test` to see test examples
3. **Modify config**: Edit `src/config.ts` to change models
4. **Deploy**: See `backend/README.md` for deployment options

## Need Help?

Check these files:
- `CLAUDE.md` - Technical architecture
- `MIGRATION_SUMMARY.md` - What changed from Python
- `backend/README.md` - Detailed backend docs
- `backend-python/` - Original Python code for reference

---

**That's it!** You're ready to build with the LLM Council.
