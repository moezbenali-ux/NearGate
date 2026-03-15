# NearGate — Guide de test du flux complet

## Prérequis
- Raspberry Pi connecté au réseau local
- Fichiers copiés dans `/home/pi/neargate/backend/`
- Fichier `.env` modifié avec ta clé API

---

## PHASE 1 — Vérifier Mosquitto et le backend

### Connexion SSH au Raspberry
```bash
ssh pi@<IP_DU_RASPBERRY>
```

### Vérifier que Mosquitto (broker MQTT) tourne
```bash
sudo systemctl status mosquitto
```
✅ Attendu : `Active: active (running)`

Si ce n'est pas le cas :
```bash
sudo systemctl start mosquitto
```

### Démarrer le backend manuellement (pour voir les logs en direct)
```bash
cd /home/pi/neargate/backend
source ../venv/bin/activate
uvicorn main:app --host 0.0.0.0 --port 8000
```
✅ Attendu dans les logs :
```
INFO — Base de données initialisée.
INFO — MQTT connecté au broker 127.0.0.1:1883
INFO — Abonné au topic : neargate/detection
INFO — Uvicorn running on http://0.0.0.0:8000
```
⚠️  Laisse ce terminal ouvert pour voir les logs en temps réel.

---

## PHASE 2 — Tester l'API REST

### Ouvrir un 2e terminal SSH (en parallèle)
```bash
ssh pi@<IP_DU_RASPBERRY>
cd /home/pi/neargate/backend
source ../venv/bin/activate
```

### Lancer le script de test API
```bash
bash tester_api.sh
```

✅ Résultats attendus :
- Étape 1 (ping) : `{"status": "ok", "service": "NearGate"}`
- Étape 2 (badges) : liste vide `[]`
- Étape 3 (ajout badge) : `{"message": "Badge ajouté."}`
- Étape 8 (mauvaise clé) : `{"detail": "Clé API invalide"}`

Note l'UUID affiché à la fin du script, tu en auras besoin.

---

## PHASE 3 — Simulation ESP32 via MQTT

### 3a. Badge autorisé avec bon RSSI → doit OUVRIR
```bash
python simuler_esp32.py --uuid aabbccdd-0011-2233-4455-667788990011 --rssi -65
```

✅ Dans le terminal du backend, tu dois voir :
```
INFO — neargate.mqtt — Badge aabbccdd-... autorisé → commande envoyée sur neargate/commande/entree
```

✅ Dans l'historique des passages :
```bash
curl -s -H "X-API-Key: <TA_CLE>" http://localhost:8000/evenements | python3 -m json.tool
```
Doit contenir un événement avec `"action": "ouverture"`

---

### 3b. Badge autorisé mais RSSI trop faible → doit IGNORER
```bash
python simuler_esp32.py --uuid aabbccdd-0011-2233-4455-667788990011 --rssi -90
```

✅ Dans les logs backend :
```
INFO — neargate.mqtt — Badge aabbccdd-... ignoré (RSSI -90 < seuil -75)
```
Aucun nouvel événement dans l'historique.

---

### 3c. Badge inconnu avec bon RSSI → doit REFUSER
```bash
python simuler_esp32.py --uuid 00000000-0000-0000-0000-000000000000 --rssi -65
```

✅ Dans les logs backend :
```
INFO — neargate.mqtt — Badge 00000000-... non autorisé → accès refusé
```
L'historique doit contenir un événement avec `"action": "refus"`

---

### 3d. Désactiver un badge et retester → doit REFUSER
```bash
# Désactiver le badge
curl -s -X PATCH http://localhost:8000/badges/aabbccdd-0011-2233-4455-667788990011 \
  -H "X-API-Key: <TA_CLE>" \
  -H "Content-Type: application/json" \
  -d '{"actif": false}'

# Simuler une détection
python simuler_esp32.py --uuid aabbccdd-0011-2233-4455-667788990011 --rssi -65
```
✅ Attendu : `"action": "refus"` malgré le bon RSSI

---

## PHASE 4 — ESP32 réel

Une fois les phases 1-3 validées :

1. Ouvre `firmware/NearGate_ESP32/NearGate_ESP32.ino` dans Arduino IDE
2. Modifie les 4 variables de configuration (Wi-Fi, IP Raspberry, UUID badge)
3. Branche l'ESP32 en USB, sélectionne "ESP32 Dev Module"
4. Flashe (bouton Upload)
5. Ouvre le moniteur série (115200 bauds)
6. Approche le badge K7P de l'ESP32

✅ Dans le moniteur série :
```
[WiFi] Connecté. IP : 192.168.1.XX
[MQTT] Connecté.
[BLE] Scanner initialisé.
[BLE] UUID: <ton-uuid> | RSSI brut: -62 dBm | RSSI filtré: -63.2 dBm
[BLE] Confirmation 1/3
[BLE] Confirmation 2/3
[BLE] Confirmation 3/3
[MQTT] Publié : {"uuid":"...","rssi":-63,"portail_id":"entree"}
[RELAIS] Ouverture du portail !
```

---

## Résumé des tests

| Test | Attendu | Résultat |
|------|---------|----------|
| Ping API | `{"status":"ok"}` | ☐ |
| Ajout badge | `201 Created` | ☐ |
| Mauvaise clé API | `401` | ☐ |
| MQTT badge autorisé RSSI ok | Ouverture | ☐ |
| MQTT badge autorisé RSSI faible | Ignoré | ☐ |
| MQTT badge inconnu | Refus | ☐ |
| Badge désactivé | Refus | ☐ |
| ESP32 réel | Relais activé | ☐ |
