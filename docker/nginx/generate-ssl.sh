#!/bin/bash

# Script to generate self-signed SSL certificates for local development
# These certificates are intended for testing purposes only
# For production, replace with valid certificates from a Certificate Authority

set -e

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${BLUE}================================${NC}"
echo -e "${BLUE}SSL Certificate Generator${NC}"
echo -e "${BLUE}================================${NC}"
echo ""

# Create SSL directory if it doesn't exist
SSL_DIR="docker/nginx/ssl"
mkdir -p "$SSL_DIR"

# Certificate details
CERT_FILE="$SSL_DIR/mqa_local.crt"
KEY_FILE="$SSL_DIR/mqa_local.key"
DAYS=365

echo -e "${YELLOW}Generating self-signed SSL certificate...${NC}"
echo ""

# Generate certificate
openssl req -x509 -nodes -days $DAYS -newkey rsa:2048 \
  -keyout "$KEY_FILE" \
  -out "$CERT_FILE" \
  -subj "/C=ES/ST=Madrid/L=Madrid/O=Development/CN=localhost" \
  2>/dev/null

# Set appropriate permissions
chmod 600 "$KEY_FILE"
chmod 644 "$CERT_FILE"

echo -e "${GREEN}✓ Certificate generated successfully!${NC}"
echo ""
echo -e "${BLUE}Certificate details:${NC}"
echo "  Certificate: $CERT_FILE"
echo "  Private Key: $KEY_FILE"
echo "  Valid for: $DAYS days"
echo ""

# Display certificate information
echo -e "${BLUE}Certificate information:${NC}"
openssl x509 -in "$CERT_FILE" -noout -subject -dates -issuer 2>/dev/null | sed 's/^/  /'
echo ""

echo -e "${YELLOW}⚠  IMPORTANT:${NC}"
echo "  - This is a self-signed certificate for LOCAL DEVELOPMENT only"
echo "  - Browsers will show a security warning (this is expected)"
echo "  - For PRODUCTION, replace with a valid certificate from a CA"
echo ""

echo -e "${GREEN}Next steps:${NC}"
echo "  1. Start services: ${BLUE}docker-compose --profile production up -d${NC}"
echo "  2. Access via HTTPS: ${BLUE}https://localhost${NC}"
echo "  3. Accept the browser security warning for localhost"
echo ""

echo -e "${BLUE}To generate production certificates:${NC}"
echo "  - Use Let's Encrypt: https://letsencrypt.org/"
echo "  - Replace files in docker/nginx/ssl/"
echo "  - Restart nginx: ${BLUE}docker-compose restart nginx${NC}"
echo ""
