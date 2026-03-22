import sqlite3
import os
from dotenv import load_dotenv

load_dotenv()

DB_PATH = os.getenv("DB_PATH", "neargate.db")


def get_connection():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    conn = get_connection()
    cursor = conn.cursor()

    # Table des badges autorisés
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS badges (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            uuid TEXT UNIQUE NOT NULL,
            nom TEXT NOT NULL,
            actif INTEGER NOT NULL DEFAULT 1,
            cree_le TEXT NOT NULL DEFAULT (datetime('now'))
        )
    """)

    # Table des événements
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS evenements (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            badge_uuid TEXT NOT NULL,
            rssi INTEGER,
            action TEXT NOT NULL,
            direction TEXT NOT NULL DEFAULT 'inconnu',
            portail_id TEXT NOT NULL DEFAULT 'entree_ext',
            horodatage TEXT NOT NULL DEFAULT (datetime('now')),
            synced_le TEXT
        )
    """)

    # Table d'état des badges (machine d'états entrée/sortie)
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS badges_etat (
            uuid TEXT PRIMARY KEY,
            etat TEXT NOT NULL DEFAULT 'libre',
            entre_le TEXT,
            last_seen_at TEXT,
            last_seen_rssi INTEGER
        )
    """)

    # Table des utilisateurs (gestionnaires du dashboard)
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS utilisateurs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            email TEXT UNIQUE NOT NULL,
            nom TEXT NOT NULL,
            mot_de_passe_hash TEXT NOT NULL,
            role TEXT NOT NULL DEFAULT 'gestionnaire',
            actif INTEGER NOT NULL DEFAULT 1,
            cree_le TEXT NOT NULL DEFAULT (datetime('now'))
        )
    """)

    # Table de configuration
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS config (
            cle TEXT PRIMARY KEY,
            valeur TEXT NOT NULL
        )
    """)

    # Table des tokens de réinitialisation de mot de passe
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS reset_tokens (
            token TEXT PRIMARY KEY,
            email TEXT NOT NULL,
            expire_le TEXT NOT NULL,
            utilise INTEGER NOT NULL DEFAULT 0
        )
    """)

    # Table des portails (remplace les portail_ids hardcodés dans le code)
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS portails (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            portail_id TEXT UNIQUE NOT NULL,
            nom TEXT NOT NULL,
            type TEXT NOT NULL DEFAULT 'entree',
            description TEXT,
            actif INTEGER NOT NULL DEFAULT 1,
            cree_le TEXT NOT NULL DEFAULT (datetime('now'))
        )
    """)

    # Migration : ajout colonnes si absentes
    for col, definition in [
        ("batterie_pct",    "INTEGER"),
        ("batterie_vue_le", "TEXT"),
        ("derniere_vue_le", "TEXT"),
        ("modele",          "TEXT"),
    ]:
        try:
            cursor.execute(f"ALTER TABLE badges ADD COLUMN {col} {definition}")
        except Exception:
            pass

    for col, definition in [
        ("synced_le", "TEXT"),
    ]:
        try:
            cursor.execute(f"ALTER TABLE evenements ADD COLUMN {col} {definition}")
        except Exception:
            pass  # Colonne déjà présente

    try:
        cursor.execute("ALTER TABLE portails ADD COLUMN esp32_mac TEXT DEFAULT NULL")
    except Exception:
        pass  # Colonne déjà présente

    # Valeurs par défaut de configuration
    cursor.executemany("""
        INSERT OR IGNORE INTO config (cle, valeur) VALUES (?, ?)
    """, [
        ("rssi_seuil_entree",       "-70"),   # seuil entrée (ESP32 extérieur)
        ("rssi_seuil_sortie",       "-55"),   # seuil sortie (ESP32 intérieur, zone ~1m)
        ("rssi_oubli",              "-90"),   # en dessous → badge considéré parti
        ("timeout_interieur_min",   "120"),   # conservé en config mais non utilisé
        ("timeout_non_vu_min",      "1"),     # libéré sous ~1-2 min si badge non vu
        ("dedup_delai_sec",         "5"),     # fenêtre anti-doublon BLE (secondes)
    ])

    conn.commit()
    conn.close()
