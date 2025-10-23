#!/bin/sh
set -e

echo "Starting MQA React Application..."

# Configuration file path
CONFIG_FILE="/app/build/config/mqa-config.json"

# Check if config file exists
if [ -f "$CONFIG_FILE" ]; then
    echo "Checking configuration..."
    
    # Use jq if available, otherwise use grep (simpler and more reliable)
    if command -v jq >/dev/null 2>&1; then
        BACKEND_ENABLED=$(jq -r '.backend_server.enabled' "$CONFIG_FILE" 2>/dev/null || echo "false")
        DATA_QUALITY_ENABLED=$(jq -r '.data_quality.enabled' "$CONFIG_FILE" 2>/dev/null || echo "false")
    else
        # Fallback to grep (extract first occurrence of enabled after backend_server)
        BACKEND_ENABLED=$(awk '/\"backend_server\"/{found=1} found && /\"enabled\"/{print; exit}' "$CONFIG_FILE" | grep -o 'true\|false' || echo "false")
        DATA_QUALITY_ENABLED=$(awk '/\"data_quality\"/{found=1} found && /\"enabled\"/{print; exit}' "$CONFIG_FILE" | grep -o 'true\|false' || echo "false")
    fi
    
    echo "   Current backend_server.enabled: $BACKEND_ENABLED"
    echo "   Current data_quality.enabled: $DATA_QUALITY_ENABLED"
    
    # Auto-fix if backend features are disabled
    if [ "$BACKEND_ENABLED" = "false" ] || [ "$DATA_QUALITY_ENABLED" = "false" ]; then
        echo "⚠️  Backend features are disabled in config!"
        echo "Auto-enabling backend features for Docker deployment..."
        
        # Create backup
        cp "$CONFIG_FILE" "$CONFIG_FILE.bak"
        
        if command -v jq >/dev/null 2>&1; then
            # Use jq for precise JSON modification
            jq '.backend_server.enabled = true | .data_quality.enabled = true' "$CONFIG_FILE" > "$CONFIG_FILE.tmp" && \
            mv "$CONFIG_FILE.tmp" "$CONFIG_FILE"
        else
            # Fallback: Use awk to change first "enabled": false to true in each section
            awk '
                /\"backend_server\"/{bs=1} 
                bs && /\"enabled\": false/ && !bs_done {
                    sub(/"enabled": false/, "\"enabled\": true"); 
                    bs_done=1
                }
                /\"data_quality\"/{dq=1; bs=0} 
                dq && /\"enabled\": false/ && !dq_done {
                    sub(/"enabled": false/, "\"enabled\": true"); 
                    dq_done=1
                }
                {print}
            ' "$CONFIG_FILE" > "$CONFIG_FILE.tmp" && mv "$CONFIG_FILE.tmp" "$CONFIG_FILE"
        fi
        
        echo "✅ Configuration updated successfully!"
        echo "   backend_server.enabled: true"
        echo "   data_quality.enabled: true"
        echo "   (Original config backed up as mqa-config.json.bak)"
    else
        echo "✅ Configuration is correct for Docker deployment"
    fi
else
    echo "⚠️  Configuration file not found at $CONFIG_FILE"
    echo "   Using default configuration from build"
fi

echo ""
echo "Services..."
echo "   Frontend: http://localhost:${FRONTEND_PORT:-3000}"
echo "   Backend:  http://localhost:${BACKEND_PORT:-3001}"
echo ""

# Execute the main command (start both frontend and backend)
exec "$@"
