import os
from fastapi import Cookie, Depends, HTTPException, Response, status
from itsdangerous import BadSignature, URLSafeSerializer

APP_ENV = os.environ.get("APP_ENV", "development").lower()
ADMIN_USERNAME = os.environ.get("ADMIN_USERNAME", "admin")
ADMIN_PASSWORD = os.environ.get("ADMIN_PASSWORD", "admin123")
SESSION_SECRET = os.environ.get("SESSION_SECRET", "automate-hub-solution-session-secret-change-me")
if APP_ENV == "production":
    missing_secrets = [
        name for name in ("ADMIN_USERNAME", "ADMIN_PASSWORD", "SESSION_SECRET")
        if not os.environ.get(name)
    ]
    if missing_secrets:
        raise RuntimeError(f"Missing required production environment variables: {', '.join(missing_secrets)}")

COOKIE_SECURE = os.environ.get("COOKIE_SECURE", str(APP_ENV == "production")).lower() == "true"
COOKIE_SAMESITE = os.environ.get("COOKIE_SAMESITE", "none" if APP_ENV == "production" else "lax")
COOKIE_NAME = "admin_session"

_serializer = URLSafeSerializer(SESSION_SECRET, salt="admin")


def _make_token(username: str) -> str:
    return _serializer.dumps({"u": username})


def _read_token(token: str) -> dict | None:
    try:
        return _serializer.loads(token)
    except BadSignature:
        return None


def set_admin_cookie(response: Response, username: str) -> None:
    response.set_cookie(
        key=COOKIE_NAME,
        value=_make_token(username),
        httponly=True,
        samesite=COOKIE_SAMESITE,
        secure=COOKIE_SECURE,
        max_age=60 * 60 * 8,
        path="/",
    )


def clear_admin_cookie(response: Response) -> None:
    response.delete_cookie(COOKIE_NAME, path="/")


def admin_required(admin_session: str | None = Cookie(default=None)) -> bool:
    if not admin_session:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Admin login required")
    payload = _read_token(admin_session)
    if not payload or payload.get("u") != ADMIN_USERNAME:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Admin login required")
    return True
