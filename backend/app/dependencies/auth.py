"""Firebase ID token verification dependency.

Mirrors functions/src/auth.js's assertAuthenticated: every route that used to
require request.auth.uid in the Node backend depends on `require_auth` here.
Same trust model — a valid Firebase ID token proves who the caller is; there
is no additional authorization/role check at this layer (that still lives in
Firestore security rules and, for assessments, room/problem membership checks
done in the route handlers themselves).
"""
from fastapi import Header, HTTPException
from firebase_admin import auth as firebase_auth

from app.config import DEBUG
from app.services.firestore_client import ensure_firebase_app


class DecodedUser:
    """Thin wrapper around firebase_admin's decoded token dict.

    Mirrors the shape callers previously read off `request.auth` in the
    Node callables (`request.auth.uid`, `request.auth.token.name`).
    """

    def __init__(self, decoded_token: dict):
        self._token = decoded_token

    @property
    def uid(self) -> str:
        return self._token["uid"]

    @property
    def name(self) -> str | None:
        return self._token.get("name")

    @property
    def email(self) -> str | None:
        return self._token.get("email")


async def require_auth(authorization: str | None = Header(default=None)) -> DecodedUser:
    """Extracts and verifies a `Authorization: Bearer <token>` header.

    Raises 401 if the header is missing, malformed, or the token doesn't
    verify — matching assertAuthenticated's "You must be logged in." behavior.
    """
    ensure_firebase_app()

    if not authorization or not authorization.startswith("Bearer "):
        if DEBUG:
            print(f"[auth] Authorization header missing or not Bearer-prefixed: {authorization!r}")
        raise HTTPException(status_code=401, detail="You must be logged in.")

    id_token = authorization[len("Bearer "):].strip()
    if not id_token:
        if DEBUG:
            print("[auth] Authorization header present but empty after 'Bearer ' prefix")
        raise HTTPException(status_code=401, detail="You must be logged in.")

    if DEBUG:
        print(f"[auth] Authorization header received, token length={len(id_token)}")

    try:
        decoded_token = firebase_auth.verify_id_token(id_token)
    except Exception as exc:  # firebase_admin raises several distinct error types
        if DEBUG:
            print(f"[auth] verify_id_token FAILED: {type(exc).__name__}: {exc}")
        raise HTTPException(status_code=401, detail="You must be logged in.") from exc

    if DEBUG:
        print(f"[auth] verify_id_token OK, uid={decoded_token.get('uid')}")

    return DecodedUser(decoded_token)
