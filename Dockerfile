# Multi-stage build for production deployment
FROM node:20-alpine AS builder

# Build arguments
ARG PUBLIC_URL=/
ARG NODE_ENV=production

# Set working directory
WORKDIR /app

# Install build dependencies
RUN apk add --no-cache python3 make g++

# Copy package files for root project
COPY package*.json ./

# Install root dependencies first
RUN npm ci

# Copy backend package files
COPY backend/package*.json ./backend/

# Install backend dependencies
RUN cd backend && npm ci --only=production

# Copy source code
COPY . .

# Set environment variables for build
ENV NODE_OPTIONS="--max-old-space-size=4096"
ENV PUBLIC_URL=${PUBLIC_URL}
ENV NODE_ENV=${NODE_ENV}
ENV GENERATE_SOURCEMAP=false

# Build the React app for production (using build:docker script that respects PUBLIC_URL env var)
RUN npm run build:docker

# Production stage
FROM node:20-alpine AS production

WORKDIR /app

# Install runtime dependencies
RUN apk add --no-cache curl tini

# Copy built React app
COPY --from=builder /app/build ./build

# Copy backend
COPY --from=builder /app/backend ./backend
COPY --from=builder /app/backend/node_modules ./backend/node_modules

# Install serve to serve static files
RUN npm install -g serve@14

# Copy startup script
COPY docker-start.sh ./
RUN chmod +x docker-start.sh

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001 && \
    chown -R nodejs:nodejs /app

# Switch to non-root user
USER nodejs

# Health check for both services
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD curl -f http://localhost:3000/ && curl -f http://localhost:3001/api/health || exit 1

# Use tini to handle signals properly
ENTRYPOINT ["/sbin/tini", "--"]

# Start both frontend and backend
CMD ["./docker-start.sh"]