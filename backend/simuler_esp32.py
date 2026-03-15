"""
Simulateur ESP32 — NearGate
Simule les messages MQTT qu'enverrait un ESP32 avec un badge détecté.

Usage :
  python simuler_esp32.py --uuid <UUID_BADGE> --rssi -65 --portail entree
  python simuler_esp32.py --uuid <UUID_BADGE> --rssi -90   ← RSSI trop faible, refus attendu
  python simuler_esp32.py --uuid INCONNU-UUID --rssi -65   ← badge non autorisé, refus attendu
"""

import argparse
import json
import time
import paho.mqtt.client as mqtt
from dotenv import load_dotenv
import os

load_dotenv()

BROKER = os.getenv("MQTT_BROKER", "127.0.0.1")
PORT   = int(os.getenv("MQTT_PORT", 1883))
TOPIC  = "neargate/detection"


def on_connect(client, userdata, flags, reason_code, properties):
    if reason_code == 0:
        print(f"[MQTT] Connecté au broker {BROKER}:{PORT}")
    else:
        print(f"[MQTT] Erreur de connexion : {reason_code}")


def simuler(uuid: str, rssi: int, portail: str, repetitions: int, intervalle: float):
    client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2)
    client.on_connect = on_connect
    client.connect(BROKER, PORT)
    client.loop_start()
    time.sleep(1)

    payload = json.dumps({"uuid": uuid, "rssi": rssi, "portail_id": portail})

    print(f"\n{'='*50}")
    print(f"Simulation : {repetitions} envoi(s) toutes les {intervalle}s")
    print(f"Topic      : {TOPIC}")
    print(f"Payload    : {payload}")
    print(f"{'='*50}\n")

    for i in range(1, repetitions + 1):
        client.publish(TOPIC, payload)
        print(f"[{i}/{repetitions}] Message publié → {payload}")
        if i < repetitions:
            time.sleep(intervalle)

    time.sleep(1)
    client.loop_stop()
    client.disconnect()
    print("\n[MQTT] Déconnecté. Vérife les logs du backend.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Simulateur ESP32 NearGate")
    parser.add_argument("--uuid",      required=True,      help="UUID du badge iBeacon")
    parser.add_argument("--rssi",      type=int, default=-65, help="RSSI simulé (dBm)")
    parser.add_argument("--portail",   default="entree",   help="ID du portail")
    parser.add_argument("--fois",      type=int, default=1, help="Nombre d'envois")
    parser.add_argument("--intervalle",type=float, default=1.0, help="Secondes entre envois")
    args = parser.parse_args()

    simuler(args.uuid, args.rssi, args.portail, args.fois, args.intervalle)
