#!/bin/sh
set -e

# Default values
BACKEND_PORT=${BACKEND_PORT:-3001}
FRONTEND_PORT=${FRONTEND_PORT:-3000}
BACKEND_HOST=${BACKEND_HOST:-mqa-backend}
FRONTEND_HOST=${FRONTEND_HOST:-mqa-frontend}

echo "Generating nginx.conf with:"
echo "  BACKEND_HOST=${BACKEND_HOST}"
echo "  BACKEND_PORT=${BACKEND_PORT}"
echo "  FRONTEND_HOST=${FRONTEND_HOST}"
echo "  FRONTEND_PORT=${FRONTEND_PORT}"

envsubst '${BACKEND_HOST} ${BACKEND_PORT} ${FRONTEND_HOST} ${FRONTEND_PORT}' < /etc/nginx/nginx.conf.template > /etc/nginx/nginx.conf

nginx -t

exec nginx -g 'daemon off;'
