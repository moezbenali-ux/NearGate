/*
 * NearGate — Firmware ESP32
 *
 * Fonctionnement :
 *  1. Scan BLE en continu
 *  2. Filtre les balises iBeacon (optionnel par UUID)
 *  3. Applique un filtre Kalman sur le RSSI
 *  4. Si RSSI filtré >= seuil ET N confirmations consécutives → publie MQTT
 *  5. Le backend décide d'ouvrir → envoie commande "ouvrir"
 *  6. L'ESP32 vérifie la présence physique du véhicule (JSN-SR04T)
 *  7. Ouvre le relais et le maintient ouvert tant que le véhicule est présent
 *
 * Identification : l'ESP32 utilise son adresse MAC comme identifiant unique.
 * L'association MAC ↔ portail se configure dans le dashboard NearGate.
 * Aucune modification du firmware n'est nécessaire lors du déploiement.
 *
 * Topics MQTT :
 *   Envoi    → neargate/detection          (JSON : uuid, major, minor, rssi, esp32_id)
 *   Envoi    → neargate/ping/{mac}         (JSON : esp32_id, ip, capteur_actif)
 *   Réception← neargate/commande/{mac}     (JSON : action "ouvrir" | "config_capteur")
 */

#include <Arduino.h>
#include <BLEDevice.h>
#include <BLEScan.h>
#include <BLEAdvertisedDevice.h>
#include <WiFi.h>
#include <ArduinoOTA.h>
#include <HTTPUpdate.h>
#include <PubSubClient.h>
#include <ArduinoJson.h>

// ─── Version firmware ───────────────────────────────────────────────────────

#define FIRMWARE_VERSION "2.3.0"

// ─── Configuration — À MODIFIER ────────────────────────────────────────────

// Wi-Fi — Hotspot NearGate (toujours fixe, généré par le Raspberry Pi)
const char* WIFI_SSID     = "NearGate";
const char* WIFI_PASSWORD = "NearGate2026!";

// MQTT — IP fixe du Raspberry Pi sur son propre hotspot
const char* MQTT_SERVER = "192.168.42.1";
const int   MQTT_PORT   = 1883;
const char* MQTT_USER   = "neargate";
const char* MQTT_PASS   = "NearGate-MQTT-2026!";

// Identifiant calculé automatiquement depuis l'adresse MAC WiFi (plus de config manuelle)
char esp32_mac[13];       // ex: "a4cf12abcdef"
char mqtt_client_id[30];  // ex: "neargate-a4cf12abcdef"

// Filtre UUID optionnel — laisser vide "" pour accepter tous les iBeacons
const char* BEACON_UUID_FILTRE = "";

// Seuil RSSI minimum pour publier vers le backend
const int RSSI_SEUIL = -90;

// Nombre de détections consécutives avant publication MQTT
const int CONFIRMATIONS_REQUISES = 3;

// ─── Broches ────────────────────────────────────────────────────────────────

const int PIN_RELAIS = 26;
const int PIN_TRIG   = 27;   // JSN-SR04T TRIG
const int PIN_ECHO   = 14;   // JSN-SR04T ECHO

// ─── Paramètres capteur ultrason ────────────────────────────────────────────

// Distance maximale pour considérer un véhicule présent (cm)
const float DISTANCE_SEUIL_CM = 200.0;

// Durée minimale d'ouverture du relais (ms) — même si véhicule passe vite
const unsigned long MAINTIEN_MIN_MS = 2000;

// Durée maximale de sécurité (ms) — fermeture forcée si véhicule bloquant ou capteur KO
const unsigned long MAINTIEN_MAX_MS = 30000;

// Intervalle entre deux mesures de distance pendant le maintien (ms)
const unsigned long INTERVALLE_MESURE_MS = 300;

// ─── Paramètres BLE / anti-rebond ───────────────────────────────────────────

const unsigned long DELAI_ANTI_REBOND_MS = 10000;

// ─── Paramètres MQTT ────────────────────────────────────────────────────────

const unsigned long HEARTBEAT_INTERVAL_MS  = 30000;
const unsigned long DISTANCE_INTERVAL_MS   = 2000;

// ─── Topics MQTT ────────────────────────────────────────────────────────────

char TOPIC_DETECTION[50];
char TOPIC_COMMANDE[50];
char TOPIC_PING[50];
char TOPIC_DISTANCE[55];

// ─── Variables globales ─────────────────────────────────────────────────────

unsigned long dernierHeartbeat   = 0;
unsigned long derniereMesure     = 0;
unsigned long derniereDistance   = 0;

// État du relais (non-bloquant)
bool          relais_ouvert         = false;
unsigned long relais_ouvert_depuis  = 0;

// Demande d'ouverture posée par le callback MQTT, traitée dans loop()
volatile bool demande_ouverture = false;

// OTA HTTP (mise à jour depuis le dashboard)
volatile bool demande_ota_http = false;
String        ota_http_url     = "";

// Capteur ultrason actif ou bypasser (modifiable via MQTT)
bool capteur_actif = true;

WiFiClient   wifiClient;
PubSubClient mqttClient(wifiClient);
BLEScan*     bleScan;

// ─── Filtre Kalman ──────────────────────────────────────────────────────────

struct KalmanState {
  float estimation;
  float erreur;
  bool  initialise;
};

struct EntreeKalman {
  String     uuid;
  KalmanState kalman;
  int          compteur_confirmations;
  unsigned long dernier_declenchement_ms;
  bool         jamais_declenche;
};

const int MAX_BADGES_SIMULTANES = 10;
EntreeKalman etatsKalman[MAX_BADGES_SIMULTANES];
int nbEtats = 0;

float kalman_filtrer(KalmanState& etat, float mesure) {
  const float Q = 0.5;
  const float R = 3.0;

  if (!etat.initialise) {
    etat.estimation = mesure;
    etat.erreur     = 1.0;
    etat.initialise = true;
    return mesure;
  }

  float erreur_pred = etat.erreur + Q;
  float gain        = erreur_pred / (erreur_pred + R);
  etat.estimation   = etat.estimation + gain * (mesure - etat.estimation);
  etat.erreur       = (1 - gain) * erreur_pred;
  return etat.estimation;
}

EntreeKalman* obtenir_etat(const String& uuid) {
  for (int i = 0; i < nbEtats; i++) {
    if (etatsKalman[i].uuid == uuid) return &etatsKalman[i];
  }
  if (nbEtats < MAX_BADGES_SIMULTANES) {
    etatsKalman[nbEtats] = {uuid, {0, 1, false}, 0, 0, true};
    return &etatsKalman[nbEtats++];
  }
  return nullptr;
}

// ─── Capteur ultrason JSN-SR04T ─────────────────────────────────────────────

// Retourne la distance en cm. Retourne 999.0 si pas d'écho (rien devant).
float mesurer_distance() {
  digitalWrite(PIN_TRIG, LOW);
  delayMicroseconds(2);
  digitalWrite(PIN_TRIG, HIGH);
  delayMicroseconds(10);
  digitalWrite(PIN_TRIG, LOW);

  // Timeout 30ms → distance max ~5m (largement suffisant)
  long duree = pulseIn(PIN_ECHO, HIGH, 30000UL);
  if (duree == 0) return 999.0;
  return duree * 0.034f / 2.0f;
}

// Retourne true si un véhicule est présent (ou si capteur bypassed)
bool vehicule_present() {
  if (!capteur_actif) return true;
  float dist = mesurer_distance();
  Serial.printf("[ULTRA] Distance : %.1f cm (seuil : %.0f cm)\n", dist, DISTANCE_SEUIL_CM);
  return dist < DISTANCE_SEUIL_CM;
}

// ─── Relais (non-bloquant) ──────────────────────────────────────────────────

void ouvrir_portail() {
  if (relais_ouvert) return;
  Serial.println("[RELAIS] Ouverture du portail !");
  digitalWrite(PIN_RELAIS, HIGH);
  relais_ouvert        = true;
  relais_ouvert_depuis = millis();
}

void fermer_portail() {
  if (!relais_ouvert) return;
  digitalWrite(PIN_RELAIS, LOW);
  relais_ouvert = false;
  Serial.printf("[RELAIS] Portail refermé (ouvert pendant %lus).\n",
                (millis() - relais_ouvert_depuis) / 1000);
}

// ─── MQTT ───────────────────────────────────────────────────────────────────

void publier_heartbeat() {
  if (!mqttClient.connected()) return;
  StaticJsonDocument<256> doc;
  doc["esp32_id"]          = esp32_mac;
  doc["ip"]                = WiFi.localIP().toString();
  doc["capteur_actif"]     = capteur_actif;
  doc["firmware_version"]  = FIRMWARE_VERSION;
  if (capteur_actif) {
    float dist = mesurer_distance();
    doc["distance_cm"] = (int)dist;
  }
  char payload[256];
  serializeJson(doc, payload);
  mqttClient.publish(TOPIC_PING, payload);
  Serial.printf("[MQTT] Heartbeat publié sur %s\n", TOPIC_PING);
}

void publier_distance() {
  if (!mqttClient.connected() || !capteur_actif) return;
  float dist = mesurer_distance();
  StaticJsonDocument<64> doc;
  doc["distance_cm"] = (int)dist;
  char payload[64];
  serializeJson(doc, payload);
  mqttClient.publish(TOPIC_DISTANCE, payload);
}

void publier_detection(const String& uuid, int major, int minor, int rssi, int batterie) {
  if (!mqttClient.connected()) return;

  StaticJsonDocument<200> doc;
  doc["uuid"]     = uuid;
  doc["major"]    = major;
  doc["minor"]    = minor;
  doc["rssi"]     = rssi;
  doc["esp32_id"] = esp32_mac;
  if (batterie >= 0) doc["batterie"] = batterie;

  char payload[200];
  serializeJson(doc, payload);
  mqttClient.publish(TOPIC_DETECTION, payload);
  Serial.printf("[MQTT] Publié : %s\n", payload);
}

void callback_mqtt(char* topic, byte* payload, unsigned int length) {
  String message;
  for (unsigned int i = 0; i < length; i++) message += (char)payload[i];

  Serial.printf("[MQTT] Message reçu sur %s : %s\n", topic, message.c_str());

  StaticJsonDocument<128> doc;
  if (deserializeJson(doc, message) != DeserializationError::Ok) return;

  const char* action = doc["action"];
  if (!action) return;

  if (strcmp(action, "ouvrir") == 0) {
    // Demande posée — traitée dans loop() pour éviter pulseIn dans un callback
    demande_ouverture = true;
  }
  else if (strcmp(action, "config_capteur") == 0) {
    capteur_actif = doc["actif"] | true;
    Serial.printf("[CONFIG] Capteur ultrason : %s\n", capteur_actif ? "actif" : "bypassé");
  }
  else if (strcmp(action, "ota_http") == 0) {
    const char* url = doc["url"];
    if (url && strlen(url) > 0) {
      ota_http_url   = String(url);
      demande_ota_http = true;
      Serial.printf("[OTA-HTTP] Mise à jour demandée : %s\n", url);
    }
  }
}

void connecter_mqtt() {
  while (!mqttClient.connected()) {
    Serial.print("[MQTT] Connexion au broker... ");
    if (mqttClient.connect(mqtt_client_id, MQTT_USER, MQTT_PASS)) {
      Serial.println("Connecté.");
      mqttClient.subscribe(TOPIC_COMMANDE);
      Serial.printf("[MQTT] Abonné à : %s\n", TOPIC_COMMANDE);
    } else {
      Serial.printf("Échec (état=%d). Nouvel essai dans 5s.\n", mqttClient.state());
      delay(5000);
    }
  }
}

// ─── BLE — Callback de détection ────────────────────────────────────────────

class CallbackBLE : public BLEAdvertisedDeviceCallbacks {
  void onResult(BLEAdvertisedDevice device) {

    if (!device.haveManufacturerData()) return;

    String dataStr = device.getManufacturerData();
    if (dataStr.length() < 25) return;
    if ((uint8_t)dataStr[0] != 0x4C || (uint8_t)dataStr[1] != 0x00) return;
    if ((uint8_t)dataStr[2] != 0x02 || (uint8_t)dataStr[3] != 0x15) return;

    // UUID (octets 4-19)
    char uuid_buf[37];
    const uint8_t* u = (const uint8_t*)dataStr.c_str() + 4;
    snprintf(uuid_buf, sizeof(uuid_buf),
      "%02x%02x%02x%02x-%02x%02x-%02x%02x-%02x%02x-%02x%02x%02x%02x%02x%02x",
      u[0],u[1],u[2],u[3], u[4],u[5], u[6],u[7],
      u[8],u[9], u[10],u[11],u[12],u[13],u[14],u[15]);
    String uuid = String(uuid_buf);

    if (strlen(BEACON_UUID_FILTRE) > 0 && !uuid.equalsIgnoreCase(BEACON_UUID_FILTRE)) return;

    // Major et Minor (octets 20-23)
    int major = ((uint8_t)dataStr[20] << 8) | (uint8_t)dataStr[21];
    int minor = ((uint8_t)dataStr[22] << 8) | (uint8_t)dataStr[23];

    // Batterie Feasycom (service data UUID FFF0, dernier octet)
    int batterie = -1;
    if (device.haveServiceData()) {
      String svcData = device.getServiceData();
      if (svcData.length() >= 11) {
        batterie = (uint8_t)svcData[10];
      }
    }

    String badge_key = uuid + ":" + String(minor);

    int rssi_brut = device.getRSSI();
    EntreeKalman* etat = obtenir_etat(badge_key);
    if (!etat) return;

    float rssi_filtre = kalman_filtrer(etat->kalman, (float)rssi_brut);

    Serial.printf("[BLE] %s | Major: %d | Minor: %d | RSSI brut: %d | filtré: %.1f | Batterie: %d%%\n",
                  badge_key.c_str(), major, minor, rssi_brut, (int)rssi_filtre, batterie);

    if ((int)rssi_filtre >= RSSI_SEUIL) {
      etat->compteur_confirmations++;
      Serial.printf("[BLE] Confirmation %d/%d\n", etat->compteur_confirmations, CONFIRMATIONS_REQUISES);

      if (etat->compteur_confirmations >= CONFIRMATIONS_REQUISES) {
        unsigned long maintenant = millis();
        if (etat->jamais_declenche || maintenant - etat->dernier_declenchement_ms > DELAI_ANTI_REBOND_MS) {
          etat->dernier_declenchement_ms = maintenant;
          etat->jamais_declenche         = false;
          etat->compteur_confirmations   = 0;
          publier_detection(uuid, major, minor, (int)rssi_filtre, batterie);
        } else {
          Serial.println("[BLE] Anti-rebond actif, ignoré.");
          etat->compteur_confirmations = 0;
        }
      }
    } else {
      etat->compteur_confirmations = 0;
    }
  }
};

// ─── Setup ──────────────────────────────────────────────────────────────────

void setup() {
  Serial.begin(115200);
  Serial.println("\n=== NearGate — Démarrage ===");

  // Relais
  pinMode(PIN_RELAIS, OUTPUT);
  digitalWrite(PIN_RELAIS, LOW);

  // Capteur ultrason
  pinMode(PIN_TRIG, OUTPUT);
  pinMode(PIN_ECHO, INPUT);
  digitalWrite(PIN_TRIG, LOW);
  Serial.printf("[ULTRA] JSN-SR04T — TRIG: GPIO%d, ECHO: GPIO%d, seuil: %.0f cm\n",
                PIN_TRIG, PIN_ECHO, DISTANCE_SEUIL_CM);

  // Wi-Fi
  WiFi.mode(WIFI_STA);
  WiFi.disconnect(true);
  delay(500);
  Serial.printf("[WiFi] Connexion à %s...\n", WIFI_SSID);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  int tentatives = 0;
  while (WiFi.status() != WL_CONNECTED && tentatives < 40) {
    delay(500);
    Serial.print(".");
    tentatives++;
  }
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("\n[WiFi] Échec connexion — redémarrage dans 10s...");
    delay(10000);
    ESP.restart();
  }
  Serial.printf("\n[WiFi] Connecté. IP : %s\n", WiFi.localIP().toString().c_str());

  // Identifiant unique : adresse MAC WiFi
  String macStr = WiFi.macAddress();
  macStr.replace(":", "");
  macStr.toLowerCase();
  macStr.toCharArray(esp32_mac, sizeof(esp32_mac));
  snprintf(mqtt_client_id, sizeof(mqtt_client_id), "neargate-%s", esp32_mac);
  Serial.printf("[ID] ESP32 MAC : %s\n", esp32_mac);

  // Topics MQTT
  snprintf(TOPIC_DETECTION, sizeof(TOPIC_DETECTION), "neargate/detection");
  snprintf(TOPIC_COMMANDE,  sizeof(TOPIC_COMMANDE),  "neargate/commande/%s", esp32_mac);
  snprintf(TOPIC_PING,      sizeof(TOPIC_PING),      "neargate/ping/%s",     esp32_mac);
  snprintf(TOPIC_DISTANCE,  sizeof(TOPIC_DISTANCE),  "neargate/distance/%s", esp32_mac);

  // OTA
  ArduinoOTA.setHostname(mqtt_client_id);
  ArduinoOTA.setPassword("NearGate-OTA-2026!");
  ArduinoOTA.onStart([]()  { Serial.println("[OTA] Mise à jour démarrée..."); });
  ArduinoOTA.onEnd([]()    { Serial.println("\n[OTA] Terminé. Redémarrage..."); });
  ArduinoOTA.onProgress([](unsigned int progress, unsigned int total) {
    Serial.printf("[OTA] Progression: %u%%\r", progress * 100 / total);
  });
  ArduinoOTA.onError([](ota_error_t error) {
    Serial.printf("[OTA] Erreur %u\n", error);
  });
  ArduinoOTA.begin();
  Serial.printf("[OTA] Prêt — hostname: %s\n", mqtt_client_id);

  // MQTT
  mqttClient.setServer(MQTT_SERVER, MQTT_PORT);
  mqttClient.setCallback(callback_mqtt);
  connecter_mqtt();

  // BLE
  BLEDevice::init("NearGate");
  bleScan = BLEDevice::getScan();
  bleScan->setAdvertisedDeviceCallbacks(new CallbackBLE(), true);
  bleScan->setActiveScan(true);
  bleScan->setInterval(100);
  bleScan->setWindow(99);
  Serial.println("[BLE] Scanner initialisé.");

  Serial.println("=== Prêt ===\n");
}

// ─── Loop ───────────────────────────────────────────────────────────────────

void loop() {
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

  // Distance toutes les 2s (si capteur actif)
  if (capteur_actif && maintenant - derniereDistance >= DISTANCE_INTERVAL_MS) {
    publier_distance();
    derniereDistance = maintenant;
  }

  // ── Traitement demande d'ouverture (posée par callback MQTT) ──────────────
  if (demande_ouverture) {
    demande_ouverture = false;
    if (vehicule_present()) {
      ouvrir_portail();
    } else {
      Serial.println("[RELAIS] Ouverture refusée : aucun véhicule détecté.");
    }
  }

  // ── Maintien automatique du relais tant que le véhicule est présent ────────
  if (relais_ouvert) {
    unsigned long ouvert_depuis = millis() - relais_ouvert_depuis;

    if (ouvert_depuis >= MAINTIEN_MAX_MS) {
      // Sécurité : fermeture forcée après 30s
      Serial.println("[RELAIS] Fermeture forcée (timeout sécurité 30s).");
      fermer_portail();
    } else if (ouvert_depuis >= MAINTIEN_MIN_MS) {
      // Vérification périodique de la présence
      unsigned long now = millis();
      if (now - derniereMesure >= INTERVALLE_MESURE_MS) {
        derniereMesure = now;
        if (!vehicule_present()) {
          Serial.println("[RELAIS] Véhicule parti — fermeture.");
          fermer_portail();
        }
      }
    }
  }

  // ── OTA HTTP (mise à jour firmware depuis le dashboard) ───────────────────
  if (demande_ota_http) {
    demande_ota_http = false;
    Serial.println("[OTA-HTTP] Démarrage — arrêt du scan BLE...");
    bleScan->stop();
    mqttClient.disconnect();

    WiFiClient updateClient;
    httpUpdate.rebootOnUpdate(true);

    Serial.printf("[OTA-HTTP] Téléchargement depuis : %s\n", ota_http_url.c_str());
    t_httpUpdate_return ret = httpUpdate.update(updateClient, ota_http_url);

    switch (ret) {
      case HTTP_UPDATE_FAILED:
        Serial.printf("[OTA-HTTP] Échec (%d) : %s\n",
                      httpUpdate.getLastError(),
                      httpUpdate.getLastErrorString().c_str());
        break;
      case HTTP_UPDATE_NO_UPDATES:
        Serial.println("[OTA-HTTP] Pas de mise à jour (même version).");
        break;
      case HTTP_UPDATE_OK:
        Serial.println("[OTA-HTTP] Succès — redémarrage...");
        break;
    }
    // Si pas de reboot automatique (update échouée), on reconnecte
    connecter_mqtt();
  }

  // Scan BLE (2 secondes par cycle)
  bleScan->start(2, false);
  bleScan->clearResults();
}
