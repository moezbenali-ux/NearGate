"""
Script de création du premier compte administrateur.
Usage : python creer_admin.py
"""
from database import init_db, get_connection
from auth_jwt import hasher_mdp

init_db()

email = input("Email : ").strip()
nom   = input("Nom   : ").strip()
mdp   = input("Mot de passe : ").strip()

conn = get_connection()
try:
    conn.execute(
        "INSERT INTO utilisateurs (email, nom, mot_de_passe_hash, role) VALUES (?, ?, ?, 'admin')",
        (email, nom, hasher_mdp(mdp)),
    )
    conn.commit()
    print(f"\n✓ Compte admin créé pour {email}")
except Exception as e:
    print(f"\n✗ Erreur : {e}")
finally:
    conn.close()
