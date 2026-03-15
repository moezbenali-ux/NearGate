"""
NearGate — Agent de synchronisation vers le serveur central (Scaleway)

Rôle :
  Envoie périodiquement les événements locaux non synchronisés
  vers le serveur central NearGate (multi-tenant).

Activation :
  Renseigner SCALEWAY_API_URL et SCALEWAY_API_KEY dans le .env.
  Laisser vide pour désactiver (mode standalone Raspberry Pi).
"""

import time
import logging
import threading
import requests
from datetime import datetime
from database import get_connection

logger = logging.getLogger("neargate.sync")

INTERVALLE_SECONDES = 30


def _sync_evenements(api_url: str, api_key: str, client_id: str):
    """Envoie les événements non synchronisés vers Scaleway."""
    conn = get_connection()
    try:
        rows = conn.execute(
            "SELECT * FROM evenements WHERE synced_le IS NULL ORDER BY horodatage ASC LIMIT 100"
        ).fetchall()

        if not rows:
            return

        payload = {
            "client_id": client_id,
            "evenements": [dict(r) for r in rows],
        }

        res = requests.post(
            f"{api_url}/sync/evenements",
            json=payload,
            headers={"X-API-Key": api_key},
            timeout=10,
        )
        res.raise_for_status()

        ids = [r["id"] for r in rows]
        now = datetime.now().isoformat(sep=" ", timespec="seconds")
        conn.execute(
            f"UPDATE evenements SET synced_le = ? WHERE id IN ({','.join('?' * len(ids))})",
            [now] + ids,
        )
        conn.commit()
        logger.info("Sync : %d événement(s) envoyés à Scaleway", len(rows))

    except requests.exceptions.ConnectionError:
        logger.debug("Sync : pas de connexion internet, nouvel essai dans %ds", INTERVALLE_SECONDES)
    except Exception as e:
        logger.warning("Sync échoué : %s", e)
    finally:
        conn.close()


def _sync_badges(api_url: str, api_key: str, client_id: str):
    """Récupère les mises à jour de badges depuis Scaleway."""
    try:
        res = requests.get(
            f"{api_url}/sync/badges/{client_id}",
            headers={"X-API-Key": api_key},
            timeout=10,
        )
        res.raise_for_status()
        data = res.json()

        if not data.get("badges"):
            return

        conn = get_connection()
        for badge in data["badges"]:
            conn.execute("""
                INSERT INTO badges (uuid, nom, actif)
                VALUES (?, ?, ?)
                ON CONFLICT(uuid) DO UPDATE SET nom=excluded.nom, actif=excluded.actif
            """, (badge["uuid"], badge["nom"], badge["actif"]))
        conn.commit()
        conn.close()
        logger.info("Sync : %d badge(s) mis à jour depuis Scaleway", len(data["badges"]))

    except requests.exceptions.ConnectionError:
        pass
    except Exception as e:
        logger.warning("Sync badges échoué : %s", e)


def _boucle_sync(api_url: str, api_key: str, client_id: str):
    while True:
        try:
            _sync_evenements(api_url, api_key, client_id)
            _sync_badges(api_url, api_key, client_id)
        except Exception as e:
            logger.error("Erreur sync : %s", e)
        time.sleep(INTERVALLE_SECONDES)


def demarrer_sync(api_url: str, api_key: str, client_id: str):
    """Lance l'agent de synchronisation en arrière-plan."""
    if not api_url or not api_key or not client_id:
        logger.info("Sync désactivé — renseigner SCALEWAY_API_URL, SCALEWAY_API_KEY et CLIENT_ID dans .env")
        return None

    t = threading.Thread(
        target=_boucle_sync,
        args=(api_url, api_key, client_id),
        daemon=True,
    )
    t.start()
    logger.info("Agent de synchronisation démarré → %s (client: %s)", api_url, client_id)
    return t
