#!/bin/bash
# Script d'installation NearGate Backend sur Raspberry Pi
# Usage : bash installer.sh

set -e

echo "=== Installation NearGate Backend ==="

# 1. Mise à jour et dépendances système
sudo apt update
sudo apt install -y python3-pip python3-venv mosquitto mosquitto-clients

# 2. Activation de Mosquitto (broker MQTT)
sudo systemctl enable mosquitto
sudo systemctl start mosquitto
echo "✓ Mosquitto (broker MQTT) démarré."

# 3. Environnement virtuel Python
cd /home/admin/neargate/backend
python3 -m venv ../venv
source ../venv/bin/activate
pip install -r requirements.txt
echo "✓ Dépendances Python installées."

# 4. Fichier .env — à éditer avant de lancer !
if [ ! -f .env ]; then
    echo "⚠ Fichier .env manquant — crée-le avec ta clé API."
else
    echo "✓ Fichier .env trouvé."
fi

# 5. Service systemd
sudo cp neargate.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable neargate
sudo systemctl start neargate
echo "✓ Service NearGate démarré."

echo ""
echo "=== Installation terminée ==="
echo "Teste l'API : curl http://localhost:8000/ping"
