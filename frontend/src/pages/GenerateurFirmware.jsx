import { useState, useEffect } from 'react'
import { Download, Copy, Check, Code2, Upload, AlertCircle } from 'lucide-react'
import { api } from '../api'

const DEFAULTS = {
  emplacement:   '',
  portail_id:    'entree_ext',
  portail_libre: '',
  uuid:          '9730c8c0-24fe-327a-3f63-623c87e24797',
  pin_relais:    26,
  rssi_seuil:    -90,
  confirmations: 3,
  duree_relais:  2000,
  anti_rebond:   10000,
}

function genererCode(f) {
  const portailId   = f.portail_id === 'custom' ? f.portail_libre.trim() : f.portail_id
  const clientId    = `neargate-esp32-${portailId}`
  const emplacement = f.emplacement.trim() || portailId

  return `/*
 * NearGate — Firmware ESP32
 * Emplacement : ${emplacement}
 *
 * Fonctionnement :
 *  1. Scan BLE en continu
 *  2. Filtre les balises iBeacon par UUID cible
 *  3. Applique un filtre Kalman sur le RSSI
 *  4. Si RSSI filtré >= seuil ET N confirmations consécutives → publie en MQTT
 *  5. Écoute les commandes MQTT du backend (ouverture forcée possible)
 *
 * Topics MQTT :
 *   Envoi    → neargate/detection         (JSON : uuid, rssi, portail_id)
 *   Réception← neargate/commande/${portailId}  (JSON : action "ouvrir")
 */

#include <Arduino.h>
#include <BLEDevice.h>
#include <BLEScan.h>
#include <BLEAdvertisedDevice.h>
#include <WiFi.h>
#include <ArduinoOTA.h>
#include <PubSubClient.h>
#include <ArduinoJson.h>

// ─── Configuration — À MODIFIER si besoin ───────────────────────────────────

// Wi-Fi — Hotspot NearGate (généré par le Raspberry Pi)
const char* WIFI_SSID     = "NearGate";
const char* WIFI_PASSWORD = "NearGate2026!";

// MQTT — IP fixe du Raspberry Pi sur son propre hotspot
const char* MQTT_SERVER   = "192.168.42.1";
const int   MQTT_PORT     = 1883;
const char* MQTT_CLIENT_ID = "${clientId}";
const char* MQTT_USER     = "neargate";
const char* MQTT_PASS     = "NearGate-MQTT-2026!";

// Identifiant de cet ESP32
const char* PORTAIL_ID = "${portailId}";

// UUID iBeacon du badge K7P à détecter
const char* BEACON_UUID_CIBLE = "${f.uuid}";

// Seuil RSSI minimum pour publier vers le backend
const int RSSI_SEUIL = ${f.rssi_seuil};

// Nombre de détections consécutives avant publication
const int CONFIRMATIONS_REQUISES = ${f.confirmations};

// Broche du relais (GPIO)
const int PIN_RELAIS = ${f.pin_relais};

// Durée d'activation du relais en ms
const int DUREE_RELAIS_MS = ${f.duree_relais};

// Durée entre deux ouvertures du même badge (anti-rebond, en ms)
const unsigned long DELAI_ANTI_REBOND_MS = ${f.anti_rebond};

// Intervalle heartbeat (ms)
const unsigned long HEARTBEAT_INTERVAL_MS = 30000;

// ─── Topics MQTT ────────────────────────────────────────────────────────────

char TOPIC_DETECTION[50];
char TOPIC_COMMANDE[50];
char TOPIC_PING[50];

// ─── Variables globales ─────────────────────────────────────────────────────

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

// ─── Filtre Kalman ──────────────────────────────────────────────────────────

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

// ─── Gestion des états par badge ────────────────────────────────────────────

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

// ─── Relais ─────────────────────────────────────────────────────────────────

void actionner_relais() {
  Serial.println("[RELAIS] Ouverture du portail !");
  digitalWrite(PIN_RELAIS, HIGH);
  delay(DUREE_RELAIS_MS);
  digitalWrite(PIN_RELAIS, LOW);
  Serial.println("[RELAIS] Portail refermé.");
}

// ─── MQTT ───────────────────────────────────────────────────────────────────

void publier_heartbeat() {
  if (!mqttClient.connected()) return;
  StaticJsonDocument<96> doc;
  doc["portail_id"] = PORTAIL_ID;
  doc["ip"]         = WiFi.localIP().toString();
  char payload[96];
  serializeJson(doc, payload);
  mqttClient.publish(TOPIC_PING, payload);
  Serial.printf("[MQTT] Heartbeat publié sur %s\\n", TOPIC_PING);
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
  Serial.printf("[MQTT] Publié : %s\\n", payload);
}

void callback_mqtt(char* topic, byte* payload, unsigned int length) {
  String message;
  for (unsigned int i = 0; i < length; i++) message += (char)payload[i];

  Serial.printf("[MQTT] Message reçu sur %s : %s\\n", topic, message.c_str());

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
      Serial.printf("[MQTT] Abonné à : %s\\n", TOPIC_COMMANDE);
    } else {
      Serial.printf("Échec (état=%d). Nouvel essai dans 5s.\\n", mqttClient.state());
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

    char uuid_buf[37];
    const uint8_t* u = (const uint8_t*)dataStr.c_str() + 4;
    snprintf(uuid_buf, sizeof(uuid_buf),
      "%02x%02x%02x%02x-%02x%02x-%02x%02x-%02x%02x-%02x%02x%02x%02x%02x%02x",
      u[0],u[1],u[2],u[3], u[4],u[5], u[6],u[7],
      u[8],u[9], u[10],u[11],u[12],u[13],u[14],u[15]);

    String uuid = String(uuid_buf);

    if (!uuid.equalsIgnoreCase(BEACON_UUID_CIBLE)) return;

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

    Serial.printf("[BLE] UUID: %s | RSSI brut: %d dBm | RSSI filtré: %.1f dBm | Batterie: %d%%\\n",
                  uuid.c_str(), rssi_brut, rssi_filtre, batterie);

    if ((int)rssi_filtre >= RSSI_SEUIL) {
      etat->compteur_confirmations++;
      Serial.printf("[BLE] Confirmation %d/%d\\n",
                    etat->compteur_confirmations, CONFIRMATIONS_REQUISES);

      if (etat->compteur_confirmations >= CONFIRMATIONS_REQUISES) {
        unsigned long maintenant = millis();
        if (etat->jamais_declenche || maintenant - etat->dernier_declenchement_ms > DELAI_ANTI_REBOND_MS) {
          etat->dernier_declenchement_ms = maintenant;
          etat->jamais_declenche         = false;
          etat->compteur_confirmations   = 0;
          publier_detection(uuid, (int)rssi_filtre, batterie);
        } else {
          Serial.println("[BLE] Anti-rebond actif, ouverture ignorée.");
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
  Serial.println("\\n=== NearGate — Démarrage (${emplacement}) ===");

  snprintf(TOPIC_DETECTION, sizeof(TOPIC_DETECTION), "neargate/detection");
  snprintf(TOPIC_COMMANDE,  sizeof(TOPIC_COMMANDE),  "neargate/commande/%s", PORTAIL_ID);
  snprintf(TOPIC_PING,      sizeof(TOPIC_PING),      "neargate/ping/%s",     PORTAIL_ID);

  pinMode(PIN_RELAIS, OUTPUT);
  digitalWrite(PIN_RELAIS, LOW);

  WiFi.mode(WIFI_STA);
  WiFi.disconnect(true);
  delay(500);
  Serial.printf("[WiFi] Connexion à %s...\\n", WIFI_SSID);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  int tentatives = 0;
  while (WiFi.status() != WL_CONNECTED && tentatives < 40) {
    delay(500);
    Serial.print(".");
    tentatives++;
  }
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("\\n[WiFi] Échec connexion — redémarrage dans 10s...");
    delay(10000);
    ESP.restart();
  }
  Serial.printf("\\n[WiFi] Connecté. IP : %s\\n", WiFi.localIP().toString().c_str());

  ArduinoOTA.setHostname(MQTT_CLIENT_ID);
  ArduinoOTA.setPassword("NearGate-OTA-2026!");
  ArduinoOTA.onStart([]() { Serial.println("[OTA] Mise à jour démarrée..."); });
  ArduinoOTA.onEnd([]()   { Serial.println("\\n[OTA] Terminé. Redémarrage..."); });
  ArduinoOTA.onProgress([](unsigned int progress, unsigned int total) {
    Serial.printf("[OTA] Progression: %u%%\\r", progress * 100 / total);
  });
  ArduinoOTA.onError([](ota_error_t error) {
    Serial.printf("[OTA] Erreur %u\\n", error);
  });
  ArduinoOTA.begin();

  mqttClient.setServer(MQTT_SERVER, MQTT_PORT);
  mqttClient.setCallback(callback_mqtt);
  connecter_mqtt();

  BLEDevice::init("NearGate");
  bleScan = BLEDevice::getScan();
  bleScan->setAdvertisedDeviceCallbacks(new CallbackBLE(), true);
  bleScan->setActiveScan(true);
  bleScan->setInterval(100);
  bleScan->setWindow(99);
  Serial.println("[BLE] Scanner initialisé.");

  Serial.println("=== Prêt ===\\n");
}

// ─── Loop ───────────────────────────────────────────────────────────────────

void loop() {
  ArduinoOTA.handle();

  if (!mqttClient.connected()) {
    Serial.println("[MQTT] Déconnecté — reconnexion...");
    connecter_mqtt();
  }
  mqttClient.loop();

  unsigned long maintenant = millis();
  if (maintenant - dernierHeartbeat >= HEARTBEAT_INTERVAL_MS) {
    publier_heartbeat();
    dernierHeartbeat = maintenant;
  }

  bleScan->start(2, false);
  bleScan->clearResults();
}
`
}

export default function GenerateurFirmware() {
  const [form,     setForm]     = useState(DEFAULTS)
  const [code,     setCode]     = useState('')
  const [copie,    setCopie]    = useState(false)
  const [portails, setPortails] = useState([])
  const [uploadFw,      setUploadFw]      = useState({ fichier: null, version: '' })
  const [uploadStatus,  setUploadStatus]  = useState(null) // null | 'loading' | 'ok' | 'err'
  const [uploadMsg,     setUploadMsg]     = useState('')
  const [firmwareInfo,  setFirmwareInfo]  = useState(null)

  useEffect(() => {
    api.portails().then(liste => setPortails(liste)).catch(() => {})
    api.firmwareInfo().then(setFirmwareInfo).catch(() => {})
  }, [])

  function maj(champ, valeur) {
    setForm(f => ({ ...f, [champ]: valeur }))
    setCode('')
  }

  async function soumettreUpload(e) {
    e.preventDefault()
    if (!uploadFw.fichier || !uploadFw.version.trim()) return
    setUploadStatus('loading')
    setUploadMsg('')
    try {
      const formData = new FormData()
      formData.append('file', uploadFw.fichier)
      formData.append('version', uploadFw.version.trim())
      const token = localStorage.getItem('ng_token')
      const API_BASE = import.meta.env.VITE_API_URL || ''
      const resp = await fetch(`${API_BASE}/api/firmware/upload`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      })
      const data = await resp.json()
      if (!resp.ok) throw new Error(data.detail || 'Erreur upload')
      setUploadStatus('ok')
      setUploadMsg(data.message)
      setFirmwareInfo({ version: uploadFw.version.trim(), disponible: true, date: new Date().toISOString() })
      setUploadFw({ fichier: null, version: '' })
    } catch (err) {
      setUploadStatus('err')
      setUploadMsg(err.message)
    }
  }

  function generer() {
    const portailId = form.portail_id === 'custom' ? form.portail_libre.trim() : form.portail_id
    if (!portailId) { alert('Veuillez saisir un identifiant de portail.'); return }
    if (!form.uuid.trim()) { alert('Veuillez saisir l\'UUID iBeacon.'); return }
    setCode(genererCode(form))
  }

  async function copier() {
    await navigator.clipboard.writeText(code)
    setCopie(true)
    setTimeout(() => setCopie(false), 2000)
  }

  function telecharger() {
    const portailId = form.portail_id === 'custom' ? form.portail_libre.trim() : form.portail_id
    const nom       = `NearGate_ESP32_${portailId}`
    const blob      = new Blob([code], { type: 'text/plain' })
    const url       = URL.createObjectURL(blob)
    const a         = document.createElement('a')
    a.href          = url
    a.download      = `${nom}.ino`
    a.click()
    URL.revokeObjectURL(url)
  }

  const portailId = form.portail_id === 'custom' ? form.portail_libre.trim() : form.portail_id

  return (
    <div className="fade-up">
      <div className="page-header">
        <h1>Générateur de firmware</h1>
        <p>Configurez les paramètres de votre nouvel ESP32 et téléchargez le fichier <code>.ino</code> prêt à flasher</p>
      </div>

      {/* ── Déployer le firmware ── */}
      <div className="box" style={{ marginBottom: 24 }}>
        <div className="box-header">
          <h2><Upload size={15} /> Déployer le firmware sur les radars</h2>
          {firmwareInfo?.disponible && (
            <span style={{ fontSize: 13, color: '#00F5A0' }}>
              Version actuelle sur le serveur : <strong style={{ fontFamily: 'monospace' }}>v{firmwareInfo.version}</strong>
              {firmwareInfo.date && <span style={{ color: 'var(--slate)', marginLeft: 8 }}>({firmwareInfo.date?.slice(0, 10)})</span>}
            </span>
          )}
        </div>
        <div className="box-body">
          <p className="text-muted text-sm" style={{ marginBottom: 16, lineHeight: 1.7 }}>
            Compilez le firmware dans Arduino IDE (<strong>Croquis → Exporter les binaires compilés</strong>), puis uploadez le fichier <code>.bin</code> ici.
            Le bouton <strong>Mettre à jour</strong> apparaîtra ensuite automatiquement sur chaque radar qui n'est pas à jour dans la page <strong>NearGate Radars</strong>.
          </p>
          <form onSubmit={soumettreUpload} style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <div className="field" style={{ flex: '1 1 220px', marginBottom: 0 }}>
              <label>Fichier .bin compilé</label>
              <input
                type="file"
                accept=".bin"
                onChange={e => setUploadFw(f => ({ ...f, fichier: e.target.files[0] || null }))}
                required
                style={{ background: 'var(--navy-light)', border: '1px solid var(--border)', borderRadius: 6, padding: '6px 10px', fontSize: 13, color: 'var(--text)', width: '100%' }}
              />
            </div>
            <div className="field" style={{ flex: '0 1 160px', marginBottom: 0 }}>
              <label>Numéro de version</label>
              <input
                placeholder="ex : 2.2.0"
                value={uploadFw.version}
                onChange={e => setUploadFw(f => ({ ...f, version: e.target.value }))}
                required
                style={{ fontFamily: 'monospace', fontSize: 13 }}
              />
            </div>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={uploadStatus === 'loading' || !uploadFw.fichier || !uploadFw.version}
              style={{ flexShrink: 0 }}
            >
              <Upload size={14} /> {uploadStatus === 'loading' ? 'Upload en cours…' : 'Uploader'}
            </button>
          </form>
          {uploadMsg && (
            <div style={{
              marginTop: 12, padding: '8px 14px', borderRadius: 8, fontSize: 13,
              background: uploadStatus === 'ok' ? '#00F5A022' : '#FF6B6B22',
              border: `1px solid ${uploadStatus === 'ok' ? '#00F5A055' : '#FF6B6B55'}`,
              color: uploadStatus === 'ok' ? '#00F5A0' : '#FF6B6B',
            }}>
              {uploadMsg}
            </div>
          )}
        </div>
      </div>

      <div className="box">
        <div className="box-header"><h2>Paramètres de l'ESP32</h2></div>
        <div className="box-body">

          {/* Emplacement */}
          <div className="field" style={{ marginBottom: 20 }}>
            <label>Emplacement <span className="text-muted text-sm">(description libre)</span></label>
            <input
              placeholder="ex : Entrée parking Nord, Sortie sous-sol..."
              value={form.emplacement}
              onChange={e => maj('emplacement', e.target.value)}
            />
          </div>

          {/* Identifiant portail */}
          <div className="field" style={{ marginBottom: form.portail_id === 'custom' ? 8 : 20 }}>
            <label>Identifiant du portail</label>
            <select value={form.portail_id} onChange={e => maj('portail_id', e.target.value)}>
              {portails.map(p => (
                <option key={p.portail_id} value={p.portail_id}>
                  {p.nom} ({p.portail_id})
                </option>
              ))}
              <option value="custom">Autre (saisie libre)</option>
            </select>
            <div className="text-muted text-sm" style={{ marginTop: 4 }}>
              Client MQTT généré : <code>neargate-esp32-{portailId || '…'}</code>
            </div>
          </div>

          {form.portail_id === 'custom' && (
            <div className="field" style={{ marginBottom: 20 }}>
              <label>Identifiant personnalisé <span className="text-muted text-sm">(sans espaces)</span></label>
              <input
                placeholder="ex : entree_parking_b"
                value={form.portail_libre}
                onChange={e => maj('portail_libre', e.target.value.replace(/\s/g, '_').toLowerCase())}
              />
            </div>
          )}

          {/* UUID */}
          <div className="field" style={{ marginBottom: 20 }}>
            <label>UUID iBeacon du badge K7P</label>
            <input
              placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
              value={form.uuid}
              onChange={e => maj('uuid', e.target.value)}
              style={{ fontFamily: 'monospace', fontSize: 13 }}
            />
            <div className="text-muted text-sm" style={{ marginTop: 4 }}>
              Identifiant unique de votre badge — visible dans l'app K7P ou sur l'étiquette du badge
            </div>
          </div>

          {/* Paramètres avancés */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 16, marginBottom: 8 }}>

            <div className="field">
              <label>GPIO du relais</label>
              <input type="number" value={form.pin_relais}
                onChange={e => maj('pin_relais', parseInt(e.target.value))} />
              <div className="text-muted text-sm" style={{ marginTop: 4 }}>Par défaut : 26</div>
            </div>

            <div className="field">
              <label>Seuil RSSI (dBm)</label>
              <input type="number" value={form.rssi_seuil}
                onChange={e => maj('rssi_seuil', parseInt(e.target.value))} />
              <div className="text-muted text-sm" style={{ marginTop: 4 }}>Signal min pour publier. Ex : -90</div>
            </div>

            <div className="field">
              <label>Confirmations requises</label>
              <input type="number" min={1} max={10} value={form.confirmations}
                onChange={e => maj('confirmations', parseInt(e.target.value))} />
              <div className="text-muted text-sm" style={{ marginTop: 4 }}>Détections consécutives. Ex : 3</div>
            </div>

            <div className="field">
              <label>Durée impulsion relais (ms)</label>
              <input type="number" min={500} value={form.duree_relais}
                onChange={e => maj('duree_relais', parseInt(e.target.value))} />
              <div className="text-muted text-sm" style={{ marginTop: 4 }}>Temps d'ouverture. Ex : 2000</div>
            </div>

            <div className="field">
              <label>Anti-rebond (ms)</label>
              <input type="number" min={1000} value={form.anti_rebond}
                onChange={e => maj('anti_rebond', parseInt(e.target.value))} />
              <div className="text-muted text-sm" style={{ marginTop: 4 }}>Délai entre 2 ouvertures. Ex : 10000</div>
            </div>

          </div>

        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'center', margin: '24px 0' }}>
        <button className="btn btn-primary" onClick={generer} style={{ fontSize: 15, padding: '10px 28px' }}>
          <Code2 size={16} /> Générer le code firmware
        </button>
      </div>

      {code && (
        <div className="box">
          <div className="box-header">
            <h2>Code généré — <code>NearGate_ESP32_{portailId}.ino</code></h2>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-ghost btn-sm" onClick={copier}>
                {copie ? <><Check size={13} /> Copié !</> : <><Copy size={13} /> Copier</>}
              </button>
              <button className="btn btn-primary btn-sm" onClick={telecharger}>
                <Download size={13} /> Télécharger .ino
              </button>
            </div>
          </div>
          <div style={{ position: 'relative' }}>
            <pre style={{
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              borderRadius: 8,
              padding: '16px 20px',
              fontSize: 12,
              lineHeight: 1.6,
              overflowX: 'auto',
              overflowY: 'auto',
              maxHeight: 500,
              margin: 0,
              color: 'var(--text)',
              fontFamily: 'monospace',
            }}>
              {code}
            </pre>
          </div>
          <div className="box-body" style={{ paddingTop: 16 }}>
            <div className="text-muted text-sm" style={{ lineHeight: 1.7 }}>
              <strong>Instructions de flashage :</strong><br />
              1. Ouvrez l'Arduino IDE et créez un nouveau projet nommé <code>NearGate_ESP32_{portailId}</code><br />
              2. Collez le code ou déposez le fichier <code>.ino</code> téléchargé dans le dossier du projet<br />
              3. Sélectionnez la carte <strong>ESP32 Dev Module</strong> dans Outils → Type de carte<br />
              4. Connectez l'ESP32 en USB et sélectionnez le bon port COM<br />
              5. Cliquez sur <strong>Téléverser</strong> (flèche →)<br />
              6. Ouvrez le moniteur série (115200 bauds) pour vérifier la connexion Wi-Fi et MQTT
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
