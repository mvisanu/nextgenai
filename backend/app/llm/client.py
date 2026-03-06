"""
LLM client interface and Claude adapter for NextAgentAI.
All LLM calls go through this abstraction — swap providers by changing the adapter.

T-16: AsyncAnthropic added. ClaudeClient now exposes both a sync complete() and
an async complete_async() coroutine. Factory functions get_async_llm_client() and
get_async_fast_llm_client() follow the same singleton pattern as their sync counterparts.

T3-02: Token usage (input_tokens, output_tokens) and estimated_cost_usd are logged
on every LLM call for cost visibility.
T3-10: max_retries=3 set on both Anthropic and AsyncAnthropic constructors.
"""
from __future__ import annotations

import json
import os
import time
from abc import ABC, abstractmethod
from typing import Any

import anthropic
from anthropic import AsyncAnthropic

from backend.app.observability.logging import get_logger

logger = get_logger(__name__)

# ---------------------------------------------------------------------------
# Per-million-token cost rates (USD) — update when Anthropic changes pricing.
# ---------------------------------------------------------------------------
_COST_PER_M_INPUT: dict[str, float] = {
    "claude-sonnet-4-6": 3.00,
    "claude-haiku-4-5-20251001": 0.25,
}
_COST_PER_M_OUTPUT: dict[str, float] = {
    "claude-sonnet-4-6": 15.00,
    "claude-haiku-4-5-20251001": 1.25,
}


def _estimate_cost(model: str, input_tokens: int, output_tokens: int) -> float:
    """Return estimated USD cost for a single LLM call."""
    rate_in = _COST_PER_M_INPUT.get(model, 3.00)
    rate_out = _COST_PER_M_OUTPUT.get(model, 15.00)
    return round((input_tokens * rate_in + output_tokens * rate_out) / 1_000_000, 8)


class LLMClient(ABC):
    """
    Abstract LLM client.
    Concrete implementations must handle their own API auth and retry logic.
    """

    @abstractmethod
    def complete(
        self,
        prompt: str,
        system: str = "",
        json_mode: bool = False,
        max_tokens: int = 4096,
    ) -> str:
        """
        Send a prompt and return the model's text response.

        Args:
            prompt:     The user-turn message.
            system:     Optional system prompt.
            json_mode:  If True, instruct the model to return valid JSON only.
            max_tokens: Maximum tokens to generate.

        Returns:
            Model response as a string (already JSON-serialisable when json_mode=True).
        """
        ...

    @abstractmethod
    async def complete_async(
        self,
        prompt: str,
        system: str = "",
        json_mode: bool = False,
        max_tokens: int = 4096,
    ) -> str:
        """
        Async variant of complete(). Coroutine — must be awaited.

        Args:
            prompt:     The user-turn message.
            system:     Optional system prompt.
            json_mode:  If True, instruct the model to return valid JSON only.
            max_tokens: Maximum tokens to generate.

        Returns:
            Model response as a string.
        """
        ...


class ClaudeClient(LLMClient):
    """
    Anthropic Claude adapter.
    Defaults to claude-sonnet-4-6 as specified in PRD Section 10.

    JSON mode: injects a system instruction and parses the response.
    If the response cannot be parsed, the raw string is returned — callers
    must handle potential parse failures gracefully.

    T-16: Both sync (_client) and async (_async_client) Anthropic SDK clients
    are instantiated at construction time and share the same API key and model.
    """

    def __init__(
        self,
        model: str = "claude-sonnet-4-6",
        max_tokens: int = 4096,
        api_key: str | None = None,
    ) -> None:
        resolved_key = api_key or os.environ.get("ANTHROPIC_API_KEY", "")
        if not resolved_key:
            raise EnvironmentError(
                "ANTHROPIC_API_KEY environment variable is required to use ClaudeClient. "
                "Set it in your .env file or as a Render/Vercel secret."
            )
        self._client = anthropic.Anthropic(api_key=resolved_key, max_retries=3)
        self._async_client = AsyncAnthropic(api_key=resolved_key, max_retries=3)
        self.model = model
        self.default_max_tokens = max_tokens
        logger.info("ClaudeClient initialised", extra={"model": model})

    def _build_kwargs(
        self,
        prompt: str,
        system: str,
        json_mode: bool,
        max_tokens: int | None,
    ) -> tuple[dict[str, Any], str]:
        """
        Shared logic for building the Anthropic messages.create() kwargs.
        Returns (kwargs_dict, system_prompt_with_json_instruction).
        """
        if json_mode:
            json_instruction = (
                "\n\nIMPORTANT: Your response MUST be valid JSON only. "
                "Do not include any text before or after the JSON object. "
                "Do not use markdown code fences."
            )
            system = (system + json_instruction).strip()

        messages = [{"role": "user", "content": prompt}]
        kwargs: dict[str, Any] = {
            "model": self.model,
            "max_tokens": max_tokens or self.default_max_tokens,
            "messages": messages,
        }
        if system:
            kwargs["system"] = system

        return kwargs, system

    @staticmethod
    def _parse_response_text(text: str, json_mode: bool) -> str:
        """
        Strip markdown fences if present and validate JSON when json_mode=True.
        Returns the cleaned text string.

        T3-01: Raises json.JSONDecodeError when JSON is invalid so callers can
        catch and trigger a retry rather than silently using a malformed string.
        """
        if json_mode:
            stripped = text.strip()
            if stripped.startswith("```"):
                lines = stripped.split("\n")
                inner = "\n".join(lines[1:] if lines[-1].strip() == "```" else lines[1:])
                inner = inner.rstrip("` \n")
                text = inner
            try:
                json.loads(text)
            except json.JSONDecodeError:
                logger.warning(
                    "LLM returned invalid JSON in json_mode",
                    extra={"raw_response": text[:300]},
                )
                raise  # Re-raise so callers can catch and retry
        return text

    def complete(
        self,
        prompt: str,
        system: str = "",
        json_mode: bool = False,
        max_tokens: int | None = None,
    ) -> str:
        """
        Send a message to Claude and return the text response.

        When json_mode=True, appends a JSON-enforcement instruction to the system
        prompt and validates the response is parseable JSON before returning.

        T3-02: Logs input_tokens, output_tokens, latency_ms, and estimated_cost_usd.
        T3-10: SDK retries up to 3 times on 429/500/529 automatically.
        """
        kwargs, _ = self._build_kwargs(prompt, system, json_mode, max_tokens)

        logger.info(
            "LLM request",
            extra={
                "model": self.model,
                "json_mode": json_mode,
                "prompt_chars": len(prompt),
            },
        )

        t_start = time.perf_counter()
        response = self._client.messages.create(**kwargs)
        latency_ms = round((time.perf_counter() - t_start) * 1000, 1)

        text = response.content[0].text if response.content else ""
        text = self._parse_response_text(text, json_mode)

        input_tokens = response.usage.input_tokens if response.usage else 0
        output_tokens = response.usage.output_tokens if response.usage else 0
        cost = _estimate_cost(self.model, input_tokens, output_tokens)

        logger.info(
            "LLM response",
            extra={
                "model": self.model,
                "output_chars": len(text),
                "stop_reason": response.stop_reason,
                "input_tokens": input_tokens,
                "output_tokens": output_tokens,
                "latency_ms": latency_ms,
                "estimated_cost_usd": cost,
            },
        )
        return text

    async def complete_async(
        self,
        prompt: str,
        system: str = "",
        json_mode: bool = False,
        max_tokens: int | None = None,
    ) -> str:
        """
        Async variant of complete(). Uses AsyncAnthropic — must be awaited.

        Identical behaviour to complete() but does not block the event loop
        during the HTTP round-trip to the Anthropic API.

        T3-02: Logs input_tokens, output_tokens, latency_ms, and estimated_cost_usd.
        T3-10: SDK retries up to 3 times on 429/500/529 automatically.
        """
        kwargs, _ = self._build_kwargs(prompt, system, json_mode, max_tokens)

        logger.info(
            "LLM async request",
            extra={
                "model": self.model,
                "json_mode": json_mode,
                "prompt_chars": len(prompt),
            },
        )

        t_start = time.perf_counter()
        try:
            response = await self._async_client.messages.create(**kwargs)
        except anthropic.APIStatusError as exc:
            logger.warning(
                "LLM async API error (SDK will retry if configured)",
                extra={"model": self.model, "status_code": exc.status_code, "error": str(exc)[:200]},
            )
            raise

        latency_ms = round((time.perf_counter() - t_start) * 1000, 1)

        text = response.content[0].text if response.content else ""
        text = self._parse_response_text(text, json_mode)

        input_tokens = response.usage.input_tokens if response.usage else 0
        output_tokens = response.usage.output_tokens if response.usage else 0
        cost = _estimate_cost(self.model, input_tokens, output_tokens)

        logger.info(
            "LLM async response",
            extra={
                "model": self.model,
                "output_chars": len(text),
                "stop_reason": response.stop_reason,
                "input_tokens": input_tokens,
                "output_tokens": output_tokens,
                "latency_ms": latency_ms,
                "estimated_cost_usd": cost,
            },
        )
        return text


# ---------------------------------------------------------------------------
# Singleton caches — one instance per process per model tier.
# ---------------------------------------------------------------------------

_llm_singleton: LLMClient | None = None
_fast_llm_singleton: LLMClient | None = None
_async_llm_singleton: LLMClient | None = None
_async_fast_llm_singleton: LLMClient | None = None


def get_llm_client(model: str | None = None) -> LLMClient:
    """
    Factory function — returns a configured LLMClient (Sonnet).
    Reads model from environment or uses the PRD default.
    """
    global _llm_singleton
    if _llm_singleton is None:
        resolved_model = model or os.environ.get("LLM_MODEL", "claude-sonnet-4-6")
        _llm_singleton = ClaudeClient(model=resolved_model)
    return _llm_singleton


def get_fast_llm_client() -> LLMClient:
    """
    Returns a Haiku client for lightweight routing tasks (intent, plan, verify).
    3-4x faster than Sonnet for structured JSON outputs with no quality loss.
    Singleton — same instance returned on every call.
    """
    global _fast_llm_singleton
    if _fast_llm_singleton is None:
        _fast_llm_singleton = ClaudeClient(model="claude-haiku-4-5-20251001")
    return _fast_llm_singleton


def get_async_llm_client(model: str | None = None) -> LLMClient:
    """
    Factory function — returns a configured async-capable LLMClient (Sonnet).
    The returned ClaudeClient exposes complete_async() for use with asyncio.
    Singleton — same instance returned on every call.
    """
    global _async_llm_singleton
    if _async_llm_singleton is None:
        resolved_model = model or os.environ.get("LLM_MODEL", "claude-sonnet-4-6")
        _async_llm_singleton = ClaudeClient(model=resolved_model)
    return _async_llm_singleton


def get_async_fast_llm_client() -> LLMClient:
    """
    Returns an async-capable Haiku client for classify/plan/verify.
    Singleton — same instance returned on every call.
    """
    global _async_fast_llm_singleton
    if _async_fast_llm_singleton is None:
        _async_fast_llm_singleton = ClaudeClient(model="claude-haiku-4-5-20251001")
    return _async_fast_llm_singleton
