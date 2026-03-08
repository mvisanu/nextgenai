"""
backend.app.auth — JWT authentication package for NextAgentAI Wave 4.

Exports:
    jwt.verify_token     — decode and validate a Supabase HS256 JWT
    jwt.get_current_user — FastAPI dependency that extracts the Bearer token
"""
