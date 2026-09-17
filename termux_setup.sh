#!/data/data/com.termux/files/usr/bin/bash
# ── NRI WealthOS — One-Step Termux Setup for Samsung S24 Ultra ──
echo "========================================================"
echo " 📦 Setting up NRI WealthOS on Samsung S24 Ultra..."
echo "========================================================"

cd "$(dirname "$0")"

echo "1. Checking/Updating Termux packages..."
pkg update -y || true

echo "2. Installing Node.js LTS and SQLite..."
pkg install -y nodejs-lts sqlite python || true

echo "3. Installing production dependencies..."
npm install --omit=dev --no-audit --no-fund

chmod +x termux_start.sh

echo "========================================================"
echo " ✅ Setup Complete! Starting app now..."
echo "========================================================"
./termux_start.sh
