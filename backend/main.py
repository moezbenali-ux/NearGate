"""
NearGate — Backend API REST
Démarrage : uvicorn main:app --host 0.0.0.0 --port 8000
"""

import csv
import io
import logging
import asyncio
import os
import secrets
import smtplib
from contextlib import asynccontextmanager
from datetime import datetime, timedelta
from email.mime.text import MIMEText
from typing import Optional
from pathlib import Path

from fastapi import FastAPI, APIRouter, Depends, HTTPException, Query, Request, status, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import OAuth2PasswordRequestForm
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, StreamingResponse
from pydantic import BaseModel

from database import init_db, get_connection
from auth import verifier_api_key
from auth_jwt import creer_token, verifier_mdp, get_current_user
from mqtt_client import demarrer_mqtt, esp32_status
from sync_agent import demarrer_sync
import sse

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s — %(message)s",
)
logger = logging.getLogger("neargate")

mqtt_client = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    global mqtt_client
    init_db()
    logger.info("Base de données initialisée.")
    sse.set_loop(asyncio.get_event_loop())
    mqtt_client = demarrer_mqtt()
    demarrer_sync(
        api_url=os.getenv("SCALEWAY_API_URL", ""),
        api_key=os.getenv("SCALEWAY_API_KEY", ""),
        client_id=os.getenv("CLIENT_ID", ""),
    )
    yield
    mqtt_client.loop_stop()
    mqtt_client.disconnect()
    logger.info("Client MQTT arrêté.")


app = FastAPI(
    title="NearGate API",
    description="API de gestion du portail de parking NearGate",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

router = APIRouter()


# ─── Contrôle d'accès par rôle ─────────────────────────────────────────────

def require_role(role: str):
    """
    Factory de dépendance FastAPI pour restreindre l'accès par rôle.
    Usage : @router.get("/route", dependencies=[Depends(require_role("admin"))])
    """
    def _check(current_user=Depends(get_current_user)):
        if current_user["role"] != role:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Accès refusé. Rôle requis : {role}.",
            )
        return current_user
    return _check


# ─── Modèles ───────────────────────────────────────────────────────────────

class BadgeCreation(BaseModel):
    uuid: str
    minor: Optional[int] = None  # Minor iBeacon — requis pour badges KKM K7P multi-UUID
    nom: str
    actif: Optional[bool] = True


class BadgeMiseAJour(BaseModel):
    nom: Optional[str] = None
    actif: Optional[bool] = None


class ConfigMiseAJour(BaseModel):
    valeur: str


class DemandeResetMdp(BaseModel):
    email: str


class ResetMdp(BaseModel):
    token: str
    mot_de_passe: str


class UtilisateurCreation(BaseModel):
    email: str
    nom: str
    mot_de_passe: str
    role: Optional[str] = "gestionnaire"


class UtilisateurMiseAJour(BaseModel):
    nom: Optional[str] = None
    email: Optional[str] = None
    role: Optional[str] = None


class PortailCreation(BaseModel):
    portail_id: str
    nom: str
    type: Optional[str] = "entree"
    description: Optional[str] = None
    actif: Optional[bool] = True


class PortailMiseAJour(BaseModel):
    nom: Optional[str] = None
    type: Optional[str] = None
    description: Optional[str] = None
    esp32_mac: Optional[str] = None  # MAC de l'ESP32 assigné (ex: "a4cf12abcdef")
    actif: Optional[bool] = None


# ─── Authentification ──────────────────────────────────────────────────────

@router.post("/auth/login")
def login(form: OAuth2PasswordRequestForm = Depends()):
    conn = get_connection()
    user = conn.execute(
        "SELECT * FROM utilisateurs WHERE email = ? AND actif = 1",
        (form.username,),
    ).fetchone()
    conn.close()
    if not user or not verifier_mdp(form.password, user["mot_de_passe_hash"]):
        raise HTTPException(status_code=401, detail="Email ou mot de passe incorrect")
    token = creer_token(user["email"])
    return {"access_token": token, "token_type": "bearer", "nom": user["nom"], "role": user["role"]}


@router.post("/auth/mot-de-passe-oublie")
def mot_de_passe_oublie(body: DemandeResetMdp):
    conn = get_connection()
    user = conn.execute(
        "SELECT email FROM utilisateurs WHERE email = ? AND actif = 1", (body.email,)
    ).fetchone()

    if user:
        token = secrets.token_urlsafe(32)
        expire = (datetime.now() + timedelta(hours=1)).isoformat(sep=" ", timespec="seconds")
        conn.execute(
            "INSERT INTO reset_tokens (token, email, expire_le) VALUES (?, ?, ?)",
            (token, body.email, expire),
        )
        conn.commit()

        base_url = os.getenv("BASE_URL", "http://localhost:8000")
        lien = f"{base_url}/reinitialiser-mdp?token={token}"

        try:
            msg = MIMEText(
                f"Bonjour,\n\nVous avez demandé la réinitialisation de votre mot de passe NearGate.\n\n"
                f"Cliquez sur ce lien (valable 1 heure) :\n{lien}\n\n"
                f"Si vous n'êtes pas à l'origine de cette demande, ignorez cet email.\n\n"
                f"— NearGate",
                "plain", "utf-8"
            )
            msg["Subject"] = "Réinitialisation de votre mot de passe NearGate"
            msg["From"]    = f"NearGate <{os.getenv('SMTP_FROM', 'noreply@neargate.fr')}>"
            msg["To"]      = body.email

            with smtplib.SMTP(os.getenv("SMTP_HOST", "smtp.resend.com"), int(os.getenv("SMTP_PORT", 587))) as smtp:
                smtp.starttls()
                smtp.login(os.getenv("SMTP_USER", "resend"), os.getenv("SMTP_PASSWORD"))
                smtp.send_message(msg)

            logger.info("Email de réinitialisation envoyé à %s", body.email)
        except Exception as e:
            logger.error("Erreur envoi email reset : %s", e)

    conn.close()
    # Toujours retourner le même message (sécurité : ne pas révéler si l'email existe)
    return {"message": "Si cet email est connu, un lien de réinitialisation a été envoyé."}


@router.post("/auth/reinitialiser-mdp")
def reinitialiser_mdp(body: ResetMdp):
    from auth_jwt import hasher_mdp
    conn = get_connection()
    row = conn.execute(
        "SELECT email, expire_le, utilise FROM reset_tokens WHERE token = ?", (body.token,)
    ).fetchone()

    if not row or row["utilise"]:
        conn.close()
        raise HTTPException(status_code=400, detail="Lien invalide ou déjà utilisé.")

    if datetime.fromisoformat(row["expire_le"]) < datetime.now():
        conn.close()
        raise HTTPException(status_code=400, detail="Lien expiré. Faites une nouvelle demande.")

    conn.execute(
        "UPDATE utilisateurs SET mot_de_passe_hash = ? WHERE email = ?",
        (hasher_mdp(body.mot_de_passe), row["email"]),
    )
    conn.execute("UPDATE reset_tokens SET utilise = 1 WHERE token = ?", (body.token,))
    conn.commit()
    conn.close()
    return {"message": "Mot de passe mis à jour avec succès."}


@router.get("/auth/me")
def me(current_user=Depends(get_current_user)):
    return current_user


# ─── Utilisateurs ──────────────────────────────────────────────────────────

@router.get("/utilisateurs", dependencies=[Depends(require_role("admin"))])
def lister_utilisateurs():
    conn = get_connection()
    rows = conn.execute(
        "SELECT id, email, nom, role, actif, cree_le FROM utilisateurs ORDER BY cree_le DESC"
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


@router.post("/utilisateurs", status_code=201, dependencies=[Depends(require_role("admin"))])
def creer_utilisateur(u: UtilisateurCreation):
    from auth_jwt import hasher_mdp
    conn = get_connection()
    try:
        conn.execute(
            "INSERT INTO utilisateurs (email, nom, mot_de_passe_hash, role) VALUES (?, ?, ?, ?)",
            (u.email, u.nom, hasher_mdp(u.mot_de_passe), u.role),
        )
        conn.commit()
    except Exception:
        conn.close()
        raise HTTPException(status_code=409, detail="Email déjà utilisé.")
    conn.close()

    base_url = os.getenv("BASE_URL", "https://app.neargate.fr")
    try:
        msg = MIMEText(
            f"Bonjour {u.nom},\n\n"
            f"Un accès NearGate a été créé pour vous.\n\n"
            f"  Adresse de connexion : {base_url}\n"
            f"  Email               : {u.email}\n"
            f"  Mot de passe        : {u.mot_de_passe}\n\n"
            f"Nous vous recommandons de changer votre mot de passe après votre première connexion.\n\n"
            f"— NearGate",
            "plain", "utf-8"
        )
        msg["Subject"] = "Votre accès NearGate"
        msg["From"]    = f"NearGate <{os.getenv('SMTP_FROM', 'noreply@neargate.fr')}>"
        msg["To"]      = u.email

        with smtplib.SMTP(os.getenv("SMTP_HOST", "smtp.resend.com"), int(os.getenv("SMTP_PORT", 587))) as smtp:
            smtp.starttls()
            smtp.login(os.getenv("SMTP_USER", "resend"), os.getenv("SMTP_PASSWORD"))
            smtp.send_message(msg)

        logger.info("Email de bienvenue envoyé à %s", u.email)
    except Exception as e:
        logger.error("Erreur envoi email bienvenue : %s", e)

    return {"message": "Utilisateur créé."}


@router.post("/utilisateurs/import")
async def importer_utilisateurs_csv(
    fichier: UploadFile = File(...),
    current_user=Depends(require_role("admin")),
):
    """Importe des utilisateurs depuis un CSV (colonnes : email, nom, mot_de_passe, role)."""
    from auth_jwt import hasher_mdp
    contenu = await fichier.read()
    reader  = csv.DictReader(io.StringIO(contenu.decode("utf-8-sig")))
    ajoutes, ignores, erreurs = 0, 0, []

    conn = get_connection()
    for i, ligne in enumerate(reader, start=2):
        email = ligne.get("email", "").strip()
        nom   = ligne.get("nom",   "").strip()
        mdp   = ligne.get("mot_de_passe", "").strip()
        role  = ligne.get("role", "gestionnaire").strip() or "gestionnaire"
        if not email or not nom or not mdp:
            erreurs.append(f"Ligne {i} : email, nom ou mot_de_passe manquant")
            continue
        try:
            conn.execute(
                "INSERT OR IGNORE INTO utilisateurs (email, nom, mot_de_passe_hash, role) VALUES (?, ?, ?, ?)",
                (email, nom, hasher_mdp(mdp), role),
            )
            if conn.execute("SELECT changes()").fetchone()[0]:
                ajoutes += 1
            else:
                ignores += 1
        except Exception as e:
            erreurs.append(f"Ligne {i} : {e}")
    conn.commit()
    conn.close()
    return {"ajoutes": ajoutes, "ignores": ignores, "erreurs": erreurs}


@router.delete("/utilisateurs/{user_id}", dependencies=[Depends(require_role("admin"))])
def supprimer_utilisateur(user_id: int):
    conn = get_connection()
    conn.execute("UPDATE utilisateurs SET actif = 0 WHERE id = ?", (user_id,))
    conn.commit()
    conn.close()
    return {"message": "Utilisateur désactivé."}


@router.patch("/utilisateurs/{user_id}", dependencies=[Depends(require_role("admin"))])
def modifier_utilisateur(user_id: int, u: UtilisateurMiseAJour):
    conn = get_connection()
    if u.nom:
        conn.execute("UPDATE utilisateurs SET nom = ? WHERE id = ?", (u.nom, user_id))
    if u.email:
        conn.execute("UPDATE utilisateurs SET email = ? WHERE id = ?", (u.email, user_id))
    if u.role:
        conn.execute("UPDATE utilisateurs SET role = ? WHERE id = ?", (u.role, user_id))
    conn.commit()
    conn.close()
    return {"message": "Utilisateur modifié."}


@router.post("/utilisateurs/{user_id}/reactiver", dependencies=[Depends(require_role("admin"))])
def reactiver_utilisateur(user_id: int):
    conn = get_connection()
    conn.execute("UPDATE utilisateurs SET actif = 1 WHERE id = ?", (user_id,))
    conn.commit()
    conn.close()
    return {"message": "Utilisateur réactivé."}


# ─── Badges ────────────────────────────────────────────────────────────────

@router.get("/badges")
def lister_badges(current_user=Depends(get_current_user)):
    conn = get_connection()
    rows = conn.execute("SELECT * FROM badges ORDER BY cree_le DESC").fetchall()
    conn.close()
    return [dict(r) for r in rows]


@router.post("/badges", status_code=status.HTTP_201_CREATED)
def ajouter_badge(badge: BadgeCreation, current_user=Depends(get_current_user)):
    badge_key = f"{badge.uuid.strip()}:{badge.minor}" if badge.minor is not None else badge.uuid.strip()
    conn = get_connection()
    try:
        conn.execute(
            "INSERT INTO badges (uuid, nom, actif) VALUES (?, ?, ?)",
            (badge_key, badge.nom.strip(), int(badge.actif)),
        )
        conn.commit()
    except Exception:
        conn.close()
        raise HTTPException(status_code=409, detail="UUID déjà enregistré.")
    conn.close()
    return {"message": "Badge ajouté.", "uuid": badge_key}


@router.patch("/badges/{uuid}")
def modifier_badge(uuid: str, maj: BadgeMiseAJour, current_user=Depends(get_current_user)):
    conn = get_connection()
    row = conn.execute("SELECT id FROM badges WHERE uuid = ?", (uuid,)).fetchone()
    if not row:
        conn.close()
        raise HTTPException(status_code=404, detail="Badge introuvable.")
    if maj.nom is not None:
        conn.execute("UPDATE badges SET nom = ? WHERE uuid = ?", (maj.nom, uuid))
    if maj.actif is not None:
        conn.execute("UPDATE badges SET actif = ? WHERE uuid = ?", (int(maj.actif), uuid))
    conn.commit()
    conn.close()
    return {"message": "Badge mis à jour."}


@router.post("/badges/import")
async def importer_badges_csv(
    fichier: UploadFile = File(...),
    current_user=Depends(get_current_user),
):
    """Importe des badges depuis un CSV (colonnes : uuid, nom)."""
    contenu = await fichier.read()
    reader  = csv.DictReader(io.StringIO(contenu.decode("utf-8-sig")))
    ajoutes, ignores, erreurs = 0, 0, []

    conn = get_connection()
    for i, ligne in enumerate(reader, start=2):
        uuid = ligne.get("uuid", "").strip()
        nom  = ligne.get("nom",  "").strip()
        if not uuid or not nom:
            erreurs.append(f"Ligne {i} : uuid ou nom manquant")
            continue
        try:
            conn.execute("INSERT OR IGNORE INTO badges (uuid, nom) VALUES (?, ?)", (uuid, nom))
            if conn.execute("SELECT changes()").fetchone()[0]:
                ajoutes += 1
            else:
                ignores += 1
        except Exception as e:
            erreurs.append(f"Ligne {i} : {e}")
    conn.commit()
    conn.close()
    return {"ajoutes": ajoutes, "ignores": ignores, "erreurs": erreurs}


@router.delete("/badges/{uuid}")
def supprimer_badge(uuid: str, current_user=Depends(get_current_user)):
    conn = get_connection()
    result = conn.execute("DELETE FROM badges WHERE uuid = ?", (uuid,))
    conn.commit()
    conn.close()
    if result.rowcount == 0:
        raise HTTPException(status_code=404, detail="Badge introuvable.")
    return {"message": "Badge supprimé."}


# ─── États des badges ──────────────────────────────────────────────────────

@router.get("/etats")
def lister_etats(current_user=Depends(get_current_user)):
    conn = get_connection()
    rows = conn.execute("""
        SELECT e.*, b.nom FROM badges_etat e
        LEFT JOIN badges b ON b.uuid = e.uuid
        ORDER BY e.entre_le DESC
    """).fetchall()
    conn.close()
    return [dict(r) for r in rows]


@router.delete("/etats/{uuid}")
def liberer_badge(uuid: str, current_user=Depends(get_current_user)):
    conn = get_connection()
    result = conn.execute("DELETE FROM badges_etat WHERE uuid = ?", (uuid,))
    conn.commit()
    conn.close()
    if result.rowcount == 0:
        raise HTTPException(status_code=404, detail="Badge non trouvé en état INTÉRIEUR.")
    return {"message": "Badge libéré."}


# ─── Événements ────────────────────────────────────────────────────────────

@router.get("/evenements")
def lister_evenements(
    limite: int = 100,
    direction: Optional[str] = None,
    current_user=Depends(get_current_user),
):
    conn = get_connection()
    base_query = """
        SELECT e.*, b.nom AS badge_nom
        FROM evenements e
        LEFT JOIN badges b ON b.uuid = e.badge_uuid
    """
    if direction:
        rows = conn.execute(
            base_query + " WHERE e.direction = ? ORDER BY e.horodatage DESC LIMIT ?",
            (direction, limite),
        ).fetchall()
    else:
        rows = conn.execute(
            base_query + " ORDER BY e.horodatage DESC LIMIT ?",
            (limite,),
        ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


# ─── Configuration ─────────────────────────────────────────────────────────

@router.get("/config")
def lire_config(current_user=Depends(get_current_user)):
    conn = get_connection()
    rows = conn.execute("SELECT * FROM config").fetchall()
    conn.close()
    return {r["cle"]: r["valeur"] for r in rows}


@router.put("/config/{cle}")
def modifier_config(cle: str, maj: ConfigMiseAJour, current_user=Depends(require_role("admin"))):
    conn = get_connection()
    row = conn.execute("SELECT cle FROM config WHERE cle = ?", (cle,)).fetchone()
    if not row:
        conn.close()
        raise HTTPException(status_code=404, detail=f"Clé '{cle}' introuvable.")
    conn.execute("UPDATE config SET valeur = ? WHERE cle = ?", (maj.valeur, cle))
    conn.commit()
    conn.close()
    return {"message": "Configuration mise à jour.", "cle": cle, "valeur": maj.valeur}


# ─── Radar BLE ─────────────────────────────────────────────────────────────

@router.get("/radar/scan")
async def radar_scan(duree: int = 5, current_user=Depends(get_current_user)):
    """Scanne les appareils BLE à proximité du Raspberry Pi."""
    try:
        from bleak import BleakScanner

        resultats = []
        devices = await BleakScanner.discover(timeout=duree, return_adv=True)

        for adresse, (device, adv) in devices.items():
            uuid_ibeacon = None

            # Parsing iBeacon : Apple (0x004C) + type 0x02 + longueur 0x15 + 16 octets UUID
            major_ibeacon = None
            minor_ibeacon = None
            for company_id, data in (adv.manufacturer_data or {}).items():
                if (company_id == 0x004C
                        and len(data) >= 23
                        and data[0] == 0x02
                        and data[1] == 0x15):
                    u = data[2:18]
                    uuid_ibeacon = (
                        f"{u[0:4].hex()}-{u[4:6].hex()}-"
                        f"{u[6:8].hex()}-{u[8:10].hex()}-{u[10:16].hex()}"
                    )
                    major_ibeacon = int.from_bytes(data[18:20], "big")
                    minor_ibeacon = int.from_bytes(data[20:22], "big")
                    break

            # Batterie Feasycom : service data UUID fff0, dernier octet = % batterie
            batterie = None
            for svc_uuid, svc_data in (adv.service_data or {}).items():
                if "fff0" in svc_uuid and len(svc_data) >= 11:
                    batterie = svc_data[10]
                    break

            # Vérifier si ce badge est déjà enregistré (clé composite uuid:minor)
            badge_key_scan = f"{uuid_ibeacon}:{minor_ibeacon}" if (uuid_ibeacon and minor_ibeacon is not None) else uuid_ibeacon
            conn = get_connection()
            badge = conn.execute(
                "SELECT nom, actif, batterie_pct FROM badges WHERE uuid = ?", (badge_key_scan,)
            ).fetchone() if badge_key_scan else None
            conn.close()

            batterie_finale = batterie if batterie is not None else (badge["batterie_pct"] if badge else None)

            resultats.append({
                "adresse":      adresse,
                "nom_ble":      device.name or "Inconnu",
                "rssi":         adv.rssi,
                "uuid_ibeacon": uuid_ibeacon,
                "major":        major_ibeacon,
                "minor":        minor_ibeacon,
                "batterie":     batterie_finale,
                "enregistre":   badge is not None,
                "nom_badge":    badge["nom"] if badge else None,
                "actif":        bool(badge["actif"]) if badge else None,
            })

        # Sauvegarder la batterie en base pour les badges connus
        now = datetime.now().isoformat(sep=" ", timespec="seconds")
        conn_bat = get_connection()
        for ap in resultats:
            if ap["uuid_ibeacon"] and ap["enregistre"] and ap["batterie"] is not None:
                bk = f"{ap['uuid_ibeacon']}:{ap['minor']}" if ap["minor"] is not None else ap["uuid_ibeacon"]
                conn_bat.execute(
                    "UPDATE badges SET batterie_pct = ?, batterie_vue_le = ? WHERE uuid = ?",
                    (ap["batterie"], now, bk),
                )
        conn_bat.commit()
        conn_bat.close()

        # Tri : iBeacons d'abord, puis par RSSI décroissant
        resultats.sort(key=lambda x: (x["uuid_ibeacon"] is None, -x["rssi"]))
        return {"appareils": resultats, "total": len(resultats)}

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erreur scan BLE : {e}")


# ─── Portails ──────────────────────────────────────────────────────────────

@router.get("/portails")
def lister_portails(current_user=Depends(get_current_user)):
    conn = get_connection()
    rows = conn.execute("SELECT * FROM portails ORDER BY cree_le ASC").fetchall()
    conn.close()
    return [dict(r) for r in rows]


@router.post("/portails", status_code=201)
def creer_portail(p: PortailCreation, current_user=Depends(require_role("admin"))):
    conn = get_connection()
    try:
        conn.execute(
            "INSERT INTO portails (portail_id, nom, type, description, actif) VALUES (?, ?, ?, ?, ?)",
            (p.portail_id.strip(), p.nom.strip(), p.type, p.description, int(p.actif)),
        )
        conn.commit()
    except Exception:
        conn.close()
        raise HTTPException(status_code=409, detail="portail_id déjà utilisé.")
    conn.close()
    return {"message": "Portail créé.", "portail_id": p.portail_id}


@router.patch("/portails/{portail_id}")
def modifier_portail(portail_id: str, maj: PortailMiseAJour, current_user=Depends(require_role("admin"))):
    conn = get_connection()
    row = conn.execute("SELECT id FROM portails WHERE portail_id = ?", (portail_id,)).fetchone()
    if not row:
        conn.close()
        raise HTTPException(status_code=404, detail="Portail introuvable.")
    if maj.nom is not None:
        conn.execute("UPDATE portails SET nom = ? WHERE portail_id = ?", (maj.nom, portail_id))
    if maj.type is not None:
        conn.execute("UPDATE portails SET type = ? WHERE portail_id = ?", (maj.type, portail_id))
    if maj.description is not None:
        conn.execute("UPDATE portails SET description = ? WHERE portail_id = ?", (maj.description, portail_id))
    if maj.actif is not None:
        conn.execute("UPDATE portails SET actif = ? WHERE portail_id = ?", (int(maj.actif), portail_id))
    if maj.esp32_mac is not None:
        mac = maj.esp32_mac.strip().lower().replace(":", "") or None
        conn.execute("UPDATE portails SET esp32_mac = ? WHERE portail_id = ?", (mac, portail_id))
        # Mettre à jour esp32_status en mémoire
        from mqtt_client import esp32_status
        if mac:
            esp32_status[mac] = {"label": maj.nom or portail_id, "portail_id": portail_id, "vu_le": None, "ip": None}
    conn.commit()
    conn.close()
    return {"message": "Portail mis à jour."}


@router.delete("/portails/{portail_id}")
def supprimer_portail(portail_id: str, current_user=Depends(require_role("admin"))):
    conn = get_connection()
    result = conn.execute("DELETE FROM portails WHERE portail_id = ?", (portail_id,))
    conn.commit()
    conn.close()
    if result.rowcount == 0:
        raise HTTPException(status_code=404, detail="Portail introuvable.")
    return {"message": "Portail supprimé."}


# ─── Commande manuelle ─────────────────────────────────────────────────────

@router.post("/portail/{portail_id}/ouvrir")
def ouvrir_portail(portail_id: str, current_user=Depends(get_current_user)):
    import json as _json
    conn = get_connection()
    portail = conn.execute(
        "SELECT nom, type, esp32_mac FROM portails WHERE portail_id = ? AND actif = 1", (portail_id,)
    ).fetchone()
    conn.close()
    if not portail:
        raise HTTPException(status_code=400, detail="Portail inconnu ou inactif.")
    if not portail["esp32_mac"]:
        raise HTTPException(status_code=400, detail="Aucun ESP32 assigné à ce portail.")
    mqtt_client.publish(f"neargate/commande/{portail['esp32_mac']}", _json.dumps({"action": "ouvrir"}))
    logger.info("Ouverture manuelle du portail %s par %s", portail_id, current_user["email"])
    conn = get_connection()
    conn.execute(
        "INSERT INTO evenements (badge_uuid, rssi, action, direction, portail_id) VALUES (?, ?, ?, ?, ?)",
        ("manuel", None, "ouverture_manuelle", portail["type"], portail_id),
    )
    conn.commit()
    conn.close()
    sse.diffuser("evenement")
    return {"message": f"Commande envoyée au portail {portail_id}."}


# ─── Supervision ───────────────────────────────────────────────────────────

@router.get("/supervision")
def supervision(current_user=Depends(get_current_user)):
    """Retourne le statut des ESP32 et le niveau de batterie / dernière détection des badges."""
    from datetime import datetime, timedelta

    SEUIL_EN_LIGNE_MIN = 2  # un ESP32 est "en ligne" s'il a pingé dans les 2 dernières minutes

    # Statut ESP32
    maintenant = datetime.now()
    esp32_list = []
    for mac, info in esp32_status.items():
        vu_le_str = info.get("vu_le")
        en_ligne = False
        if vu_le_str:
            try:
                vu_le_dt = datetime.fromisoformat(vu_le_str)
                en_ligne = (maintenant - vu_le_dt) < timedelta(minutes=SEUIL_EN_LIGNE_MIN)
            except Exception:
                pass
        esp32_list.append({
            "mac":        mac,
            "portail_id": info.get("portail_id"),
            "label":      info.get("label", "Non assigné"),
            "en_ligne":   en_ligne,
            "vu_le":      vu_le_str,
            "ip":         info.get("ip"),
        })

    # Badges avec batterie + dernière détection
    conn = get_connection()
    rows = conn.execute("""
        SELECT uuid, nom, actif, batterie_pct, batterie_vue_le, derniere_vue_le
        FROM badges
        ORDER BY nom ASC
    """).fetchall()
    conn.close()

    badges_list = [dict(r) for r in rows]

    return {"esp32": esp32_list, "badges": badges_list}


# ─── SSE — événements temps réel ───────────────────────────────────────────

@router.get("/events")
async def sse_events(request: Request, token: str = Query(...)):
    """
    Stream SSE. Le Dashboard s'y abonne pour recevoir les événements en temps réel.
    EventSource ne supporte pas les en-têtes custom → le JWT est passé en query param.
    """
    from jose import JWTError, jwt as _jwt
    from auth_jwt import SECRET_KEY, ALGORITHM
    try:
        payload = _jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        email: str = payload.get("sub", "")
        if not email:
            raise ValueError()
    except (JWTError, ValueError):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token invalide.")

    conn = get_connection()
    user = conn.execute(
        "SELECT id FROM utilisateurs WHERE email = ? AND actif = 1", (email,)
    ).fetchone()
    conn.close()
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Utilisateur introuvable.")

    queue: asyncio.Queue = asyncio.Queue()
    sse.sse_clients.append(queue)

    async def generator():
        try:
            while True:
                try:
                    data = await asyncio.wait_for(queue.get(), timeout=20.0)
                    yield f"data: {data}\n\n"
                except asyncio.TimeoutError:
                    # Heartbeat pour maintenir la connexion ouverte
                    yield ": heartbeat\n\n"
        except asyncio.CancelledError:
            pass
        finally:
            try:
                sse.sse_clients.remove(queue)
            except ValueError:
                pass

    return StreamingResponse(
        generator(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


# ─── Santé ─────────────────────────────────────────────────────────────────

@router.get("/ping")
def ping():
    return {"status": "ok", "service": "NearGate"}


app.include_router(router, prefix="/api")

# ─── Dashboard (fichiers statiques React) ──────────────────────────────────

STATIC_DIR = Path(__file__).parent / "static"
if (STATIC_DIR / "assets").exists():
    app.mount("/assets", StaticFiles(directory=STATIC_DIR / "assets"), name="assets")

    @app.get("/{full_path:path}", include_in_schema=False)
    def serve_spa(full_path: str):
        return FileResponse(STATIC_DIR / "index.html")
