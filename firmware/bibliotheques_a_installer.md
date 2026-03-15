# Bibliothèques Arduino à installer

Dans l'Arduino IDE : menu Outils → Gérer les bibliothèques

| Bibliothèque       | Auteur             | Usage                        |
|--------------------|--------------------|------------------------------|
| PubSubClient       | Nick O'Leary       | Client MQTT                  |
| ArduinoJson        | Benoît Blanchon    | Sérialisation JSON           |

Les bibliothèques BLE et WiFi sont incluses dans le support ESP32
(installé via le gestionnaire de cartes avec l'URL Espressif).

## Support ESP32 (si pas encore fait)

1. Arduino IDE → Fichier → Préférences
2. Ajouter dans "URL de gestionnaire de cartes" :
   https://raw.githubusercontent.com/espressif/arduino-esp32/gh-pages/package_esp32_index.json
3. Outils → Type de carte → Gestionnaire de cartes → chercher "esp32" → Installer
4. Choisir la carte : "ESP32 Dev Module"
