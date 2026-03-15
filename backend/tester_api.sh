#!/bin/bash
# Script de test de l'API NearGate
# Usage : bash tester_api.sh
# Edite les 3 variables ci-dessous avant de lancer

API_URL="http://localhost:8000"
API_KEY="change-moi-avant-deploiement"   # ← même valeur que dans .env
UUID_TEST="aabbccdd-0011-2233-4455-667788990011"

echo ""
echo "╔══════════════════════════════════════╗"
echo "║     NearGate — Test de l'API REST    ║"
echo "╚══════════════════════════════════════╝"
echo ""

# ── 1. Ping (sans auth) ────────────────────────────────────────────────────
echo "▶ 1. Ping (sans authentification)"
curl -s "$API_URL/ping" | python3 -m json.tool
echo ""

# ── 2. Liste badges (vide au départ) ──────────────────────────────────────
echo "▶ 2. Liste des badges (doit être vide)"
curl -s -H "X-API-Key: $API_KEY" "$API_URL/badges" | python3 -m json.tool
echo ""

# ── 3. Ajout d'un badge ───────────────────────────────────────────────────
echo "▶ 3. Ajout d'un badge de test"
curl -s -X POST "$API_URL/badges" \
  -H "X-API-Key: $API_KEY" \
  -H "Content-Type: application/json" \
  -d "{\"uuid\": \"$UUID_TEST\", \"nom\": \"Badge Test\"}" | python3 -m json.tool
echo ""

# ── 4. Liste badges (1 badge attendu) ─────────────────────────────────────
echo "▶ 4. Liste des badges (doit contenir 1 badge)"
curl -s -H "X-API-Key: $API_KEY" "$API_URL/badges" | python3 -m json.tool
echo ""

# ── 5. Config par défaut ──────────────────────────────────────────────────
echo "▶ 5. Configuration (seuil RSSI et confirmations)"
curl -s -H "X-API-Key: $API_KEY" "$API_URL/config" | python3 -m json.tool
echo ""

# ── 6. Modification du seuil RSSI ─────────────────────────────────────────
echo "▶ 6. Modification du seuil RSSI à -75 dBm"
curl -s -X PUT "$API_URL/config/rssi_seuil" \
  -H "X-API-Key: $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"valeur": "-75"}' | python3 -m json.tool
echo ""

# ── 7. Historique événements (vide) ───────────────────────────────────────
echo "▶ 7. Historique des passages (vide avant simulation MQTT)"
curl -s -H "X-API-Key: $API_KEY" "$API_URL/evenements" | python3 -m json.tool
echo ""

# ── 8. Test authentification refusée ──────────────────────────────────────
echo "▶ 8. Test avec mauvaise clé API (doit retourner 401)"
curl -s -H "X-API-Key: MAUVAISE_CLE" "$API_URL/badges" | python3 -m json.tool
echo ""

echo "═══════════════════════════════════════════"
echo "UUID de test à utiliser pour la simulation :"
echo "  $UUID_TEST"
echo ""
echo "Lance ensuite :"
echo "  python simuler_esp32.py --uuid $UUID_TEST --rssi -65"
echo "═══════════════════════════════════════════"
