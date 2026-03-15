#!/bin/bash
# ============================================================
#  NearGate — Retour en mode WiFi client normal
#  Usage : sudo bash hotspot_off.sh [SSID] [PASSWORD]
# ============================================================

set -euo pipefail

CON_NAME="NearGate-Hotspot"
WIFI_SSID="${1:-}"
WIFI_PASS="${2:-}"

echo "[NearGate] Désactivation du hotspot..."

# Désactiver le hotspot
nmcli con down "$CON_NAME" 2>/dev/null || true
nmcli con delete "$CON_NAME" 2>/dev/null || true

# Se reconnecter au WiFi si SSID fourni
if [[ -n "$WIFI_SSID" && -n "$WIFI_PASS" ]]; then
    echo "[NearGate] Connexion au WiFi '${WIFI_SSID}'..."
    nmcli dev wifi connect "$WIFI_SSID" password "$WIFI_PASS"

    # Attendre l'IP
    sleep 5
    NEW_IP=$(hostname -I | awk '{print $1}')
    echo "[NearGate] Nouvelle IP : ${NEW_IP}"

    # Mettre à jour le .env
    ENV_FILE="$(dirname "$0")/../backend/.env"
    if [[ -f "$ENV_FILE" ]]; then
        sed -i "s|^BASE_URL=.*|BASE_URL=http://${NEW_IP}:8000|" "$ENV_FILE"
    fi
else
    echo "[!] SSID non fourni — reconnexion WiFi manuelle nécessaire"
    echo "    Usage : sudo bash hotspot_off.sh MON_SSID MON_PASSWORD"
fi

systemctl restart neargate 2>/dev/null || systemctl restart neargate-* 2>/dev/null || true

echo "✓ Mode WiFi client restauré"
