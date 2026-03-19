# NearGate — Contexte Projet

## Description
Solution SaaS B2B de contrôle d'accès parking par détection automatique de badges BLE.
Le badge (KKM K7P) est détecté à l'approche par le **NearGate Radar** (ESP32) via RSSI —
le portail s'ouvre sans aucune action de l'utilisateur (hands-free).

## Contexte métier
- **Domaine** : neargate.fr
- **Cible principale** : entreprises B2B (parkings privés, parcs d'activités)
- **Cible secondaire** : résidentiel individuel (phase 2)
- **Porteur** : Moez Benali, Directeur Informatique (profil infra/réseaux, non-développeur)
- **Modèle** : SaaS — Start 49€/mois/portail, Pro 99€/mois/portail
- **Hébergement** : Raspberry Pi 3 sur site client (production via Cloudflare Tunnel)
- **URL de production** : https://app.neargate.fr (Cloudflare Tunnel + Let's Encrypt)

## Architecture technique

### Hardware
- **Badge utilisateur** : KKM K7P (iBeacon BLE, fixé pare-soleil)
- **Capteur** : NearGate Radar (ESP32 DevKit V1) — scan BLE + filtre Kalman sur RSSI
- **Actionnement** : module relais single-channel → commande motorisation existante
- **Alimentation** : HLK-PM01
- **Extras** : JSN-SR04T (détection véhicule), WS2812B (LED statut)

### Communication
- ESP32 → Backend via **MQTTS** (Mosquitto 2.0.21, port 8883, auth neargate/password)
- Backend expose une **API REST** (FastAPI, port 8000)
- Frontend consomme l'API via `api.js` centralisé

### Stack réelle (production actuelle)
- **Firmware** : C++ Arduino — `firmware/NearGate_ESP32.ino`
- **Backend** : FastAPI (Python) + SQLite + paho-mqtt — `backend/`
- **Frontend** : React + Vite (PWA) — `frontend/src/`
- **Auth** : JWT HS256 + bcrypt — `auth_jwt.py`
- **Reverse proxy** : Nginx avec TLS (cert auto-signé) → `scripts/setup_https.sh`
- **Exposition externe** : Cloudflare Tunnel → Let's Encrypt → https://app.neargate.fr
- **Service** : systemd `neargate.service`

### Réseau de production
```
Utilisateur → https://app.neargate.fr → Cloudflare Tunnel → Nginx → FastAPI :8000
```
- Accès local direct (hotspot) : `https://neargate.local` / `192.168.42.1`
- Accès distant (partout) : `https://app.neargate.fr`

### Serveur Raspberry Pi
- Raspberry Pi 3 — `neargate.local` / `192.168.42.1` (hotspot WiFi)
- User : `admin` — Path : `/home/admin/NearGate`
- Mosquitto sécurisé, Node-RED installé (non utilisé), VS Code Remote-SSH

## État d'avancement

### Backend — 85%
- [x] 21 routes API fonctionnelles (`main.py`, 592 lignes)
- [x] Machine d'états MQTT entrée/sortie (`mqtt_client.py`)
- [x] Auth JWT complète (`auth_jwt.py`) — plante au démarrage si JWT_SECRET absent
- [x] 6 tables SQLite + migrations auto (`database.py`)
- [x] Simulation ESP32 sans matériel (`simuler_esp32.py`)
- [x] Sync agent vers Scaleway (`sync_agent.py`) — côté client seulement
- [x] `.env.example` créé, `.env` hors git
- [x] Rôles appliqués — `require_role("admin")` sur /utilisateurs (CRUD) et PUT /config
- [ ] Serveur central Scaleway inexistant (multi-tenant)
- [ ] Portails hardcodés dans `main.py` (pas encore dynamiques)
- [x] SSE opérationnel — endpoint `/api/events`, broadcast depuis mqtt_client + ouvrir_portail
- [ ] Pas d'alertes email/push (ESP32 hors ligne, batterie faible)
- [ ] Pas d'export CSV/PDF historique
- [ ] `auth.py` (X-API-Key) inutilisé — vestige à supprimer
- [ ] `tester_api.sh` obsolète (utilise encore X-API-Key)

### Frontend — 90%
- [x] Dashboard (KPI, véhicules présents, refresh 15s)
- [x] Badges (CRUD, toggle, import CSV)
- [x] Historique (filtres, tableau RSSI)
- [x] Configuration (édition inline)
- [x] Gestionnaires (CRUD, rôles, import CSV)
- [x] Radar (scan BLE temps réel, ajout direct)
- [x] Supervision (statut ESP32, batterie badges)
- [x] GenerateurFirmware (génère .ino dans le navigateur)
- [x] Auth complète (login, reset MDP, token URL)
- [x] PWA configurée (manifest.json, icônes)
- [x] Mobile.jsx — bouton "Sortie" corrigé : portailId="sortie_ext"
- [x] Dashboard en temps réel via SSE (remplace le polling 15s)
- [ ] Pas de notifications push

### Firmware — 90%
- [x] WiFi, MQTT, scan BLE, filtre Kalman, OTA, heartbeat
- [x] Générateur de firmware fonctionnel depuis le dashboard
- [ ] Configuré pour intérieur uniquement (PORTAIL_ID = "entree_int")
- [ ] Pas de config extérieur/IP65

### Infra — 85%
- [x] Raspberry Pi + hotspot WiFi opérationnel
- [x] HTTPS via Nginx + certificat auto-signé (`scripts/setup_https.sh`)
- [x] `.env` hors git, `.env.example` documenté
- [x] Cloudflare Tunnel opérationnel → https://app.neargate.fr (Let's Encrypt)
- [x] **En production** (session 1 terminée)
- [ ] Pas de tests automatisés (pytest, jest)
- [ ] Multi-tenant / serveur Scaleway central inexistant

## Prochaines sessions prioritaires

### ✅ Session 1 — Sécurité de base (terminée, en prod)
```
✓ backend/.env hors git, .env.example créé
✓ JWT_SECRET obligatoire au démarrage (plus de fallback)
✓ HTTPS Nginx + certificat auto-signé (neargate.local)
✓ Cloudflare Tunnel → https://app.neargate.fr (Let's Encrypt)
```

### ✅ Session 2 — Rôles + temps réel (terminée)
```
✓ require_role("admin") sur /utilisateurs (CRUD+import) et PUT /config
✓ Mobile.jsx — portailId="sortie_ext" sur le bouton Sortie (compat firmware)
✓ Dashboard en temps réel via SSE — sse.py + /api/events + EventSource
```

### Session 3 — Portails dynamiques
```
Rends les portails configurables dynamiquement depuis le dashboard
sans modifier le code — table portails en base,
supprime les portails hardcodés dans main.py
```

### Session 4 — Nettoyage
```
1. Supprime auth.py (inutilisé)
2. Corrige tester_api.sh pour utiliser JWT au lieu de X-API-Key
3. Ajoute export CSV sur la page Historique
```

## Design system
Fichier de référence : `design_system.md` à la racine.
- **Couleurs** : Midnight #080E1A, Deep Navy #0D1B2E, Electric #00E5FF,
  Access Green #00F5A0, Slate #8BA3C0
- **Typographie** : Syne (headings), DM Sans (body)

## Conventions importantes
- **Langue** : toujours répondre en français
- **Niveau** : Moez n'est pas développeur — expliquer simplement, donner les commandes exactes
- **Nom du boîtier** : NearGate Radar (jamais "ESP32" dans les documents commerciaux)
- **Domaine** : neargate.fr (pas neargate.io) — app sur app.neargate.fr
- **Git** : ne jamais committer `.env` — utiliser `.env.example`
- **JWT_SECRET** : doit être dans `.env`, le serveur doit planter si absent
