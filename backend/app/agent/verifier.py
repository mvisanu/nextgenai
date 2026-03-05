"""
Claim verifier and confidence scorer.
Verifies each claim in the agent's synthesised answer against retrieved evidence,
assigns confidence scores, and attaches citations.
"""
from __future__ import annotations

import json
from typing import Any

from backend.app.llm.client import LLMClient
from backend.app.observability.logging import get_logger

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

    # Build evidence summary for the LLM (truncated to avoid token limits)
    evidence_summary = []
    for item in evidence[:20]:  # Top 20 evidence items
        evidence_summary.append({
            "chunk_id": item.get("chunk_id") or item.get("node_id", ""),
            "incident_id": item.get("incident_id") or item.get("source_incident_id", ""),
            "excerpt": (item.get("excerpt") or item.get("text_excerpt", ""))[:300],
            "score": item.get("score") or item.get("composite_score", 0.0),
        })

    prompt = (
        f"Claims to verify:\n{json.dumps(claims, indent=2)}\n\n"
        f"Supporting evidence:\n{json.dumps(evidence_summary, indent=2)}\n\n"
        f"Verify each claim and return the JSON response."
    )

    try:
        response = llm.complete(
            prompt=prompt,
            system=_SYSTEM_PROMPT,
            json_mode=True,
            max_tokens=2048,
        )
        data = json.loads(response)
        verified = data.get("verified_claims", [])

        # Validate and normalise
        result = []
        for claim in verified:
            citations = claim.get("citations", [])
            # Ensure all required citation fields exist
            norm_citations = []
            for c in citations:
                norm_citations.append({
                    "chunk_id": c.get("chunk_id", ""),
                    "incident_id": c.get("incident_id", ""),
                    "char_start": int(c.get("char_start", 0)),
                    "char_end": int(c.get("char_end", 100)),
                })

            confidence = float(claim.get("confidence", 0.5))
            confidence = max(0.0, min(1.0, confidence))  # Clamp to [0, 1]

            # Reduce confidence if evidence is sparse
            if len(evidence) < 2:
                confidence = min(confidence, 0.5)

            result.append({
                "text": str(claim.get("text", "")),
                "confidence": round(confidence, 3),
                "citations": norm_citations,
                "conflict_note": claim.get("conflict_note"),
            })

        logger.info("Claims verified", extra={"verified": len(result)})
        return result

    except Exception as exc:
        logger.warning("Claim verification failed — using fallback scores", extra={"error": str(exc)})
        return _fallback_verification(claims, evidence)


def _fallback_verification(
    claims: list[dict[str, Any]],
    evidence: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    """
    Fallback: assign conservative confidence scores based on evidence count only.
    Used when the LLM fails to respond correctly.
    """
    base_confidence = 0.6 if len(evidence) >= 2 else 0.3

    result = []
    for claim in claims:
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

        result.append({
            "text": str(claim.get("text", claim if isinstance(claim, str) else "")),
            "confidence": base_confidence,
            "citations": citations,
            "conflict_note": None,
        })

    return result
