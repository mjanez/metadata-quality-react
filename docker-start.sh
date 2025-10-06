#!/bin/sh
set -e

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Logging functions
log_info() {
    echo "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo "${RED}[ERROR]${NC} $1"
}

# Trap signals for graceful shutdown
cleanup() {
    log_warning "Received shutdown signal, cleaning up..."
    if [ ! -z "$BACKEND_PID" ]; then
        log_info "Stopping backend server (PID: $BACKEND_PID)..."
        kill -TERM "$BACKEND_PID" 2>/dev/null || true
        wait "$BACKEND_PID" 2>/dev/null || true
    fi
    if [ ! -z "$FRONTEND_PID" ]; then
        log_info "Stopping frontend server (PID: $FRONTEND_PID)..."
        kill -TERM "$FRONTEND_PID" 2>/dev/null || true
        wait "$FRONTEND_PID" 2>/dev/null || true
    fi
    log_success "Shutdown complete"
    exit 0
}

trap cleanup SIGTERM SIGINT SIGQUIT

# Display startup banner
log_info "================================"
log_info "MQA React Application Startup"
log_info "================================"
log_info "Environment: ${NODE_ENV:-production}"
log_info "Frontend Port: 3000"
log_info "Backend Port: 3001"
log_info "================================"

# Check required files
if [ ! -d "/app/build" ]; then
    log_error "Build directory not found at /app/build"
    exit 1
fi

if [ ! -d "/app/backend" ]; then
    log_error "Backend directory not found at /app/backend"
    exit 1
fi

if [ ! -f "/app/backend/server.js" ]; then
    log_error "Backend server file not found at /app/backend/server.js"
    exit 1
fi

# Start backend server in background
log_info "Starting backend server..."
cd /app/backend
node server.js &
BACKEND_PID=$!

# Wait for backend to be ready
log_info "Waiting for backend to be ready..."
sleep 3

# Check if backend is running
if ! kill -0 "$BACKEND_PID" 2>/dev/null; then
    log_error "Backend failed to start"
    exit 1
fi

# Test backend health
for i in 1 2 3 4 5; do
    if wget -q --spider http://localhost:3001/api/health 2>/dev/null; then
        log_success "Backend server started successfully (PID: $BACKEND_PID)"
        break
    fi
    if [ $i -eq 5 ]; then
        log_warning "Backend health check failed, but continuing..."
        break
    fi
    log_info "Backend not ready yet, waiting... (attempt $i/5)"
    sleep 2
done

# Start frontend server in background
log_info "Starting frontend server..."
cd /app
serve -s build -l 3000 --no-clipboard --no-port-switching &
FRONTEND_PID=$!

# Wait for frontend to be ready
log_info "Waiting for frontend to be ready..."
sleep 2

# Check if frontend is running
if ! kill -0 "$FRONTEND_PID" 2>/dev/null; then
    log_error "Frontend failed to start"
    exit 1
fi

log_success "Frontend server started successfully (PID: $FRONTEND_PID)"

# Display access information
log_info "================================"
log_success "Application started successfully!"
log_info "================================"
log_info "Frontend: http://localhost:3000"
log_info "Backend API: http://localhost:3001/api/health"
log_info "================================"
log_info "Press Ctrl+C to stop the application"
log_info "================================"

# Monitor processes
while true; do
    # Check if backend is still running
    if ! kill -0 "$BACKEND_PID" 2>/dev/null; then
        log_error "Backend process died unexpectedly"
        cleanup
        exit 1
    fi
    
    # Check if frontend is still running
    if ! kill -0 "$FRONTEND_PID" 2>/dev/null; then
        log_error "Frontend process died unexpectedly"
        cleanup
        exit 1
    fi
    
    sleep 10
done