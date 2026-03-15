#!/bin/bash
# ============================================================
#  NearGate — Configuration hotspot WiFi permanent
#
#  wlan0 → Point d'accès "NearGate" (ESP32 + démo)
#  eth0  → Internet (réseau client, DHCP)
#
#  Usage : sudo bash setup_hotspot_permanent.sh
# ============================================================

set -euo pipefail

SSID="NearGate"
PASSWORD="NearGate2026!"
IP="192.168.42.1"
CON_NAME="NearGate-AP"

echo "[NearGate] Configuration du hotspot permanent..."

# Supprimer les anciennes connexions hotspot
nmcli con delete "$CON_NAME"          2>/dev/null || true
nmcli con delete "NearGate-Hotspot"   2>/dev/null || true

# Créer le point d'accès permanent sur wlan0
nmcli con add \
    type wifi \
    ifname wlan0 \
    con-name "$CON_NAME" \
    autoconnect yes \
    ssid "$SSID"

nmcli con modify "$CON_NAME" \
    802-11-wireless.mode ap \
    802-11-wireless.band bg \
    ipv4.method shared \
    ipv4.addresses "${IP}/24" \
    wifi-sec.key-mgmt wpa-psk \
    wifi-sec.psk "$PASSWORD" \
    connection.autoconnect-priority 100

# Activer
nmcli con up "$CON_NAME"

# S'assurer qu'eth0 reste en DHCP pour internet
nmcli con modify "$(nmcli -t -f NAME,TYPE con show | grep ethernet | head -1 | cut -d: -f1)" \
    ipv4.method auto 2>/dev/null || true

echo ""
echo "✓ Hotspot permanent configuré !"
echo ""
echo "  SSID       : ${SSID}"
echo "  Mot de passe : ${PASSWORD}"
echo "  IP fixe    : ${IP}"
echo ""
echo "  wlan0 → Hotspot NearGate (ESP32 + clients démo)"
echo "  eth0  → Internet via réseau du client (DHCP)"
echo ""
echo "  Ce hotspot démarrera automatiquement à chaque redémarrage."
