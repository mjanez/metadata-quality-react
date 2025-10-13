#!/bin/bash
# Development startup script for local environment
# This script starts both frontend and backend servers for development

echo "Starting Metadata Quality Assessment Tool - Development Mode"
echo ""

# Cleanup function for graceful shutdown
cleanup() {
    echo ""
    echo "🛑 Shutting down servers..."
    if [ ! -z "$BACKEND_PID" ]; then
        kill $BACKEND_PID 2>/dev/null || true
    fi
    pkill -f "node.*server.js" 2>/dev/null || true
    sleep 1
    echo "✅ Development servers stopped"
    exit 0
}

# Set trap to cleanup on script exit
trap cleanup SIGINT SIGTERM EXIT

# Check if Node.js is available
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed or not in PATH"
    echo "Please install Node.js 16+ and try again"
    exit 1
fi

if ! command -v npm &> /dev/null; then
    echo "❌ npm is not installed or not in PATH"
    echo "Please install npm and try again"
    exit 1
fi

echo "✅ Node.js version: $(node --version)"
echo "✅ npm version: $(npm --version)"
echo ""

# Install dependencies if needed
echo "📦 Checking dependencies..."

if [ ! -d "node_modules" ]; then
    echo "Installing frontend dependencies..."
    npm install
fi

if [ ! -d "backend/node_modules" ]; then
    echo "Installing backend dependencies..."
    cd backend
    npm install
    cd ..
fi

echo "✅ Dependencies ready"
echo ""

# Load environment variables from .env.local
if [ -f ".env.local" ]; then
    echo "📋 Loading environment variables from .env.local"
    export $(grep -v '^#' .env.local | xargs)
    # Ensure PORT matches FRONTEND_PORT for consistency
    export PORT=${FRONTEND_PORT:-${PORT:-3000}}
else
    echo "⚠️  .env.local not found, using default ports"
    export BACKEND_PORT=3001
    export FRONTEND_PORT=3000
    export PORT=${FRONTEND_PORT}
fi

echo "🔧 Configuration:"
echo "   Backend port: ${BACKEND_PORT}"
echo "   Frontend port: ${PORT}"
echo "   Backend URL: ${REACT_APP_BACKEND_URL:-http://localhost:$BACKEND_PORT/api}"
echo ""
echo "💡 If ports are occupied, run './dev-cleanup.sh' first"
echo ""

# Start backend server in background
echo "🚀 Starting backend server on port ${BACKEND_PORT}..."
(cd backend && PORT=${BACKEND_PORT} NODE_TLS_REJECT_UNAUTHORIZED=${NODE_TLS_REJECT_UNAUTHORIZED:-1} node server.js) &
BACKEND_PID=$!

# Wait a moment for backend to start
sleep 5

# Check if backend is running
if curl -s http://localhost:${BACKEND_PORT}/api/health > /dev/null; then
    echo "✅ Backend server running at http://localhost:${BACKEND_PORT}"
else
    echo "⚠️  Backend server may not be ready yet..."
fi

echo ""

# Start frontend server
echo "🚀 Starting frontend development server..."
echo ""
echo "🌐 Application URLs:"
echo "   Frontend: http://localhost:${PORT}"
echo "   Backend:  http://localhost:${BACKEND_PORT}/api"
echo "   Health:   http://localhost:${BACKEND_PORT}/api/health"
echo ""
echo "Press Ctrl+C to stop both servers"

# Start frontend (this will block the terminal)
npm start