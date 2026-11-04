from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Protocol

import httpx


@dataclass
class ToolCall:
    id: str
    name: str
    arguments_raw: str


@dataclass
class LLMResult:
    content: str
    tool_calls: list[ToolCall] = field(default_factory=list)
    logprobs: list[float] = field(default_factory=list)
    raw: dict[str, Any] = field(default_factory=dict)


class LLMError(RuntimeError):
    pass


class LLMClient(Protocol):
    def complete(
        self,
        messages: list[dict[str, Any]],
        tools: list[dict[str, Any]],
    ) -> LLMResult: ...


class OpenAICompatibleLLM:
    """Small OpenAI-compatible client for Ollama's /v1 endpoint."""

    def __init__(
        self,
        base_url: str,
        model: str,
        api_key: str = "",
        timeout_seconds: float = 60,
    ) -> None:
        self.base_url = base_url.rstrip("/")
        self.model = model
        self.api_key = api_key
        self.timeout_seconds = timeout_seconds

    def complete(
        self,
        messages: list[dict[str, Any]],
        tools: list[dict[str, Any]],
    ) -> LLMResult:
        payload: dict[str, Any] = {
            "model": self.model,
            "messages": messages,
            "temperature": 0,
            "logprobs": True,
            "top_logprobs": 5,
        }
        if tools:
            payload["tools"] = tools
            payload["tool_choice"] = "auto"

        headers = {"Content-Type": "application/json"}
        if self.api_key:
            headers["Authorization"] = f"Bearer {self.api_key}"

        try:
            with httpx.Client(timeout=self.timeout_seconds) as client:
                response = client.post(
                    f"{self.base_url}/chat/completions",
                    json=payload,
                    headers=headers,
                )
                # Some OpenAI-compatible servers reject logprobs. Retry once
                # without it; the resulting turn is LOW confidence and therefore
                # goes to human review rather than being silently trusted.
                if response.status_code in {400, 422} and "logprobs" in payload:
                    fallback_payload = dict(payload)
                    fallback_payload.pop("logprobs", None)
                    fallback_payload.pop("top_logprobs", None)
                    response = client.post(
                        f"{self.base_url}/chat/completions",
                        json=fallback_payload,
                        headers=headers,
                    )
                response.raise_for_status()
                data = response.json()
        except httpx.HTTPStatusError as exc:
            raise LLMError(
                f"LLM request failed with {exc.response.status_code}: {exc.response.text[:500]}"
            ) from exc
        except httpx.HTTPError as exc:
            raise LLMError(f"LLM request failed: {exc}") from exc
        except ValueError as exc:
            raise LLMError("LLM returned invalid JSON") from exc

        try:
            message = data["choices"][0]["message"]
        except (KeyError, IndexError, TypeError) as exc:
            raise LLMError("LLM response did not contain a message") from exc

        tool_calls = [
            ToolCall(
                id=str(call.get("id") or f"call_{index}"),
                name=str(call.get("function", {}).get("name", "")),
                arguments_raw=str(call.get("function", {}).get("arguments", "")),
            )
            for index, call in enumerate(message.get("tool_calls") or [])
        ]

        logprobs: list[float] = []
        content_logprobs = (data["choices"][0].get("logprobs") or {}).get("content") or []
        for item in content_logprobs:
            value = item.get("logprob")
            if isinstance(value, (int, float)):
                logprobs.append(float(value))

        return LLMResult(
            content=str(message.get("content") or ""),
            tool_calls=tool_calls,
            logprobs=logprobs,
            raw=data,
        )
