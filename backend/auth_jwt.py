import os
from datetime import datetime, timedelta
from typing import Optional

from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt
from passlib.context import CryptContext
from dotenv import load_dotenv
from database import get_connection

load_dotenv()

SECRET_KEY = os.getenv("JWT_SECRET")
if not SECRET_KEY:
    raise RuntimeError(
        "JWT_SECRET est absent du fichier .env. "
        "Générez une clé avec : python3 -c \"import secrets; print(secrets.token_hex(32))\" "
        "puis ajoutez-la dans backend/.env"
    )
ALGORITHM  = "HS256"
EXPIRE_HEURES = 8

pwd_context   = CryptContext(schemes=["bcrypt"], deprecated="auto")
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login", auto_error=False)


def hasher_mdp(mdp: str) -> str:
    return pwd_context.hash(mdp)


def verifier_mdp(mdp_clair: str, mdp_hash: str) -> bool:
    return pwd_context.verify(mdp_clair, mdp_hash)


def creer_token(email: str) -> str:
    expire = datetime.utcnow() + timedelta(hours=EXPIRE_HEURES)
    return jwt.encode({"sub": email, "exp": expire}, SECRET_KEY, algorithm=ALGORITHM)


def get_current_user(token: Optional[str] = Depends(oauth2_scheme)):
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Non authentifié",
            headers={"WWW-Authenticate": "Bearer"},
        )
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        email: str = payload.get("sub")
        if not email:
            raise ValueError()
    except (JWTError, ValueError):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token invalide ou expiré",
            headers={"WWW-Authenticate": "Bearer"},
        )
    conn = get_connection()
    user = conn.execute(
        "SELECT id, email, nom, role FROM utilisateurs WHERE email = ? AND actif = 1",
        (email,),
    ).fetchone()
    conn.close()
    if not user:
        raise HTTPException(status_code=401, detail="Utilisateur introuvable")
    return dict(user)
