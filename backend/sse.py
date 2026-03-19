"""
Diffusion SSE (Server-Sent Events) — NearGate
Permet de pousser des notifications en temps réel vers les clients Dashboard.
Thread-safe : peut être appelé depuis le thread MQTT.
"""

import asyncio
import json
import logging

logger = logging.getLogger("neargate.sse")

# Liste des files d'attente actives (une par client SSE connecté)
sse_clients: list[asyncio.Queue] = []

# Boucle asyncio principale (injectée au démarrage de FastAPI)
_loop: asyncio.AbstractEventLoop | None = None


def set_loop(loop: asyncio.AbstractEventLoop) -> None:
    """Enregistre la boucle asyncio principale. À appeler dans le lifespan FastAPI."""
    global _loop
    _loop = loop


def diffuser(type_evt: str, data: dict | None = None) -> None:
    """
    Envoie un événement SSE à tous les clients connectés.
    Thread-safe — peut être appelé depuis n'importe quel thread (MQTT, nettoyage...).
    """
    if not _loop or not sse_clients:
        return
    payload = json.dumps({"type": type_evt, **({"data": data} if data else {})})
    for q in list(sse_clients):
        try:
            asyncio.run_coroutine_threadsafe(q.put(payload), _loop)
        except Exception as e:
            logger.debug("Erreur diffusion SSE : %s", e)
