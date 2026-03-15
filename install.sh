#!/bin/bash
# ============================================================
#  NearGate — Script d'installation automatisé
#  Compatible : Ubuntu Server 22.04/24.04, Raspberry Pi OS
#  Usage      : sudo bash install.sh
# ============================================================

set -euo pipefail

# ─── Couleurs ────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
BLUE='\033[0;34m'; CYAN='\033[0;36m'; BOLD='\033[1m'; NC='\033[0m'

log()     { echo -e "${GREEN}[✓]${NC} $1"; }
info()    { echo -e "${BLUE}[i]${NC} $1"; }
warn()    { echo -e "${YELLOW}[!]${NC} $1"; }
error()   { echo -e "${RED}[✗]${NC} $1"; exit 1; }
section() { echo -e "\n${BOLD}${CYAN}━━━ $1 ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"; }

# ─── Vérifications préliminaires ─────────────────────────────
[[ $EUID -ne 0 ]] && error "Ce script doit être lancé en root : sudo bash install.sh"

OS=$(lsb_release -si 2>/dev/null || echo "Unknown")
ARCH=$(uname -m)

echo -e "${BOLD}"
echo "  ███╗   ██╗███████╗ █████╗ ██████╗  ██████╗  █████╗ ████████╗███████╗"
echo "  ████╗  ██║██╔════╝██╔══██╗██╔══██╗██╔════╝ ██╔══██╗╚══██╔══╝██╔════╝"
echo "  ██╔██╗ ██║█████╗  ███████║██████╔╝██║  ███╗███████║   ██║   █████╗  "
echo "  ██║╚██╗██║██╔══╝  ██╔══██║██╔══██╗██║   ██║██╔══██║   ██║   ██╔══╝  "
echo "  ██║ ╚████║███████╗██║  ██║██║  ██║╚██████╔╝██║  ██║   ██║   ███████╗"
echo "  ╚═╝  ╚═══╝╚══════╝╚═╝  ╚═╝╚═╝  ╚═╝ ╚═════╝ ╚═╝  ╚═╝   ╚═╝   ╚══════╝"
echo -e "${NC}"
echo -e "  Système d'ouverture automatique de portail parking"
echo -e "  Plateforme : ${CYAN}${OS} ${ARCH}${NC}\n"

# ─── Configuration interactive ───────────────────────────────
section "Configuration"

read -rp "$(echo -e "${BOLD}Nom du client${NC} (ex: acme → acme.neargate.fr) : ")" CLIENT_NOM
CLIENT_NOM=$(echo "$CLIENT_NOM" | tr '[:upper:]' '[:lower:]' | tr ' ' '-')

read -rp "$(echo -e "${BOLD}Domaine principal${NC} [neargate.fr] : ")" DOMAINE
DOMAINE=${DOMAINE:-neargate.fr}
FQDN="${CLIENT_NOM}.${DOMAINE}"

read -rp "$(echo -e "${BOLD}Email admin NearGate${NC} : ")" ADMIN_EMAIL
read -rsp "$(echo -e "${BOLD}Mot de passe admin${NC} : ")" ADMIN_MDP; echo
read -rsp "$(echo -e "${BOLD}Mot de passe MQTT${NC} [généré automatiquement] : ")" MQTT_PASS; echo
MQTT_PASS=${MQTT_PASS:-$(openssl rand -base64 20)}

read -rp "$(echo -e "${BOLD}Email SMTP${NC} [noreply@neargate.fr] : ")" SMTP_USER
SMTP_USER=${SMTP_USER:-noreply@neargate.fr}
read -rsp "$(echo -e "${BOLD}Mot de passe SMTP${NC} : ")" SMTP_PASS; echo

JWT_SECRET=$(openssl rand -base64 48)
API_KEY="NearGate-$(openssl rand -hex 8)"

INSTALL_DIR="/opt/neargate/${CLIENT_NOM}"
SERVICE_USER="neargate"
REPO_URL="https://github.com/moezbenali-ux/NearGate.git"

echo ""
info "Récapitulatif :"
info "  Client     : ${CLIENT_NOM}"
info "  Domaine    : ${FQDN}"
info "  Répertoire : ${INSTALL_DIR}"
info "  Admin      : ${ADMIN_EMAIL}"
echo ""
read -rp "Continuer ? [O/n] " CONFIRM
[[ "${CONFIRM,,}" == "n" ]] && exit 0

# ─── Mise à jour système ──────────────────────────────────────
section "Mise à jour système"
apt-get update -qq
apt-get upgrade -y -qq
log "Système mis à jour"

# ─── Dépendances système ──────────────────────────────────────
section "Installation des dépendances"

apt-get install -y -qq \
    python3 python3-pip python3-venv \
    nginx \
    mosquitto mosquitto-clients \
    git curl wget \
    openssl \
    build-essential

# Node.js 20 LTS
if ! command -v node &>/dev/null; then
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash - >/dev/null 2>&1
    apt-get install -y -qq nodejs
fi

log "Dépendances installées (Python, Nginx, Mosquitto, Node.js $(node -v))"

# ─── Utilisateur système ──────────────────────────────────────
section "Utilisateur système"
if ! id "$SERVICE_USER" &>/dev/null; then
    useradd --system --no-create-home --shell /bin/false "$SERVICE_USER"
    log "Utilisateur système '${SERVICE_USER}' créé"
else
    log "Utilisateur système '${SERVICE_USER}' déjà présent"
fi

# ─── Répertoire d'installation ────────────────────────────────
section "Installation de l'application"
mkdir -p "$INSTALL_DIR"

if [[ -d "${INSTALL_DIR}/.git" ]]; then
    info "Dépôt déjà présent — mise à jour..."
    git -C "$INSTALL_DIR" pull --quiet
else
    git clone --quiet "$REPO_URL" "$INSTALL_DIR"
fi
log "Code source installé dans ${INSTALL_DIR}"

# ─── Environnement Python ─────────────────────────────────────
section "Environnement Python"
python3 -m venv "${INSTALL_DIR}/venv"
"${INSTALL_DIR}/venv/bin/pip" install --quiet --upgrade pip
"${INSTALL_DIR}/venv/bin/pip" install --quiet -r "${INSTALL_DIR}/backend/requirements.txt"
"${INSTALL_DIR}/venv/bin/pip" install --quiet "bcrypt==4.2.0"
log "Environnement Python configuré"

# ─── Build frontend ───────────────────────────────────────────
section "Build frontend"
cd "${INSTALL_DIR}/frontend"
npm install --silent
npm run build --silent
log "Frontend compilé"

# ─── Configuration .env ───────────────────────────────────────
section "Configuration"
cat > "${INSTALL_DIR}/backend/.env" <<EOF
# NearGate — Configuration client : ${CLIENT_NOM}
# Généré le $(date '+%Y-%m-%d %H:%M:%S')

API_KEY=${API_KEY}

MQTT_BROKER=127.0.0.1
MQTT_PORT=1883
MQTT_USERNAME=neargate
MQTT_PASSWORD=${MQTT_PASS}

JWT_SECRET=${JWT_SECRET}

DB_PATH=${INSTALL_DIR}/backend/neargate.db

SMTP_HOST=mail.gandi.net
SMTP_PORT=587
SMTP_USER=${SMTP_USER}
SMTP_PASSWORD=${SMTP_PASS}
BASE_URL=https://${FQDN}
EOF

chmod 600 "${INSTALL_DIR}/backend/.env"
chown "${SERVICE_USER}:${SERVICE_USER}" "${INSTALL_DIR}/backend/.env"
log "Fichier .env créé (permissions 600)"

# ─── Base de données + compte admin ──────────────────────────
section "Base de données"
chown -R "${SERVICE_USER}:${SERVICE_USER}" "${INSTALL_DIR}"

# Initialisation DB
sudo -u "$SERVICE_USER" "${INSTALL_DIR}/venv/bin/python3" -c "
import sys; sys.path.insert(0, '${INSTALL_DIR}/backend')
from database import init_db; init_db()
print('DB initialisée')
"

# Création du compte admin
sudo -u "$SERVICE_USER" "${INSTALL_DIR}/venv/bin/python3" -c "
import sys; sys.path.insert(0, '${INSTALL_DIR}/backend')
from database import get_connection
from auth_jwt import hasher_mdp
conn = get_connection()
try:
    conn.execute(
        'INSERT INTO utilisateurs (email, nom, mot_de_passe_hash, role) VALUES (?, ?, ?, ?)',
        ('${ADMIN_EMAIL}', 'Administrateur', hasher_mdp('${ADMIN_MDP}'), 'admin')
    )
    conn.commit()
    print('Compte admin créé')
except Exception as e:
    print(f'Admin déjà présent ou erreur : {e}')
conn.close()
"
log "Base de données initialisée"

# ─── Mosquitto ────────────────────────────────────────────────
section "Configuration Mosquitto"

# Mot de passe MQTT
mosquitto_passwd -b -c /etc/mosquitto/passwd neargate "$MQTT_PASS"

cat > /etc/mosquitto/conf.d/neargate-${CLIENT_NOM}.conf <<EOF
listener 1883 127.0.0.1
allow_anonymous false
password_file /etc/mosquitto/passwd
EOF

systemctl enable mosquitto --quiet
systemctl restart mosquitto
log "Mosquitto configuré et démarré"

# ─── Service systemd NearGate ─────────────────────────────────
section "Service systemd"

cat > "/etc/systemd/system/neargate-${CLIENT_NOM}.service" <<EOF
[Unit]
Description=NearGate Backend — ${CLIENT_NOM}
After=network.target mosquitto.service

[Service]
User=${SERVICE_USER}
WorkingDirectory=${INSTALL_DIR}/backend
EnvironmentFile=${INSTALL_DIR}/backend/.env
ExecStartPre=/usr/sbin/rfkill unblock bluetooth
ExecStart=${INSTALL_DIR}/venv/bin/uvicorn main:app --host 127.0.0.1 --port 8000
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable "neargate-${CLIENT_NOM}" --quiet
systemctl start "neargate-${CLIENT_NOM}"
log "Service neargate-${CLIENT_NOM} démarré"

# ─── Nginx ────────────────────────────────────────────────────
section "Configuration Nginx"

# Répertoire pour les certificats Cloudflare
mkdir -p /etc/nginx/ssl

cat > "/etc/nginx/sites-available/neargate-${CLIENT_NOM}" <<EOF
server {
    listen 80;
    server_name ${FQDN};
    return 301 https://\$host\$request_uri;
}

server {
    listen 443 ssl;
    server_name ${FQDN};

    ssl_certificate     /etc/nginx/ssl/${FQDN}.pem;
    ssl_certificate_key /etc/nginx/ssl/${FQDN}.key;
    ssl_protocols       TLSv1.2 TLSv1.3;
    ssl_ciphers         HIGH:!aNULL:!MD5;

    location / {
        proxy_pass         http://127.0.0.1:8000;
        proxy_set_header   Host \$host;
        proxy_set_header   X-Real-IP \$remote_addr;
        proxy_set_header   X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto \$scheme;
        proxy_read_timeout 120s;
    }
}
EOF

ln -sf "/etc/nginx/sites-available/neargate-${CLIENT_NOM}" \
       "/etc/nginx/sites-enabled/neargate-${CLIENT_NOM}"

# Désactiver le site par défaut
rm -f /etc/nginx/sites-enabled/default

nginx -t 2>/dev/null && warn "Nginx configuré — en attente du certificat SSL" \
                      || warn "Nginx : vérifiez la configuration manuellement"

# ─── Cloudflare Tunnel ────────────────────────────────────────
section "Cloudflare Tunnel"

# Téléchargement de cloudflared selon l'architecture
if [[ "$ARCH" == "aarch64" || "$ARCH" == "arm64" ]]; then
    CF_URL="https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-arm64"
elif [[ "$ARCH" == "armv7l" ]]; then
    CF_URL="https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-arm"
else
    CF_URL="https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64"
fi

if ! command -v cloudflared &>/dev/null; then
    curl -fsSL "$CF_URL" -o /usr/local/bin/cloudflared
    chmod +x /usr/local/bin/cloudflared
    log "cloudflared installé"
else
    log "cloudflared déjà installé ($(cloudflared --version))"
fi

warn "Étape manuelle requise : authentifier et créer le tunnel Cloudflare"
warn "  1. cloudflared tunnel login"
warn "  2. cloudflared tunnel create ${CLIENT_NOM}"
warn "  3. Copier le certificat Cloudflare Origin dans /etc/nginx/ssl/${FQDN}.pem et .key"
warn "  4. systemctl restart nginx"

# ─── Résumé ───────────────────────────────────────────────────
section "Installation terminée"

echo -e "${GREEN}${BOLD}"
echo "  NearGate installé avec succès pour le client : ${CLIENT_NOM}"
echo -e "${NC}"
echo -e "  URL dashboard  : ${CYAN}https://${FQDN}${NC}"
echo -e "  URL mobile     : ${CYAN}https://${FQDN}/mobile${NC}"
echo -e "  Admin          : ${CYAN}${ADMIN_EMAIL}${NC}"
echo -e "  Service        : ${CYAN}neargate-${CLIENT_NOM}${NC}"
echo -e "  Répertoire     : ${CYAN}${INSTALL_DIR}${NC}"
echo ""
echo -e "  ${YELLOW}Étapes suivantes :${NC}"
echo -e "  1. Configurer le tunnel Cloudflare (voir instructions ci-dessus)"
echo -e "  2. Copier le certificat SSL dans /etc/nginx/ssl/"
echo -e "  3. sudo systemctl restart nginx"
echo ""
echo -e "  ${YELLOW}Infos firmware ESP32 :${NC}"
echo -e "  MQTT_SERVER   = IP locale de ce serveur"
echo -e "  MQTT_USER     = neargate"
echo -e "  MQTT_PASS     = ${MQTT_PASS}"
echo ""
