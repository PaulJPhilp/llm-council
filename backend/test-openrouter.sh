#!/bin/bash

# Test OpenRouter API connectivity
# Reads API key from .env file

cd "$(dirname "$0")"

# Load .env file
if [ -f .env ]; then
  export $(grep -v '^#' .env | xargs)
else
  echo "Error: .env file not found"
  exit 1
fi

# Check if API key is set
if [ -z "$OPENROUTER_API_KEY" ]; then
  echo "Error: OPENROUTER_API_KEY not set in .env file"
  exit 1
fi

echo "Testing OpenRouter API..."
echo "Using API key: ${OPENROUTER_API_KEY:0:10}...${OPENROUTER_API_KEY: -4}"
echo ""

# Test with a simple model
curl -s https://openrouter.ai/api/v1/chat/completions \
  -H "Authorization: Bearer $OPENROUTER_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"model": "openai/gpt-4o-mini", "messages": [{"role": "user", "content": "Say hello"}], "max_tokens": 10}' \
  | jq '.' 2>/dev/null || curl -s https://openrouter.ai/api/v1/chat/completions \
  -H "Authorization: Bearer $OPENROUTER_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"model": "openai/gpt-4o-mini", "messages": [{"role": "user", "content": "Say hello"}], "max_tokens": 10}'

echo ""

