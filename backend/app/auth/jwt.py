"""
backend.app.auth.jwt — Supabase JWT verification for FastAPI.

verify_token(token: str) -> dict
    Decodes an HS256 JWT using SUPABASE_JWT_SECRET from the environment.
    Returns the full claims dict on success.
    Raises HTTPException(401) for: expired token, wrong signature,
    missing 'sub' claim, or any malformed / unparseable token.

get_current_user(request: Request) -> dict
    FastAPI dependency. Extracts the Bearer token from the Authorization
    header, calls verify_token, and returns the claims dict.
    Raises HTTPException(401) if the header is absent or malformed.

Security notes:
- SUPABASE_JWT_SECRET is read at call time via os.environ — never cached in
  module-level state so secret rotation takes effect without restart.
- The secret value is NEVER included in exception detail strings or log output.
- Algorithm is fixed to HS256 (Supabase default).
- No outbound HTTP calls are made — verification is fully local.
"""
from __future__ import annotations

import os

from fastapi import HTTPException, Request
from jose import ExpiredSignatureError, JWTError, jwt

_ALGORITHM = "HS256"


def verify_token(token: str) -> dict:
    """
    Decode and validate a Supabase-issued HS256 JWT.

    Args:
        token: Raw JWT string (without "Bearer " prefix).

    Returns:
        Claims dict (payload) on success.

    Raises:
        HTTPException(401): If the token is expired, has the wrong signature,
            is missing the required 'sub' claim, or is malformed in any way.
    """
    secret = os.environ.get("SUPABASE_JWT_SECRET")
    if not secret:
        # Treat a missing secret as a configuration error — deny access rather
        # than silently allow all requests.
        raise HTTPException(
            status_code=401,
            detail="Authentication not configured.",
        )

    try:
        payload = jwt.decode(token, secret, algorithms=[_ALGORITHM])
    except ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token has expired.")
    except JWTError:
        # Covers wrong signature, malformed token, unsupported algorithm, etc.
        # We intentionally use a generic message to avoid leaking token details.
        raise HTTPException(status_code=401, detail="Invalid authentication token.")

    # 'sub' (subject) is the Supabase user UUID — it must be present.
    if not payload.get("sub"):
        raise HTTPException(status_code=401, detail="Invalid authentication token.")

    return payload


def get_current_user(request: Request) -> dict:
    """
    FastAPI dependency: extract and verify the Bearer JWT from the request.

    Usage in a route:
        @router.get("/protected")
        async def protected(current_user: dict = Depends(get_current_user)):
            user_id = current_user["sub"]

    Args:
        request: The incoming FastAPI Request object.

    Returns:
        Verified JWT claims dict (same as verify_token return value).

    Raises:
        HTTPException(401): If the Authorization header is absent, does not
            start with "Bearer ", or contains an invalid/expired token.
    """
    auth_header = request.headers.get("Authorization") or request.headers.get("authorization")

    if not auth_header:
        raise HTTPException(
            status_code=401,
            detail="Authorization header missing.",
        )

    if not auth_header.startswith("Bearer "):
        raise HTTPException(
            status_code=401,
            detail="Authorization header must use Bearer scheme.",
        )

    token = auth_header[len("Bearer "):]
    if not token:
        raise HTTPException(
            status_code=401,
            detail="Bearer token is empty.",
        )

    return verify_token(token)


def get_optional_user(request: Request) -> dict | None:
    """
    FastAPI dependency: extract and verify the Bearer JWT from the request,
    but return None (instead of raising 401) when the Authorization header is
    absent or empty.

    Use this on endpoints that should work both for authenticated users (token
    present and valid → user dict returned) and anonymous users (no token →
    None returned).  A *present but invalid* token still raises HTTPException(401)
    so that callers don't silently ignore bad credentials.

    Usage in a route:
        @router.post("/query")
        async def run_query(current_user: dict | None = Depends(get_optional_user)):
            user_id = current_user["sub"] if current_user else None
    """
    auth_header = request.headers.get("Authorization") or request.headers.get("authorization")

    # No header at all → anonymous request
    if not auth_header:
        return None

    if not auth_header.startswith("Bearer "):
        raise HTTPException(
            status_code=401,
            detail="Authorization header must use Bearer scheme.",
        )

    token = auth_header[len("Bearer "):].strip()
    if not token:
        return None

    return verify_token(token)
