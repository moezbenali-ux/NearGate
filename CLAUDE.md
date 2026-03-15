# NearGate — Contexte Projet

## Description
Solution d'ouverture automatique de portail de parking pour entreprises.
Détection de badges iBeacon via ESP32 + commande d'un module relais.

## Contexte métier
- Cible : parkings d'entreprises
- Porteur du projet : Moez Benali, Directeur Informatique (profil infra/réseaux)
- Objectif : développer ET commercialiser la solution

## Architecture technique

### Hardware
- Badge utilisateur : balise iBeacon K7P (émetteur BLE)
- Capteur : ESP32 en mode scan BLE (détecte les balises par UUID + seuil RSSI)
- Actionnement : module relais connecté à l'ESP32 → commande l'ouverture du portail

### Logique de détection
- Identification par UUID iBeacon
- Seuil RSSI configurable pour définir la zone de déclenchement
- Filtre Kalman appliqué sur le RSSI pour stabiliser les mesures
- Confirmation de passage : N détections consécutives avant ouverture

### Communication
- ESP32 → Backend via MQTT (envisagé)
- Multi-ESP32 possible pour couvrir plusieurs entrées/sorties

### Stack envisagée
- Firmware : C++ Arduino (Arduino IDE ou PlatformIO)
- Backend : à définir
- Application mobile : à définir

## Etat d'avancement
- [x] Concept validé
- [x] Architecture technique définie
- [x] Script de test BLE complet (filtre Kalman, rapport CSV, logs série)
- [ ] Tests terrain sur badge K7P
- [ ] Backend / API
- [ ] Application mobile
- [ ] Business plan / modèle commercial

## Conventions
- Langue : français
- Moez n'est pas développeur — expliquer les concepts techniques simplement
- Toujours préciser les commandes exactes à taper