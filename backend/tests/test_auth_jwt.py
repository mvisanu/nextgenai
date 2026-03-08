"""
test_auth_jwt.py — Wave 4 JWT authentication tests.

Covers:
1. verify_token with valid HS256 JWT → returns claims dict with 'sub' key
2. verify_token with expired JWT → HTTPException(401)
3. verify_token with wrong-secret JWT → HTTPException(401)
4. get_current_user with missing Authorization header → HTTPException(401)
5. get_current_user with malformed Authorization header (no Bearer prefix) → HTTPException(401)

All tests run without a live database.
Uses python-jose to mint test JWTs with a test secret — no real SUPABASE_JWT_SECRET used.
"""
from __future__ import annotations

import os
import time

import pytest
from fastapi import HTTPException
from jose import jwt

# ---------------------------------------------------------------------------
# Test constants
# ---------------------------------------------------------------------------

TEST_JWT_SECRET = "test-secret-for-unit-tests-wave4-auth"
_ALGORITHM = "HS256"


def _mint_token(
    sub: str = "test-user-uuid-1234",
    secret: str = TEST_JWT_SECRET,
    exp_offset: int = 3600,
) -> str:
    """
    Helper: create a signed HS256 JWT for testing.

    Args:
        sub:        Subject claim (Supabase user UUID).
        secret:     Signing secret.
        exp_offset: Seconds from now until expiry. Negative = already expired.

    Returns:
        Encoded JWT string.
    """
    payload = {
        "sub": sub,
        "iat": int(time.time()),
        "exp": int(time.time()) + exp_offset,
        "role": "authenticated",
    }
    return jwt.encode(payload, secret, algorithm=_ALGORITHM)


# ---------------------------------------------------------------------------
# Helpers for patching the env secret
# ---------------------------------------------------------------------------


class TestVerifyToken:
    """Tests for verify_token() in backend.app.auth.jwt."""

    def test_valid_token_returns_claims(self, monkeypatch):
        """A correctly signed, non-expired JWT → returns claims dict with 'sub'."""
        monkeypatch.setenv("SUPABASE_JWT_SECRET", TEST_JWT_SECRET)
        from backend.app.auth.jwt import verify_token

        token = _mint_token(sub="user-uuid-abc-123")
        claims = verify_token(token)

        assert isinstance(claims, dict), "verify_token must return a dict"
        assert claims.get("sub") == "user-uuid-abc-123", "'sub' claim must be present"
        assert claims.get("role") == "authenticated"

    def test_expired_token_raises_401(self, monkeypatch):
        """A token whose 'exp' is in the past → HTTPException(401)."""
        monkeypatch.setenv("SUPABASE_JWT_SECRET", TEST_JWT_SECRET)
        from backend.app.auth.jwt import verify_token

        # exp_offset=-10 means the token expired 10 seconds ago
        expired_token = _mint_token(exp_offset=-10)

        with pytest.raises(HTTPException) as exc_info:
            verify_token(expired_token)

        assert exc_info.value.status_code == 401

    def test_wrong_secret_raises_401(self, monkeypatch):
        """A token signed with a different secret → HTTPException(401)."""
        monkeypatch.setenv("SUPABASE_JWT_SECRET", TEST_JWT_SECRET)
        from backend.app.auth.jwt import verify_token

        wrong_secret_token = _mint_token(secret="completely-wrong-secret")

        with pytest.raises(HTTPException) as exc_info:
            verify_token(wrong_secret_token)

        assert exc_info.value.status_code == 401

    def test_missing_sub_claim_raises_401(self, monkeypatch):
        """A valid-signature token without a 'sub' claim → HTTPException(401)."""
        monkeypatch.setenv("SUPABASE_JWT_SECRET", TEST_JWT_SECRET)
        from backend.app.auth.jwt import verify_token

        payload = {"iat": int(time.time()), "exp": int(time.time()) + 3600, "role": "anon"}
        no_sub_token = jwt.encode(payload, TEST_JWT_SECRET, algorithm=_ALGORITHM)

        with pytest.raises(HTTPException) as exc_info:
            verify_token(no_sub_token)

        assert exc_info.value.status_code == 401

    def test_malformed_token_raises_401(self, monkeypatch):
        """A completely malformed string → HTTPException(401), not a crash."""
        monkeypatch.setenv("SUPABASE_JWT_SECRET", TEST_JWT_SECRET)
        from backend.app.auth.jwt import verify_token

        with pytest.raises(HTTPException) as exc_info:
            verify_token("not.a.jwt")

        assert exc_info.value.status_code == 401

    def test_error_detail_never_contains_secret(self, monkeypatch):
        """The exception detail must never expose the JWT secret."""
        monkeypatch.setenv("SUPABASE_JWT_SECRET", TEST_JWT_SECRET)
        from backend.app.auth.jwt import verify_token

        with pytest.raises(HTTPException) as exc_info:
            verify_token("bad-token")

        detail = str(exc_info.value.detail)
        assert TEST_JWT_SECRET not in detail, (
            "SECURITY: JWT secret leaked into HTTPException detail!"
        )

    def test_missing_env_secret_raises_401(self, monkeypatch):
        """If SUPABASE_JWT_SECRET is not set, authentication must be denied."""
        monkeypatch.delenv("SUPABASE_JWT_SECRET", raising=False)
        # Re-import to force fresh env read
        import importlib
        import backend.app.auth.jwt as jwt_mod
        importlib.reload(jwt_mod)

        with pytest.raises(HTTPException) as exc_info:
            jwt_mod.verify_token("any-token")

        assert exc_info.value.status_code == 401
        # Reload with secret for other tests
        monkeypatch.setenv("SUPABASE_JWT_SECRET", TEST_JWT_SECRET)
        importlib.reload(jwt_mod)


class TestGetCurrentUser:
    """Tests for get_current_user() FastAPI dependency."""

    def _make_request(self, authorization: str | None) -> object:
        """
        Construct a minimal mock Request-like object with the given
        Authorization header value. Returns an object with a .headers dict.
        """
        from unittest.mock import MagicMock
        mock_request = MagicMock()
        if authorization is not None:
            mock_request.headers.get = lambda key, default=None: (
                authorization if key.lower() in ("authorization",) else default
            )
        else:
            mock_request.headers.get = lambda key, default=None: default
        return mock_request

    def test_valid_bearer_token_returns_claims(self, monkeypatch):
        """A valid Authorization: Bearer <token> header → claims dict returned."""
        monkeypatch.setenv("SUPABASE_JWT_SECRET", TEST_JWT_SECRET)
        from backend.app.auth.jwt import get_current_user

        token = _mint_token(sub="user-uuid-xyz")
        request = self._make_request(f"Bearer {token}")
        claims = get_current_user(request)

        assert claims.get("sub") == "user-uuid-xyz"

    def test_missing_authorization_header_raises_401(self, monkeypatch):
        """No Authorization header → HTTPException(401)."""
        monkeypatch.setenv("SUPABASE_JWT_SECRET", TEST_JWT_SECRET)
        from backend.app.auth.jwt import get_current_user

        request = self._make_request(None)

        with pytest.raises(HTTPException) as exc_info:
            get_current_user(request)

        assert exc_info.value.status_code == 401

    def test_malformed_header_no_bearer_prefix_raises_401(self, monkeypatch):
        """Authorization header without 'Bearer ' prefix → HTTPException(401)."""
        monkeypatch.setenv("SUPABASE_JWT_SECRET", TEST_JWT_SECRET)
        from backend.app.auth.jwt import get_current_user

        token = _mint_token()
        # Missing "Bearer " prefix — just the raw token
        request = self._make_request(token)

        with pytest.raises(HTTPException) as exc_info:
            get_current_user(request)

        assert exc_info.value.status_code == 401

    def test_bearer_with_wrong_scheme_raises_401(self, monkeypatch):
        """Authorization header with 'Token ' prefix (not 'Bearer ') → 401."""
        monkeypatch.setenv("SUPABASE_JWT_SECRET", TEST_JWT_SECRET)
        from backend.app.auth.jwt import get_current_user

        token = _mint_token()
        request = self._make_request(f"Token {token}")

        with pytest.raises(HTTPException) as exc_info:
            get_current_user(request)

        assert exc_info.value.status_code == 401

    def test_bearer_with_empty_token_raises_401(self, monkeypatch):
        """Authorization: Bearer  (empty token after prefix) → 401."""
        monkeypatch.setenv("SUPABASE_JWT_SECRET", TEST_JWT_SECRET)
        from backend.app.auth.jwt import get_current_user

        request = self._make_request("Bearer ")

        with pytest.raises(HTTPException) as exc_info:
            get_current_user(request)

        assert exc_info.value.status_code == 401
