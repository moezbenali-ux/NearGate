#!/bin/bash
# ============================================================
#  NearGate — Configuration HTTPS avec certificat auto-signé
#
#  Ce script installe Nginx en reverse proxy devant FastAPI
#  et génère un certificat TLS auto-signé valable 10 ans.
#
#  Résultat :
#    https://neargate.local  → FastAPI (port 8000 en interne)
#    http://neargate.local   → redirigé vers HTTPS
#
#  Usage : sudo bash setup_https.sh
# ============================================================

set -euo pipefail

DOMAIN="neargate.local"
CERT_DIR="/etc/nginx/ssl/neargate"
CERT_FILE="${CERT_DIR}/cert.pem"
KEY_FILE="${CERT_DIR}/key.pem"
NGINX_CONF="/etc/nginx/sites-available/neargate"

echo "[NearGate] Installation de Nginx..."
apt-get update -qq
apt-get install -y nginx openssl

# ── 1. Génération du certificat auto-signé ──────────────────
echo "[NearGate] Génération du certificat auto-signé (10 ans)..."
mkdir -p "$CERT_DIR"

openssl req -x509 -nodes -newkey rsa:2048 \
    -keyout "$KEY_FILE" \
    -out    "$CERT_FILE" \
    -days   3650 \
    -subj   "/C=FR/ST=IleDeFrance/L=Paris/O=NearGate/CN=${DOMAIN}" \
    -addext "subjectAltName=DNS:${DOMAIN},DNS:localhost,IP:192.168.42.1,IP:127.0.0.1"

chmod 600 "$KEY_FILE"
chmod 644 "$CERT_FILE"

echo "[NearGate] Certificat généré :"
echo "  Certificat : ${CERT_FILE}"
echo "  Clé privée : ${KEY_FILE}"

# ── 2. Configuration Nginx ───────────────────────────────────
echo "[NearGate] Configuration de Nginx..."

cat > "$NGINX_CONF" << 'EOF'
# ── Redirection HTTP → HTTPS ─────────────────────────────────
server {
    listen 80;
    server_name neargate.local localhost _;
    return 301 https://$host$request_uri;
}

# ── HTTPS reverse proxy vers FastAPI ─────────────────────────
server {
    listen 443 ssl;
    server_name neargate.local localhost;

    ssl_certificate     /etc/nginx/ssl/neargate/cert.pem;
    ssl_certificate_key /etc/nginx/ssl/neargate/key.pem;

    # Protocoles et chiffrement modernes
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384;
    ssl_prefer_server_ciphers off;

    # En-têtes de sécurité
    add_header Strict-Transport-Security "max-age=63072000" always;
    add_header X-Frame-Options DENY;
    add_header X-Content-Type-Options nosniff;

    # Taille max pour l'upload de fichiers (import CSV)
    client_max_body_size 10M;

    # Proxy vers FastAPI
    location / {
        proxy_pass         http://127.0.0.1:8000;
        proxy_http_version 1.1;
        proxy_set_header   Host              $host;
        proxy_set_header   X-Real-IP         $remote_addr;
        proxy_set_header   X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto $scheme;

        # Timeout généreux pour le scan BLE radar (peut durer 15s)
        proxy_read_timeout 30s;
    }
}
EOF

# Activer le site et désactiver la config par défaut
ln -sf "$NGINX_CONF" /etc/nginx/sites-enabled/neargate
rm -f /etc/nginx/sites-enabled/default

# Vérifier la configuration Nginx
nginx -t

# ── 3. Mise à jour de BASE_URL dans .env ────────────────────
ENV_FILE="$(dirname "$(realpath "$0")")/../backend/.env"
if [ -f "$ENV_FILE" ]; then
    sed -i "s|^BASE_URL=.*|BASE_URL=https://${DOMAIN}|" "$ENV_FILE"
    echo "[NearGate] BASE_URL mis à jour dans .env → https://${DOMAIN}"
fi

# ── 4. Activation et démarrage ───────────────────────────────
systemctl enable nginx
systemctl restart nginx

echo ""
echo "✓ HTTPS configuré avec succès !"
echo ""
echo "  URL d'accès    : https://${DOMAIN}"
echo "  Certificat     : ${CERT_FILE} (auto-signé, 10 ans)"
echo ""
echo "  ⚠  Certificat auto-signé : votre navigateur affichera un avertissement."
echo "     Sur chaque appareil, acceptez l'exception de sécurité une fois"
echo "     (ou importez le certificat dans le magasin de confiance)."
echo ""
echo "  Pour exporter le certificat vers un PC ou téléphone :"
echo "    scp pi@192.168.42.1:${CERT_FILE} neargate-cert.pem"
echo ""
echo "  FastAPI tourne toujours sur le port 8000 en local (127.0.0.1 uniquement)."
echo "  Nginx écoute sur les ports 80 et 443 pour les connexions externes."
