"""
LLM client interface and Claude adapter for NextAgentAI.
All LLM calls go through this abstraction — swap providers by changing the adapter.
"""
from __future__ import annotations

import json
import os
from abc import ABC, abstractmethod
from typing import Any

import anthropic

from backend.app.observability.logging import get_logger

logger = get_logger(__name__)


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


class ClaudeClient(LLMClient):
    """
    Anthropic Claude adapter.
    Defaults to claude-sonnet-4-6 as specified in PRD Section 10.

    JSON mode: injects a system instruction and parses the response.
    If the response cannot be parsed, the raw string is returned — callers
    must handle potential parse failures gracefully.
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
        self._client = anthropic.Anthropic(api_key=resolved_key)
        self.model = model
        self.default_max_tokens = max_tokens
        logger.info("ClaudeClient initialised", extra={"model": model})

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

        logger.info(
            "LLM request",
            extra={
                "model": self.model,
                "json_mode": json_mode,
                "prompt_chars": len(prompt),
            },
        )

        response = self._client.messages.create(**kwargs)
        text = response.content[0].text if response.content else ""

        if json_mode:
            # Attempt validation; if it fails, return raw — caller handles
            try:
                json.loads(text)
            except json.JSONDecodeError:
                logger.warning(
                    "LLM returned invalid JSON in json_mode",
                    extra={"raw_response": text[:200]},
                )

        logger.info(
            "LLM response",
            extra={
                "model": self.model,
                "output_chars": len(text),
                "stop_reason": response.stop_reason,
            },
        )
        return text


def get_llm_client(model: str | None = None) -> LLMClient:
    """
    Factory function — returns a configured LLMClient.
    Reads model from environment or uses the PRD default.
    """
    resolved_model = model or os.environ.get("LLM_MODEL", "claude-sonnet-4-6")
    return ClaudeClient(model=resolved_model)
