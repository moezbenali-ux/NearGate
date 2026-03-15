"""
Client MQTT — NearGate
Machine d'états par badge :
  LIBRE      : peut déclencher une ENTRÉE (via ESP32 extérieur, RSSI >= seuil_entree)
  INTÉRIEUR  : peut déclencher une SORTIE (via ESP32 intérieur, RSSI >= seuil_sortie)

Auto-libération :
  - RSSI < rssi_oubli sur n'importe quel ESP32
  - Badge non vu depuis timeout_non_vu_min minutes
  - Badge INTÉRIEUR depuis plus de timeout_interieur_min minutes (sécurité)

Topics :
  Réception : neargate/detection
  Envoi     : neargate/commande/{portail_id}
"""

import json
import os
import logging
import threading
import time
from datetime import datetime, timedelta

import paho.mqtt.client as mqtt
from dotenv import load_dotenv
from database import get_connection

load_dotenv()

logger = logging.getLogger("neargate.mqtt")

BROKER   = os.getenv("MQTT_BROKER", "127.0.0.1")
PORT     = int(os.getenv("MQTT_PORT", 1883))
USERNAME = os.getenv("MQTT_USERNAME", "")
PASSWORD = os.getenv("MQTT_PASSWORD", "")

TOPIC_DETECTION = "neargate/detection"
TOPIC_COMMANDE  = "neargate/commande/{portail_id}"
TOPIC_PING      = "neargate/ping/+"

# IDs des ESP32
ESP32_EXT = "entree_ext"
ESP32_INT = "entree_int"

# Suivi connectivité ESP32 (en mémoire)
esp32_status: dict = {
    ESP32_EXT: {"vu_le": None, "ip": None, "label": "Entrée extérieure"},
    ESP32_INT: {"vu_le": None, "ip": None, "label": "Entrée intérieure"},
}


# ─── Helpers config / DB ───────────────────────────────────────────────────

def _get_config(cle):
    conn = get_connection()
    row = conn.execute("SELECT valeur FROM config WHERE cle = ?", (cle,)).fetchone()
    conn.close()
    return row["valeur"] if row else None


def _badge_autorise(uuid):
    conn = get_connection()
    row = conn.execute("SELECT actif FROM badges WHERE uuid = ?", (uuid,)).fetchone()
    conn.close()
    return bool(row and row["actif"])


def _get_etat(uuid):
    conn = get_connection()
    row = conn.execute("SELECT * FROM badges_etat WHERE uuid = ?", (uuid,)).fetchone()
    conn.close()
    return dict(row) if row else None


def _set_etat(uuid, etat, rssi):
    now = datetime.now().isoformat(sep=" ", timespec="seconds")
    conn = get_connection()
    if etat == "interieur":
        conn.execute("""
            INSERT INTO badges_etat (uuid, etat, entre_le, last_seen_at, last_seen_rssi)
            VALUES (?, 'interieur', ?, ?, ?)
            ON CONFLICT(uuid) DO UPDATE SET
                etat='interieur', entre_le=?, last_seen_at=?, last_seen_rssi=?
        """, (uuid, now, now, rssi, now, now, rssi))
    else:
        conn.execute("DELETE FROM badges_etat WHERE uuid = ?", (uuid,))
    conn.commit()
    conn.close()


def _update_last_seen(uuid, rssi):
    now = datetime.now().isoformat(sep=" ", timespec="seconds")
    conn = get_connection()
    conn.execute("""
        UPDATE badges_etat SET last_seen_at = ?, last_seen_rssi = ?
        WHERE uuid = ?
    """, (now, rssi, uuid))
    conn.commit()
    conn.close()


def _enregistrer_evenement(uuid, rssi, action, portail_id, direction):
    conn = get_connection()
    conn.execute(
        "INSERT INTO evenements (badge_uuid, rssi, action, direction, portail_id) VALUES (?, ?, ?, ?, ?)",
        (uuid, rssi, action, direction, portail_id),
    )
    conn.commit()
    conn.close()


# ─── Machine d'états ───────────────────────────────────────────────────────

def traiter_detection(mqtt_client_instance, uuid, rssi, portail_id):
    if not _badge_autorise(uuid):
        logger.info("Badge %s non autorisé → refus", uuid)
        _enregistrer_evenement(uuid, rssi, "refus", portail_id, "inconnu")
        return

    seuil_entree = int(_get_config("rssi_seuil_entree") or -70)
    seuil_sortie = int(_get_config("rssi_seuil_sortie") or -55)
    rssi_oubli   = int(_get_config("rssi_oubli") or -90)

    etat_row = _get_etat(uuid)
    etat = etat_row["etat"] if etat_row else "libre"

    # Auto-libération si RSSI trop faible
    if rssi < rssi_oubli and etat == "interieur":
        logger.info("Badge %s — RSSI %d trop faible → libéré automatiquement", uuid, rssi)
        _set_etat(uuid, "libre", rssi)
        return

    if etat == "libre":
        if portail_id == ESP32_EXT and rssi >= seuil_entree:
            logger.info("Badge %s — ENTRÉE autorisée (RSSI %d)", uuid, rssi)
            topic = TOPIC_COMMANDE.format(portail_id=ESP32_EXT)
            mqtt_client_instance.publish(topic, json.dumps({"action": "ouvrir"}))
            _set_etat(uuid, "interieur", rssi)
            _enregistrer_evenement(uuid, rssi, "ouverture", portail_id, "entree")
        else:
            logger.debug("Badge %s LIBRE — pas de déclenchement (portail=%s, RSSI=%d)",
                         uuid, portail_id, rssi)

    elif etat == "interieur":
        _update_last_seen(uuid, rssi)

        if portail_id == ESP32_INT and rssi >= seuil_sortie:
            logger.info("Badge %s — SORTIE autorisée (RSSI %d)", uuid, rssi)
            topic = TOPIC_COMMANDE.format(portail_id=ESP32_INT)
            mqtt_client_instance.publish(topic, json.dumps({"action": "ouvrir"}))
            _set_etat(uuid, "libre", rssi)
            _enregistrer_evenement(uuid, rssi, "ouverture", portail_id, "sortie")
        else:
            logger.debug("Badge %s INTÉRIEUR — pas de déclenchement (portail=%s, RSSI=%d)",
                         uuid, portail_id, rssi)


# ─── Nettoyage automatique (thread) ────────────────────────────────────────

RETENTION_EVENEMENTS_JOURS = 180  # 6 mois

def _nettoyage_periodique():
    """Libère les badges dont le timeout est dépassé (toutes les minutes).
    Purge les événements de plus de 6 mois (une fois par jour)."""
    dernier_purge = datetime.now().date()

    while True:
        time.sleep(60)
        try:
            timeout_interieur = int(_get_config("timeout_interieur_min") or 120)
            timeout_non_vu    = int(_get_config("timeout_non_vu_min") or 10)
            limite_interieur  = (datetime.now() - timedelta(minutes=timeout_interieur)).isoformat(sep=" ", timespec="seconds")
            limite_non_vu     = (datetime.now() - timedelta(minutes=timeout_non_vu)).isoformat(sep=" ", timespec="seconds")

            conn = get_connection()
            result = conn.execute("""
                DELETE FROM badges_etat
                WHERE etat = 'interieur'
                  AND (entre_le < ? OR last_seen_at < ?)
            """, (limite_interieur, limite_non_vu))
            if result.rowcount > 0:
                logger.info("Nettoyage : %d badge(s) libéré(s) par timeout", result.rowcount)
            conn.commit()
            conn.close()

            # Purge des événements anciens (une fois par jour)
            aujourd_hui = datetime.now().date()
            if aujourd_hui > dernier_purge:
                dernier_purge = aujourd_hui
                limite_retention = (datetime.now() - timedelta(days=RETENTION_EVENEMENTS_JOURS)).isoformat(sep=" ", timespec="seconds")
                conn = get_connection()
                result = conn.execute(
                    "DELETE FROM evenements WHERE horodatage < ?", (limite_retention,)
                )
                if result.rowcount > 0:
                    logger.info("Purge : %d événement(s) supprimé(s) (> 6 mois)", result.rowcount)
                conn.commit()
                conn.close()

        except Exception as e:
            logger.error("Erreur nettoyage : %s", e)


# ─── MQTT ──────────────────────────────────────────────────────────────────

def on_connect(client, userdata, flags, reason_code, properties):
    if reason_code == 0:
        logger.info("MQTT connecté au broker %s:%s", BROKER, PORT)
        client.subscribe(TOPIC_DETECTION)
        client.subscribe(TOPIC_PING)
        logger.info("Abonné au topic : %s", TOPIC_DETECTION)
    else:
        logger.error("Échec connexion MQTT, code : %s", reason_code)


def on_message(client, userdata, msg):
    try:
        payload = json.loads(msg.payload.decode())

        if msg.topic.startswith("neargate/ping/"):
            portail_id = msg.topic.split("/")[-1]
            now = datetime.now().isoformat(sep=" ", timespec="seconds")
            if portail_id not in esp32_status:
                esp32_status[portail_id] = {"label": portail_id}
            esp32_status[portail_id]["vu_le"] = now
            esp32_status[portail_id]["ip"]    = payload.get("ip")
            logger.debug("Heartbeat reçu de %s (IP: %s)", portail_id, payload.get("ip"))
            return

        uuid       = payload.get("uuid", "").strip()
        rssi       = int(payload.get("rssi", -999))
        portail_id = payload.get("portail_id", ESP32_EXT)
        batterie   = payload.get("batterie")

        if not uuid:
            return

        # Mise à jour dernière vue + batterie si disponible
        try:
            now = datetime.now().isoformat(sep=" ", timespec="seconds")
            conn = get_connection()
            if batterie is not None:
                conn.execute(
                    "UPDATE badges SET derniere_vue_le = ?, batterie_pct = ?, batterie_vue_le = ? WHERE uuid = ?",
                    (now, int(batterie), now, uuid),
                )
            else:
                conn.execute(
                    "UPDATE badges SET derniere_vue_le = ? WHERE uuid = ?",
                    (now, uuid),
                )
            conn.commit()
            conn.close()
        except Exception as e:
            logger.warning("Erreur mise à jour badge : %s", e)

        traiter_detection(client, uuid, rssi, portail_id)

    except Exception as e:
        logger.error("Erreur traitement message MQTT : %s", e)


def demarrer_mqtt():
    client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2)
    if USERNAME:
        client.username_pw_set(USERNAME, PASSWORD)
    client.on_connect = on_connect
    client.on_message = on_message
    client.connect(BROKER, PORT, keepalive=60)
    client.loop_start()

    # Thread de nettoyage automatique
    t = threading.Thread(target=_nettoyage_periodique, daemon=True)
    t.start()
    logger.info("Thread de nettoyage automatique démarré.")

    return client
