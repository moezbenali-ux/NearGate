/*
 * NearGate — Firmware ESP32
 *
 * Fonctionnement :
 *  1. Scan BLE en continu
 *  2. Filtre les balises iBeacon par UUID cible
 *  3. Applique un filtre Kalman sur le RSSI
 *  4. Si RSSI filtré >= seuil ET N confirmations consécutives → commande relais
 *  5. Publie l'événement en MQTT vers le backend Raspberry Pi
 *  6. Écoute les commandes MQTT du backend (ouverture forcée possible)
 *
 * Topics MQTT :
 *   Envoi    → neargate/detection        (JSON : uuid, rssi, portail_id)
 *   Réception← neargate/commande/entree  (JSON : action "ouvrir")
 */

#include <Arduino.h>
#include <BLEDevice.h>
#include <BLEScan.h>
#include <BLEAdvertisedDevice.h>
#include <WiFi.h>
#include <ArduinoOTA.h>
#include <PubSubClient.h>
#include <ArduinoJson.h>

// ─── Configuration — À MODIFIER ────────────────────────────────────────────

// Wi-Fi — Hotspot NearGate (toujours fixe, généré par le Raspberry Pi)
const char* WIFI_SSID     = "NearGate";
const char* WIFI_PASSWORD = "NearGate2026!";

// MQTT — IP fixe du Raspberry Pi sur son propre hotspot
const char* MQTT_SERVER   = "192.168.42.1";
const int   MQTT_PORT     = 1883;
// Client ID unique — doit correspondre au PORTAIL_ID de cet ESP32
// ESP32 extérieur : "neargate-esp32-entree-ext"
// ESP32 intérieur : "neargate-esp32-entree-int"
const char* MQTT_CLIENT_ID = "neargate-esp32-entree-int";
const char* MQTT_USER     = "neargate";
const char* MQTT_PASS     = "NearGate-MQTT-2026!";

// Identifiant de cet ESP32 :
//   ESP32 côté EXTÉRIEUR → "entree_ext"
//   ESP32 côté INTÉRIEUR → "entree_int"
const char* PORTAIL_ID = "entree_int";  // ← changer selon l'ESP32

// UUID iBeacon du badge K7P à détecter
// Format : 8-4-4-4-12 en minuscules
const char* BEACON_UUID_CIBLE = "9730c8c0-24fe-327a-3f63-623c87e24797";

// Seuil minimum pour publier vers le backend (permissif — c'est le backend qui décide)
// Ne pas dépasser -90 pour ne pas rater de détections
const int RSSI_SEUIL = -90;

// Nombre de détections consécutives avant ouverture
const int CONFIRMATIONS_REQUISES = 3;

// Broche du relais (GPIO)
const int PIN_RELAIS = 26;

// Durée d'activation du relais en ms (temps d'ouverture du portail)
const int DUREE_RELAIS_MS = 2000;

// Durée entre deux ouvertures du même badge (anti-rebond, en ms)
const unsigned long DELAI_ANTI_REBOND_MS = 10000;

// Intervalle heartbeat (ms)
const unsigned long HEARTBEAT_INTERVAL_MS = 30000;

// ─── Topics MQTT ───────────────────────────────────────────────────────────

char TOPIC_DETECTION[50];
char TOPIC_COMMANDE[50];
char TOPIC_PING[50];

// ─── Variables globales ────────────────────────────────────────────────────

unsigned long dernierHeartbeat = 0;

WiFiClient   wifiClient;
PubSubClient mqttClient(wifiClient);
BLEScan*     bleScan;

// Filtre Kalman (par UUID de badge pour gérer plusieurs badges)
struct KalmanState {
  float estimation;
  float erreur;
  bool  initialise;
};

// Simple dictionnaire UUID → état Kalman (max 10 badges simultanés)
struct EntreeKalman {
  String uuid;
  KalmanState kalman;
  int    compteur_confirmations;
  unsigned long dernier_declenchement_ms;
  bool   jamais_declenche;
};

const int MAX_BADGES_SIMULTANES = 10;
EntreeKalman etatsKalman[MAX_BADGES_SIMULTANES];
int nbEtats = 0;

// ─── Filtre Kalman ─────────────────────────────────────────────────────────

float kalman_filtrer(KalmanState& etat, float mesure) {
  const float Q = 0.5;  // bruit de processus
  const float R = 3.0;  // bruit de mesure

  if (!etat.initialise) {
    etat.estimation = mesure;
    etat.erreur     = 1.0;
    etat.initialise = true;
    return mesure;
  }

  // Prédiction
  float erreur_pred = etat.erreur + Q;

  // Gain de Kalman
  float gain = erreur_pred / (erreur_pred + R);

  // Mise à jour
  etat.estimation = etat.estimation + gain * (mesure - etat.estimation);
  etat.erreur     = (1 - gain) * erreur_pred;

  return etat.estimation;
}

// ─── Gestion des états par badge ───────────────────────────────────────────

EntreeKalman* obtenir_etat(const String& uuid) {
  for (int i = 0; i < nbEtats; i++) {
    if (etatsKalman[i].uuid == uuid) return &etatsKalman[i];
  }
  if (nbEtats < MAX_BADGES_SIMULTANES) {
    // dernier_declenchement_ms = ULONG_MAX pour que le premier déclenchement soit toujours autorisé
    etatsKalman[nbEtats] = {uuid, {0, 1, false}, 0, 0, true};
    return &etatsKalman[nbEtats++];
  }
  return nullptr;
}

// ─── Relais ────────────────────────────────────────────────────────────────

void actionner_relais() {
  Serial.println("[RELAIS] Ouverture du portail !");
  digitalWrite(PIN_RELAIS, HIGH);
  delay(DUREE_RELAIS_MS);
  digitalWrite(PIN_RELAIS, LOW);
  Serial.println("[RELAIS] Portail refermé.");
}

// ─── MQTT ──────────────────────────────────────────────────────────────────

void publier_heartbeat() {
  if (!mqttClient.connected()) return;
  StaticJsonDocument<96> doc;
  doc["portail_id"] = PORTAIL_ID;
  doc["ip"]         = WiFi.localIP().toString();
  char payload[96];
  serializeJson(doc, payload);
  mqttClient.publish(TOPIC_PING, payload);
  Serial.printf("[MQTT] Heartbeat publié sur %s\n", TOPIC_PING);
}

void publier_detection(const String& uuid, int rssi, int batterie) {
  if (!mqttClient.connected()) return;

  StaticJsonDocument<160> doc;
  doc["uuid"]       = uuid;
  doc["rssi"]       = rssi;
  doc["portail_id"] = PORTAIL_ID;
  if (batterie >= 0) doc["batterie"] = batterie;

  char payload[160];
  serializeJson(doc, payload);
  mqttClient.publish(TOPIC_DETECTION, payload);
  Serial.printf("[MQTT] Publié : %s\n", payload);
}

void callback_mqtt(char* topic, byte* payload, unsigned int length) {
  String message;
  for (unsigned int i = 0; i < length; i++) message += (char)payload[i];

  Serial.printf("[MQTT] Message reçu sur %s : %s\n", topic, message.c_str());

  StaticJsonDocument<64> doc;
  if (deserializeJson(doc, message) == DeserializationError::Ok) {
    const char* action = doc["action"];
    if (action && strcmp(action, "ouvrir") == 0) {
      Serial.println("[MQTT] Commande d'ouverture reçue.");
      actionner_relais();
    }
  }
}

void connecter_mqtt() {
  while (!mqttClient.connected()) {
    Serial.print("[MQTT] Connexion au broker... ");
    if (mqttClient.connect(MQTT_CLIENT_ID, MQTT_USER, MQTT_PASS)) {
      Serial.println("Connecté.");
      mqttClient.subscribe(TOPIC_COMMANDE);
      Serial.printf("[MQTT] Abonné à : %s\n", TOPIC_COMMANDE);
    } else {
      Serial.printf("Échec (état=%d). Nouvel essai dans 5s.\n", mqttClient.state());
      delay(5000);
    }
  }
}

// ─── BLE — Callback de détection ───────────────────────────────────────────

class CallbackBLE : public BLEAdvertisedDeviceCallbacks {
  void onResult(BLEAdvertisedDevice device) {

    // Ignore les appareils sans données iBeacon
    if (!device.haveManufacturerData()) return;

    String dataStr = device.getManufacturerData();
    // Format iBeacon : 2 octets Apple ID (0x004C) + 0x02 + 0x15 + 16 octets UUID + ...
    if (dataStr.length() < 25) return;
    if ((uint8_t)dataStr[0] != 0x4C || (uint8_t)dataStr[1] != 0x00) return;
    if ((uint8_t)dataStr[2] != 0x02 || (uint8_t)dataStr[3] != 0x15) return;

    // Extraction de l'UUID (octets 4 à 19)
    char uuid_buf[37];
    const uint8_t* u = (const uint8_t*)dataStr.c_str() + 4;
    snprintf(uuid_buf, sizeof(uuid_buf),
      "%02x%02x%02x%02x-%02x%02x-%02x%02x-%02x%02x-%02x%02x%02x%02x%02x%02x",
      u[0],u[1],u[2],u[3], u[4],u[5], u[6],u[7],
      u[8],u[9], u[10],u[11],u[12],u[13],u[14],u[15]);

    String uuid = String(uuid_buf);

    // Filtre : on ne traite que l'UUID cible
    if (!uuid.equalsIgnoreCase(BEACON_UUID_CIBLE)) return;

    // Lecture batterie Feasycom (service data UUID fff0, dernier octet)
    int batterie = -1;
    if (device.haveServiceData()) {
      String svcData = device.getServiceData();
      if (svcData.length() >= 11) {
        batterie = (uint8_t)svcData[10];
      }
    }

    int rssi_brut = device.getRSSI();
    EntreeKalman* etat = obtenir_etat(uuid);
    if (!etat) return;

    float rssi_filtre = kalman_filtrer(etat->kalman, (float)rssi_brut);

    Serial.printf("[BLE] UUID: %s | RSSI brut: %d dBm | RSSI filtré: %.1f dBm | Batterie: %d%%\n",
                  uuid.c_str(), rssi_brut, rssi_filtre, batterie);

    // Seuil RSSI atteint ?
    if ((int)rssi_filtre >= RSSI_SEUIL) {
      etat->compteur_confirmations++;
      Serial.printf("[BLE] Confirmation %d/%d\n",
                    etat->compteur_confirmations, CONFIRMATIONS_REQUISES);

      if (etat->compteur_confirmations >= CONFIRMATIONS_REQUISES) {
        unsigned long maintenant = millis();
        if (etat->jamais_declenche || maintenant - etat->dernier_declenchement_ms > DELAI_ANTI_REBOND_MS) {
          etat->dernier_declenchement_ms = maintenant;
          etat->jamais_declenche         = false;
          etat->compteur_confirmations   = 0;

          // Publication MQTT → le backend décide d'ouvrir ou non
          publier_detection(uuid, (int)rssi_filtre, batterie);
        } else {
          Serial.println("[BLE] Anti-rebond actif, ouverture ignorée.");
          etat->compteur_confirmations = 0;
        }
      }
    } else {
      // RSSI trop faible : on remet le compteur à zéro
      etat->compteur_confirmations = 0;
    }
  }
};

// ─── Setup ─────────────────────────────────────────────────────────────────

void setup() {
  Serial.begin(115200);
  Serial.println("\n=== NearGate — Démarrage ===");

  // Topics MQTT
  snprintf(TOPIC_DETECTION, sizeof(TOPIC_DETECTION), "neargate/detection");
  snprintf(TOPIC_COMMANDE,  sizeof(TOPIC_COMMANDE),  "neargate/commande/%s", PORTAIL_ID);
  snprintf(TOPIC_PING,      sizeof(TOPIC_PING),      "neargate/ping/%s",     PORTAIL_ID);

  // Relais
  pinMode(PIN_RELAIS, OUTPUT);
  digitalWrite(PIN_RELAIS, LOW);

  // Wi-Fi
  Serial.printf("[WiFi] Connexion à %s...\n", WIFI_SSID);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.printf("\n[WiFi] Connecté. IP : %s\n", WiFi.localIP().toString().c_str());

  // OTA
  ArduinoOTA.setHostname(MQTT_CLIENT_ID);
  ArduinoOTA.setPassword("NearGate-OTA-2026!");
  ArduinoOTA.onStart([]() { Serial.println("[OTA] Mise à jour démarrée..."); });
  ArduinoOTA.onEnd([]()   { Serial.println("\n[OTA] Terminé. Redémarrage..."); });
  ArduinoOTA.onProgress([](unsigned int progress, unsigned int total) {
    Serial.printf("[OTA] Progression: %u%%\r", progress * 100 / total);
  });
  ArduinoOTA.onError([](ota_error_t error) {
    Serial.printf("[OTA] Erreur %u\n", error);
  });
  ArduinoOTA.begin();
  Serial.printf("[OTA] Prêt — hostname: %s\n", MQTT_CLIENT_ID);

  // MQTT
  mqttClient.setServer(MQTT_SERVER, MQTT_PORT);
  mqttClient.setCallback(callback_mqtt);
  connecter_mqtt();

  // BLE
  BLEDevice::init("NearGate");
  bleScan = BLEDevice::getScan();
  bleScan->setAdvertisedDeviceCallbacks(new CallbackBLE(), true);
  bleScan->setActiveScan(true); // scan actif pour recevoir le service data (batterie Feasycom)
  bleScan->setInterval(100);
  bleScan->setWindow(99);
  Serial.println("[BLE] Scanner initialisé.");

  Serial.println("=== Prêt ===\n");
}

// ─── Loop ──────────────────────────────────────────────────────────────────

void loop() {
  // OTA
  ArduinoOTA.handle();

  // Maintien connexion MQTT
  if (!mqttClient.connected()) {
    Serial.println("[MQTT] Déconnecté — reconnexion...");
    connecter_mqtt();
  }
  mqttClient.loop();

  // Heartbeat périodique
  unsigned long maintenant = millis();
  if (maintenant - dernierHeartbeat >= HEARTBEAT_INTERVAL_MS) {
    publier_heartbeat();
    dernierHeartbeat = maintenant;
  }

  // Scan BLE (2 secondes par cycle)
  bleScan->start(2, false);
  bleScan->clearResults();
}
