#!/bin/bash
# ============================================================
#  NearGate — Build frontend et déploiement vers backend/static/
#  Usage : bash build_and_deploy.sh
# ============================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FRONTEND_DIR="$SCRIPT_DIR/frontend"
DIST_DIR="$FRONTEND_DIR/dist"
STATIC_DIR="$SCRIPT_DIR/backend/static"

echo "[1/3] Build du frontend React..."
cd "$FRONTEND_DIR"
npm run build

echo "[2/3] Nettoyage de backend/static/..."
rm -rf "$STATIC_DIR"
mkdir -p "$STATIC_DIR"

echo "[3/3] Copie de frontend/dist/ vers backend/static/..."
cp -r "$DIST_DIR/." "$STATIC_DIR/"

echo ""
echo "✓ Build déployé"
