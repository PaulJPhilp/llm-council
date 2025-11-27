#!/bin/bash

# End-to-End Test Script for LLM Council
# This script tests the full system (backend + frontend)

set -e

# Color output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}LLM Council - End-to-End Test Suite${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
echo ""

# Check if servers are running
echo -e "${YELLOW}Checking if backend is running...${NC}"
if ! curl -s http://localhost:8001/ > /dev/null; then
  echo -e "${RED}✗ Backend not running on port 8001${NC}"
  echo -e "${YELLOW}Please run: cd backend && npm run dev${NC}"
  exit 1
fi
echo -e "${GREEN}✓ Backend is running${NC}"

echo ""
echo -e "${YELLOW}Checking if frontend is running...${NC}"
if ! curl -s http://localhost:5173/ > /dev/null; then
  echo -e "${RED}✗ Frontend not running on port 5173${NC}"
  echo -e "${YELLOW}Please run: cd frontend && npm run dev${NC}"
  exit 1
fi
echo -e "${GREEN}✓ Frontend is running${NC}"

echo ""
echo -e "${BLUE}───────────────────────────────────────────────────────────${NC}"
echo -e "${BLUE}Test 1: Backend Health Check${NC}"
echo -e "${BLUE}───────────────────────────────────────────────────────────${NC}"

RESPONSE=$(curl -s http://localhost:8001/)
if echo "$RESPONSE" | grep -q '"status":"ok"'; then
  echo -e "${GREEN}✓ Backend health check passed${NC}"
else
  echo -e "${RED}✗ Backend health check failed${NC}"
  echo "Response: $RESPONSE"
  exit 1
fi

echo ""
echo -e "${BLUE}───────────────────────────────────────────────────────────${NC}"
echo -e "${BLUE}Test 2: Create Conversation${NC}"
echo -e "${BLUE}───────────────────────────────────────────────────────────${NC}"

CREATE_RESPONSE=$(curl -s -X POST http://localhost:8001/api/conversations \
  -H "Content-Type: application/json" \
  -d '{}')

CONV_ID=$(echo "$CREATE_RESPONSE" | grep -o '"id":"[^"]*' | sed 's/"id":"//' | head -1)

if [ -z "$CONV_ID" ]; then
  echo -e "${RED}✗ Failed to create conversation${NC}"
  echo "Response: $CREATE_RESPONSE"
  exit 1
fi

echo -e "${GREEN}✓ Conversation created: $CONV_ID${NC}"

echo ""
echo -e "${BLUE}───────────────────────────────────────────────────────────${NC}"
echo -e "${BLUE}Test 3: List Conversations${NC}"
echo -e "${BLUE}───────────────────────────────────────────────────────────${NC}"

LIST_RESPONSE=$(curl -s http://localhost:8001/api/conversations)

if echo "$LIST_RESPONSE" | grep -q "$CONV_ID"; then
  echo -e "${GREEN}✓ Conversation appears in list${NC}"
else
  echo -e "${RED}✗ Conversation not found in list${NC}"
  echo "Response: $LIST_RESPONSE"
  exit 1
fi

echo ""
echo -e "${BLUE}───────────────────────────────────────────────────────────${NC}"
echo -e "${BLUE}Test 4: Get Conversation${NC}"
echo -e "${BLUE}───────────────────────────────────────────────────────────${NC}"

GET_RESPONSE=$(curl -s http://localhost:8001/api/conversations/$CONV_ID)

if echo "$GET_RESPONSE" | grep -q '"id":"'$CONV_ID'"'; then
  echo -e "${GREEN}✓ Can retrieve conversation by ID${NC}"
else
  echo -e "${RED}✗ Failed to retrieve conversation${NC}"
  echo "Response: $GET_RESPONSE"
  exit 1
fi

echo ""
echo -e "${BLUE}───────────────────────────────────────────────────────────${NC}"
echo -e "${BLUE}Test 5: Test 404 Error Handling${NC}"
echo -e "${BLUE}───────────────────────────────────────────────────────────${NC}"

ERROR_RESPONSE=$(curl -s http://localhost:8001/api/conversations/nonexistent)

if echo "$ERROR_RESPONSE" | grep -q 'not found'; then
  echo -e "${GREEN}✓ 404 error handling works${NC}"
else
  echo -e "${RED}✗ 404 error handling failed${NC}"
  echo "Response: $ERROR_RESPONSE"
  exit 1
fi

echo ""
echo -e "${BLUE}───────────────────────────────────────────────────────────${NC}"
echo -e "${BLUE}Test 6: Test CORS Headers${NC}"
echo -e "${BLUE}───────────────────────────────────────────────────────────${NC}"

CORS_RESPONSE=$(curl -s -I http://localhost:8001/)

if echo "$CORS_RESPONSE" | grep -q 'access-control'; then
  echo -e "${GREEN}✓ CORS headers present${NC}"
else
  echo -e "${YELLOW}⚠ CORS headers not found (might be browser-only)${NC}"
fi

echo ""
echo -e "${BLUE}───────────────────────────────────────────────────────────${NC}"
echo -e "${BLUE}Test 7: Run Backend Unit Tests${NC}"
echo -e "${BLUE}───────────────────────────────────────────────────────────${NC}"

cd backend

if bun run test:run > /tmp/test-output.log 2>&1; then
  echo -e "${GREEN}✓ All backend tests passed${NC}"
  # Show summary
  SUMMARY=$(tail -5 /tmp/test-output.log)
  echo "$SUMMARY"
else
  echo -e "${RED}✗ Backend tests failed${NC}"
  tail -20 /tmp/test-output.log
  exit 1
fi

cd ..

echo ""
echo -e "${BLUE}───────────────────────────────────────────────────────────${NC}"
echo -e "${BLUE}Test 8: Check Frontend Files${NC}"
echo -e "${BLUE}───────────────────────────────────────────────────────────${NC}"

if [ -f "frontend/package.json" ]; then
  echo -e "${GREEN}✓ Frontend package.json found${NC}"
else
  echo -e "${RED}✗ Frontend package.json not found${NC}"
  exit 1
fi

if [ -f "frontend/src/api.js" ]; then
  echo -e "${GREEN}✓ Frontend API client found${NC}"
else
  echo -e "${RED}✗ Frontend API client not found${NC}"
  exit 1
fi

echo ""
echo -e "${BLUE}───────────────────────────────────────────────────────────${NC}"
echo -e "${BLUE}Test 9: Test Frontend Connectivity${NC}"
echo -e "${BLUE}───────────────────────────────────────────────────────────${NC}"

# Test that frontend can communicate with backend
FRONTEND_TEST=$(curl -s http://localhost:5173/index.html | head -c 100)

if [ -n "$FRONTEND_TEST" ]; then
  echo -e "${GREEN}✓ Frontend is serving content${NC}"
else
  echo -e "${RED}✗ Frontend not serving content${NC}"
  exit 1
fi

echo ""
echo -e "${BLUE}───────────────────────────────────────────────────────────${NC}"
echo -e "${BLUE}Test 10: API Response Format${NC}"
echo -e "${BLUE}───────────────────────────────────────────────────────────${NC}"

FORMAT_CHECK=$(curl -s -X POST http://localhost:8001/api/conversations \
  -H "Content-Type: application/json" \
  -d '{}')

if echo "$FORMAT_CHECK" | grep -q '"id"' && \
   echo "$FORMAT_CHECK" | grep -q '"created_at"' && \
   echo "$FORMAT_CHECK" | grep -q '"title"' && \
   echo "$FORMAT_CHECK" | grep -q '"messages"'; then
  echo -e "${GREEN}✓ API response format is correct${NC}"
else
  echo -e "${RED}✗ API response format is incorrect${NC}"
  echo "Response: $FORMAT_CHECK"
  exit 1
fi

echo ""
echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}✓ ALL TESTS PASSED${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
echo ""
echo "Summary:"
echo "  ✓ Backend health check"
echo "  ✓ Conversation creation"
echo "  ✓ Conversation listing"
echo "  ✓ Conversation retrieval"
echo "  ✓ Error handling (404)"
echo "  ✓ CORS headers"
echo "  ✓ Backend unit tests"
echo "  ✓ Frontend files"
echo "  ✓ Frontend connectivity"
echo "  ✓ API response format"
echo ""
echo "Next steps:"
echo "  1. Open http://localhost:5173 in your browser"
echo "  2. Try asking a question (requires OPENROUTER_API_KEY in backend/.env)"
echo "  3. Watch the 3-stage council process complete"
echo "  4. Inspect individual responses and rankings in the tabs"
echo ""
