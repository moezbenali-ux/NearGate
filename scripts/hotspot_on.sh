#!/bin/bash
# ============================================================
#  NearGate — Activation du mode Hotspot (démo)
#  Usage : sudo bash hotspot_on.sh
# ============================================================

set -euo pipefail

SSID="NearGate-Demo"
PASSWORD="NearGate2026!"
IP="192.168.42.1"
CON_NAME="NearGate-Hotspot"

echo "[NearGate] Activation du hotspot WiFi..."

# Supprimer la connexion si elle existe déjà
nmcli con delete "$CON_NAME" 2>/dev/null || true

# Créer le point d'accès
nmcli con add type wifi ifname wlan0 con-name "$CON_NAME" autoconnect yes ssid "$SSID"
nmcli con modify "$CON_NAME" \
    802-11-wireless.mode ap \
    802-11-wireless.band bg \
    ipv4.method shared \
    ipv4.addresses "${IP}/24" \
    wifi-sec.key-mgmt wpa-psk \
    wifi-sec.psk "$PASSWORD"

# Désactiver la connexion WiFi cliente actuelle
nmcli con down "$(nmcli -t -f NAME,TYPE con show --active | grep wifi | head -1 | cut -d: -f1)" 2>/dev/null || true

# Activer le hotspot
nmcli con up "$CON_NAME"

# Mettre à jour le .env avec la nouvelle URL
ENV_FILE="$(dirname "$0")/../backend/.env"
if [[ -f "$ENV_FILE" ]]; then
    sed -i "s|^BASE_URL=.*|BASE_URL=http://${IP}:8000|" "$ENV_FILE"
fi

# Redémarrer NearGate
systemctl restart neargate 2>/dev/null || systemctl restart neargate-* 2>/dev/null || true

echo ""
echo "✓ Hotspot activé !"
echo ""
echo "  SSID     : ${SSID}"
echo "  Mot de passe : ${PASSWORD}"
echo "  Dashboard : http://${IP}:8000"
echo "  Mobile    : http://${IP}:8000/mobile"
echo ""
echo "  Connectez le téléphone/laptop du prospect au WiFi '${SSID}'"
