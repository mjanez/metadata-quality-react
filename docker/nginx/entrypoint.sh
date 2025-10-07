#!/bin/sh
set -e

# Default values
BACKEND_PORT=${BACKEND_PORT:-3001}
FRONTEND_PORT=${FRONTEND_PORT:-3000}

# Generate nginx.conf from template
echo "Generating nginx.conf with:"
echo "  BACKEND_PORT=${BACKEND_PORT}"
echo "  FRONTEND_PORT=${FRONTEND_PORT}"

# Use envsubst to replace variables in template
envsubst '${BACKEND_PORT} ${FRONTEND_PORT}' < /etc/nginx/nginx.conf.template > /etc/nginx/nginx.conf

# Verify nginx configuration
nginx -t

# Start nginx
exec nginx -g 'daemon off;'
