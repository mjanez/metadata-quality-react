#!/bin/bash

# Configuration Verification Script
# Checks if mqa-config.json is properly configured for deployment type

set -e

CONFIG_FILE="src/config/mqa-config.json"
RESET='\033[0m'
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'

echo -e "${BLUE}🔍 MQA Configuration Verification${RESET}"
echo "=================================="

if [ ! -f "$CONFIG_FILE" ]; then
    echo -e "${RED}❌ Configuration file not found: $CONFIG_FILE${RESET}"
    exit 1
fi

# Extract current configuration
BACKEND_ENABLED=$(grep -A 5 '"backend_server"' "$CONFIG_FILE" | grep '"enabled"' | grep -o 'true\|false')
DATA_QUALITY_ENABLED=$(grep -A 10 '"data_quality"' "$CONFIG_FILE" | grep '"enabled"' | head -1 | grep -o 'true\|false')

echo -e "Current Configuration:"
echo -e "  backend_server.enabled: ${YELLOW}$BACKEND_ENABLED${RESET}"
echo -e "  data_quality.enabled:   ${YELLOW}$DATA_QUALITY_ENABLED${RESET}"
echo ""

# Determine deployment type based on environment or user input
if [ "$1" = "" ]; then
    echo "Usage: $0 [github-pages|docker|local-dev|static]"
    echo ""
    echo "Or set deployment type automatically:"
    echo "  For GitHub Pages:   $0 github-pages"
    echo "  For Docker:         $0 docker"
    echo "  For Local Dev:      $0 local-dev"
    echo "  For Static Hosting: $0 static"
    echo ""
    exit 0
fi

DEPLOYMENT_TYPE="$1"

# Define expected configurations
case "$DEPLOYMENT_TYPE" in
    "github-pages"|"static")
        EXPECTED_BACKEND="false"
        EXPECTED_DATA_QUALITY="false"
        PLATFORM_NAME="GitHub Pages / Static Hosting"
        REASON="No backend server available"
        ;;
    "docker"|"local-dev")
        EXPECTED_BACKEND="true"
        EXPECTED_DATA_QUALITY="true"
        PLATFORM_NAME="Docker / Local Development"
        REASON="Backend server available"
        ;;
    *)
        echo -e "${RED}❌ Unknown deployment type: $DEPLOYMENT_TYPE${RESET}"
        echo "Valid options: github-pages, docker, local-dev, static"
        exit 1
        ;;
esac

echo -e "${BLUE}📋 Checking for: $PLATFORM_NAME${RESET}"
echo -e "   Reason: $REASON"
echo ""

# Verify configuration
BACKEND_OK="false"
DATA_QUALITY_OK="false"

if [ "$BACKEND_ENABLED" = "$EXPECTED_BACKEND" ]; then
    echo -e "  backend_server.enabled: ${GREEN}✅ $BACKEND_ENABLED (correct)${RESET}"
    BACKEND_OK="true"
else
    echo -e "  backend_server.enabled: ${RED}❌ $BACKEND_ENABLED (should be $EXPECTED_BACKEND)${RESET}"
fi

if [ "$DATA_QUALITY_ENABLED" = "$EXPECTED_DATA_QUALITY" ]; then
    echo -e "  data_quality.enabled:   ${GREEN}✅ $DATA_QUALITY_ENABLED (correct)${RESET}"
    DATA_QUALITY_OK="true"
else
    echo -e "  data_quality.enabled:   ${RED}❌ $DATA_QUALITY_ENABLED (should be $EXPECTED_DATA_QUALITY)${RESET}"
fi

echo ""

# Final verdict
if [ "$BACKEND_OK" = "true" ] && [ "$DATA_QUALITY_OK" = "true" ]; then
    echo -e "${GREEN}🎉 Configuration is correct for $PLATFORM_NAME!${RESET}"
    echo ""
    
    case "$DEPLOYMENT_TYPE" in
        "github-pages")
            echo -e "${BLUE}💡 Deploy with: npm run deploy${RESET}"
            ;;
        "docker")
            echo -e "${BLUE}💡 Deploy with: docker compose up -d${RESET}"
            ;;
        "local-dev")
            echo -e "${BLUE}💡 Start with: ./dev-start.sh${RESET}"
            ;;
        "static")
            echo -e "${BLUE}💡 Build with: npm run build${RESET}"
            ;;
    esac
else
    echo -e "${RED}⚠️  Configuration needs to be fixed!${RESET}"
    echo ""
    echo -e "${YELLOW}Quick fix:${RESET}"
    
    if [ "$BACKEND_OK" != "true" ]; then
        echo -e "  sed -i 's/\"backend_server\":{[^}]*\"enabled\":[^,]*,/\"backend_server\":{\"enabled\":$EXPECTED_BACKEND,/g' $CONFIG_FILE"
    fi
    
    if [ "$DATA_QUALITY_OK" != "true" ]; then
        echo -e "  sed -i 's/\"data_quality\":{[^}]*\"enabled\":[^,]*,/\"data_quality\":{\"enabled\":$EXPECTED_DATA_QUALITY,/g' $CONFIG_FILE"
    fi
    
    echo ""
    echo -e "${BLUE}📖 See full guide: docs/DEPLOYMENT_CONFIG.md${RESET}"
    exit 1
fi

# Additional checks for specific deployment types
case "$DEPLOYMENT_TYPE" in
    "github-pages")
        echo -e "${YELLOW}📝 GitHub Pages Reminders:${RESET}"
        echo "  • Repository must be public"
        echo "  • GitHub Pages must be enabled in repository settings"
        echo "  • Build will use PUBLIC_URL for asset paths"
        ;;
    "docker")
        echo -e "${YELLOW}📝 Docker Deployment Reminders:${RESET}"
        echo "  • Backend will run on port 3001"
        echo "  • Frontend will run on port 3000" 
        echo "  • Nginx proxy will handle routing"
        echo "  • Health checks: curl localhost:3000 && curl localhost:3001/api/health"
        ;;
    "local-dev")
        echo -e "${YELLOW}📝 Local Development Reminders:${RESET}"
        echo "  • Backend URL should be http://localhost:3001/api in .env.local"
        echo "  • Use ./dev-cleanup.sh if ports are occupied"
        echo "  • Both frontend and backend will start automatically"
        ;;
esac

echo ""