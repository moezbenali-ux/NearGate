#!/bin/bash
# ============================================================
#  NearGate — Build frontend et déploiement vers backend/static/
#  Vite écrit directement dans backend/static/ (outDir configuré
#  dans vite.config.js) et nettoie le dossier avant chaque build.
#  Usage : bash build_and_deploy.sh
# ============================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

cd "$SCRIPT_DIR/frontend"
npm run build

echo ""
echo "✓ Build déployé"
