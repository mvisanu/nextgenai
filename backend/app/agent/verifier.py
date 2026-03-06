"""
Claim verifier and confidence scorer.
Verifies each claim in the agent's synthesised answer against retrieved evidence,
assigns confidence scores, and attaches citations.

T-17: verify_claims_async() is the async variant used by the async orchestrator.
"""
from __future__ import annotations

import json
from typing import Any

from pydantic import ValidationError

from backend.app.llm.client import LLMClient
from backend.app.observability.logging import get_logger
from backend.app.schemas.llm_outputs import VerifyOutput

logger = get_logger(__name__)

_SYSTEM_PROMPT = """\
You are a claim verifier for a manufacturing intelligence system.
Given a list of claims and supporting evidence, assess each claim's validity
and assign a confidence score from 0.0 (no support) to 1.0 (strongly supported).

Rules:
- Confidence >= 0.8: claim is directly supported by 2+ evidence items with consistent details
- Confidence 0.5-0.8: claim is partially supported by 1-2 evidence items
- Confidence 0.3-0.5: claim is weakly supported or inferred
- Confidence <= 0.3: claim has no evidence support or conflicts with evidence

For each claim, extract supporting citations from the evidence:
- citation chunk_id: the embed_id of the supporting chunk
- citation incident_id: the incident_id of the source
- citation char_start/char_end: character span in the chunk text (use 0 and len(chunk_text) if unknown)

If a claim conflicts with evidence, reduce confidence by 0.2 and add a conflict_note.
If an evidence item has conflict_flagged: true, treat it as a known conflict — reduce
confidence by 0.2 and populate conflict_note to explain the contradiction.

Return JSON ONLY:
{
  "verified_claims": [
    {
      "text": "...",
      "confidence": 0.87,
      "citations": [{"chunk_id": "...", "incident_id": "...", "char_start": 0, "char_end": 100}],
      "conflict_note": null
    }
  ]
}
"""


def verify_claims(
    claims: list[dict[str, Any]],
    evidence: list[dict[str, Any]],
    llm: LLMClient,
) -> list[dict[str, Any]]:
    """
    Verify claims against evidence and return claims with confidence scores and citations.

    Args:
        claims:   List of raw claim dicts from synthesis (at minimum: {"text": "..."}).
        evidence: Evidence items from vector search and graph expansion.
        llm:      LLMClient instance.

    Returns:
        List of verified claim dicts:
            text          (str)
            confidence    (float) — 0.0 to 1.0
            citations     (list of citation dicts)
            conflict_note (str | None)
    """
    if not claims:
        return []

    logger.info("Verifying claims", extra={"claim_count": len(claims), "evidence_count": len(evidence)})

    # Build evidence summary for the LLM (keep small — verify only needs top hits)
    # T3-07: include conflict_flagged from graph scorer so LLM can act on it
    evidence_summary = []
    for item in evidence[:5]:
        evidence_summary.append({
            "chunk_id": item.get("chunk_id") or item.get("node_id", ""),
            "incident_id": item.get("incident_id") or item.get("source_incident_id", ""),
            "excerpt": (item.get("excerpt") or item.get("text_excerpt", ""))[:150],
            "score": item.get("score") or item.get("composite_score", 0.0),
            "conflict_flagged": item.get("conflict", False),  # T3-07
        })

    prompt = (
        f"Claims to verify:\n{json.dumps(claims, indent=2)}\n\n"
        f"Supporting evidence:\n{json.dumps(evidence_summary, indent=2)}\n\n"
        f"Verify each claim and return the JSON response."
    )

    def _do_call(p: str) -> VerifyOutput:
        raw = llm.complete(
            prompt=p,
            system=_SYSTEM_PROMPT,
            json_mode=True,
            max_tokens=1536,
        )
        data = json.loads(raw)
        return VerifyOutput.model_validate(data)

    try:
        try:
            validated = _do_call(prompt)
        except (json.JSONDecodeError, ValidationError) as first_err:
            # T3-01: one-shot retry with error-correction prefix
            logger.warning(
                "verify_claims: validation failed — retrying",
                extra={"error": str(first_err)[:300]},
            )
            retry_prompt = (
                f"{prompt}\n\n"
                f"Your previous response failed validation: {first_err}. "
                "Please return valid JSON matching the schema exactly."
            )
            validated = _do_call(retry_prompt)

        result = []
        for claim in validated.verified_claims:
            norm_citations = [
                {
                    "chunk_id": c.get("chunk_id", ""),
                    "incident_id": c.get("incident_id", ""),
                    "char_start": int(c.get("char_start", 0)),
                    "char_end": int(c.get("char_end", 100)),
                }
                for c in claim.citations
            ]
            confidence = max(0.0, min(1.0, claim.confidence))
            if len(evidence) < 2:
                confidence = min(confidence, 0.5)
            result.append({
                "text": claim.text,
                "confidence": round(confidence, 3),
                "citations": norm_citations,
                "conflict_note": claim.conflict_note,
            })

        logger.info("Claims verified", extra={"verified": len(result)})
        return result

    except Exception as exc:
        logger.warning("Claim verification failed — using fallback scores", extra={"error": str(exc)})
        return _fallback_verification(claims, evidence)


async def verify_claims_async(
    claims: list[dict[str, Any]],
    evidence: list[dict[str, Any]],
    llm: LLMClient,
) -> list[dict[str, Any]]:
    """
    Async variant of verify_claims().

    Uses complete_async() so the event loop is not blocked during the
    Haiku API round-trip. Semantics are identical to the sync version.

    Args:
        claims:   List of raw claim dicts from synthesis.
        evidence: Evidence items from vector search and graph expansion.
        llm:      LLMClient instance with complete_async() (ClaudeClient).

    Returns:
        List of verified claim dicts with confidence scores and citations.
    """
    if not claims:
        return []

    logger.info(
        "verify_claims_async: verifying",
        extra={"claim_count": len(claims), "evidence_count": len(evidence)},
    )

    # T3-07: include conflict_flagged from graph scorer
    evidence_summary = []
    for item in evidence[:5]:
        evidence_summary.append({
            "chunk_id": item.get("chunk_id") or item.get("node_id", ""),
            "incident_id": item.get("incident_id") or item.get("source_incident_id", ""),
            "excerpt": (item.get("excerpt") or item.get("text_excerpt", ""))[:150],
            "score": item.get("score") or item.get("composite_score", 0.0),
            "conflict_flagged": item.get("conflict", False),  # T3-07
        })

    prompt = (
        f"Claims to verify:\n{json.dumps(claims, indent=2)}\n\n"
        f"Supporting evidence:\n{json.dumps(evidence_summary, indent=2)}\n\n"
        f"Verify each claim and return the JSON response."
    )

    async def _do_call_async(p: str) -> VerifyOutput:
        raw = await llm.complete_async(
            prompt=p,
            system=_SYSTEM_PROMPT,
            json_mode=True,
            max_tokens=1536,
        )
        data = json.loads(raw)
        return VerifyOutput.model_validate(data)

    try:
        try:
            validated = await _do_call_async(prompt)
        except (json.JSONDecodeError, ValidationError) as first_err:
            # T3-01: one-shot retry with error-correction prefix
            logger.warning(
                "verify_claims_async: validation failed — retrying",
                extra={"error": str(first_err)[:300]},
            )
            retry_prompt = (
                f"{prompt}\n\n"
                f"Your previous response failed validation: {first_err}. "
                "Please return valid JSON matching the schema exactly."
            )
            validated = await _do_call_async(retry_prompt)

        result = []
        for claim in validated.verified_claims:
            norm_citations = [
                {
                    "chunk_id": c.get("chunk_id", ""),
                    "incident_id": c.get("incident_id", ""),
                    "char_start": int(c.get("char_start", 0)),
                    "char_end": int(c.get("char_end", 100)),
                }
                for c in claim.citations
            ]
            confidence = max(0.0, min(1.0, claim.confidence))
            if len(evidence) < 2:
                confidence = min(confidence, 0.5)
            result.append({
                "text": claim.text,
                "confidence": round(confidence, 3),
                "citations": norm_citations,
                "conflict_note": claim.conflict_note,
            })

        logger.info("verify_claims_async: complete", extra={"verified": len(result)})
        return result

    except Exception as exc:
        logger.warning(
            "verify_claims_async: failed — using fallback scores",
            extra={"error": str(exc)},
        )
        return _fallback_verification(claims, evidence)


def _fallback_verification(
    claims: list[dict[str, Any]],
    evidence: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    """
    Fallback: assign ranked confidence scores based on evidence count and claim position.
    Used when the LLM fails to respond correctly.

    T3-07: confidence is ranked by position (earlier claims get higher scores) so
    the fallback provides a meaningful signal rather than flat uniform scores.
    """
    base_confidence = 0.6 if len(evidence) >= 2 else 0.3

    result = []
    for idx, claim in enumerate(claims):
        # Attach first evidence item as citation if available
        citations = []
        if evidence:
            first = evidence[0]
            citations.append({
                "chunk_id": first.get("chunk_id") or first.get("node_id", ""),
                "incident_id": first.get("incident_id") or first.get("source_incident_id", ""),
                "char_start": 0,
                "char_end": 100,
            })

        # T3-07: rank confidence by position — each subsequent claim is 0.05 lower, floor 0.2
        confidence = max(0.2, base_confidence - 0.05 * idx)

        result.append({
            "text": str(claim.get("text", claim if isinstance(claim, str) else "")),
            "confidence": round(confidence, 3),
            "citations": citations,
            "conflict_note": None,
        })

    return result
