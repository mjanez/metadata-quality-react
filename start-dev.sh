#!/bin/bash
# Development startup script with backend support

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${BLUE}================================${NC}"
echo -e "${BLUE}MQA Development Environment${NC}"
echo -e "${BLUE}================================${NC}"
echo ""

# Check if backend should be started
if [ "$1" == "--with-backend" ]; then
    echo -e "${GREEN}Starting backend server...${NC}"
    cd backend
    if [ ! -d "node_modules" ]; then
        echo -e "${YELLOW}Installing backend dependencies...${NC}"
        npm install
    fi
    npm start &
    BACKEND_PID=$!
    cd ..
    
    echo -e "${GREEN}Backend started on http://localhost:3001${NC}"
    echo -e "${YELLOW}Backend PID: $BACKEND_PID${NC}"
    echo ""
    
    # Wait for backend to be ready
    echo -e "${YELLOW}Waiting for backend to be ready...${NC}"
    sleep 3
fi

# Check if node_modules exists
if [ ! -d "node_modules" ]; then
    echo -e "${YELLOW}Installing dependencies...${NC}"
    npm install
fi

echo -e "${GREEN}Starting frontend development server...${NC}"
echo -e "${BLUE}Frontend: http://localhost:3000${NC}"
if [ "$1" == "--with-backend" ]; then
    echo -e "${BLUE}Backend:  http://localhost:3001${NC}"
fi
echo ""

# Suppress webpack deprecation warnings
NODE_OPTIONS="--no-deprecation" npm start

# Cleanup on exit
if [ ! -z "$BACKEND_PID" ]; then
    echo ""
    echo -e "${YELLOW}Stopping backend server...${NC}"
    kill $BACKEND_PID 2>/dev/null
fi