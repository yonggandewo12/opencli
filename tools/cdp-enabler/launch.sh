#!/bin/bash
# Launch Feishu/Lark with CDP remote debugging enabled.
#
# Usage:
#   ./launch.sh              # Default port 9222
#   ./launch.sh 9333         # Custom port
#   CDP_ENABLER_DELAY=10 ./launch.sh  # Custom delay before enabling

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
DYLIB="$SCRIPT_DIR/cdp_enabler.dylib"
FEISHU_APP="/Applications/Lark.app/Contents/MacOS/Feishu"
PORT="${1:-9222}"

# Build dylib if needed
if [ ! -f "$DYLIB" ]; then
    echo "Building cdp_enabler.dylib..."
    make -C "$SCRIPT_DIR"
fi

# Kill existing Feishu
echo "Stopping Feishu..."
osascript -e 'tell application "Lark" to quit' 2>/dev/null || true
sleep 2
killall Feishu 2>/dev/null || true
sleep 1

echo "Launching Feishu with CDP on port $PORT..."
CDP_PORT="$PORT" DYLD_INSERT_LIBRARIES="$DYLIB" "$FEISHU_APP" &
APP_PID=$!

echo "Feishu PID: $APP_PID"
echo "Waiting for CDP to become available..."

# Poll for CDP availability
for i in $(seq 1 30); do
    sleep 1
    if curl -s --connect-timeout 1 "http://127.0.0.1:$PORT/json/version" >/dev/null 2>&1; then
        echo ""
        echo "✅ CDP is available!"
        echo ""
        curl -s "http://127.0.0.1:$PORT/json/version" | python3 -m json.tool 2>/dev/null || \
            curl -s "http://127.0.0.1:$PORT/json/version"
        echo ""
        echo "WebSocket endpoint: ws://127.0.0.1:$PORT"
        echo "DevTools targets:   http://127.0.0.1:$PORT/json/list"
        echo ""
        echo "Connect with opencli:"
        echo "  OPENCLI_CDP_ENDPOINT=ws://127.0.0.1:$PORT opencli feishu status"
        exit 0
    fi
    printf "."
done

echo ""
echo "❌ CDP did not become available after 30 seconds"
echo "Check stderr output above for errors"
exit 1
