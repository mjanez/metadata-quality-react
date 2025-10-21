#!/bin/bash
# Cleanup script to stop any running development servers

echo "🧹 Cleaning up development servers..."

# Load ports from .env.local if available
BACKEND_PORT=3001
FRONTEND_PORT=3000

if [ -f ".env.local" ]; then
    echo "📋 Loading port configuration from .env.local"
    # Extract port values safely
    if grep -q "BACKEND_PORT=" .env.local; then
        BACKEND_PORT=$(grep "BACKEND_PORT=" .env.local | cut -d'=' -f2 | tr -d ' ')
    fi
    if grep -q "FRONTEND_PORT=" .env.local; then
        FRONTEND_PORT=$(grep "FRONTEND_PORT=" .env.local | cut -d'=' -f2 | tr -d ' ')
    fi
    echo "   Backend port: $BACKEND_PORT"
    echo "   Frontend port: $FRONTEND_PORT"
else
    echo "📋 Using default ports (no .env.local found)"
    echo "   Backend port: $BACKEND_PORT (default)"
    echo "   Frontend port: $FRONTEND_PORT (default)"
fi

echo ""

# Function to kill process on specific port
kill_port() {
    local port=$1
    local description=$2
    echo "🔍 Checking port $port ($description)..."
    
    if command -v lsof &> /dev/null; then
        local pids=$(lsof -ti :$port 2>/dev/null)
        if [ ! -z "$pids" ]; then
            echo "   🔪 Killing processes on port $port: $pids"
            kill -9 $pids 2>/dev/null || true
            sleep 1
            # Verify the kill worked
            local remaining=$(lsof -ti :$port 2>/dev/null)
            if [ -z "$remaining" ]; then
                echo "   ✅ Port $port is now free"
            else
                echo "   ⚠️  Some processes still remain on port $port"
            fi
        else
            echo "   ✅ Port $port is already free"
        fi
    else
        echo "   ⚠️  lsof not available, using pkill fallback"
        pkill -f "node.*server.js" 2>/dev/null || true
        pkill -f ":$port" 2>/dev/null || true
    fi
}

# Kill configured ports from .env.local
kill_port $FRONTEND_PORT "Frontend/React"
kill_port $BACKEND_PORT "Backend/Express"

# Kill some common alternative ports just in case
if [ "$BACKEND_PORT" != "3002" ]; then
    kill_port 3002 "Alternative backend"
fi

# Kill any node processes that might be dev servers
pkill -f "react-scripts start" 2>/dev/null || true
pkill -f "npm start" 2>/dev/null || true

echo "✅ Cleanup completed"
echo ""
echo "You can now run ./dev-start.sh safely"