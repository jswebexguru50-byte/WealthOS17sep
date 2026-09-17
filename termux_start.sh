#!/data/data/com.termux/files/usr/bin/bash
# ── NRI WealthOS — Fast Termux Start Script for Samsung Galaxy S24 Ultra ──
echo "========================================================"
echo " 🚀 Starting NRI WealthOS on Samsung Galaxy S24 Ultra..."
echo "========================================================"

cd "$(dirname "$0")"

# Check if node is installed
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed in Termux!"
    echo "👉 Run: pkg install nodejs-lts"
    exit 1
fi

# Set optimal production & performance environment variables for ARM64
export NODE_ENV=production
export PORT=3000
export UV_THREADPOOL_SIZE=4
export NODE_OPTIONS="--max-old-space-size=512"

echo "📱 Server running at: http://localhost:3000"
echo "🌐 Open Chrome or Samsung Internet on your phone and go to:"
echo "   👉 http://localhost:3000"
echo "--------------------------------------------------------"
echo "Press Ctrl+C to stop the server."
echo ""

node dist/server.cjs
