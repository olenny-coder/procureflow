from __future__ import annotations

import os
from dataclasses import dataclass

try:
    from dotenv import load_dotenv

    load_dotenv()
except ImportError:  # pragma: no cover - dotenv is optional outside the service image
    pass


def _env(name: str, default: str) -> str:
    return os.getenv(name, default)


@dataclass(frozen=True)
class Settings:
    database_url: str
    internal_token: str
    llm_base_url: str
    llm_api_key: str
    model_name: str
    model_quantization: str
    high_min_logprob: float
    mid_min_logprob: float
    auto_accept_limit_cents: int
    max_turns: int
    llm_timeout_seconds: float
    review_default_role: str
    allow_roles: tuple[str, ...]
    review_roles: tuple[str, ...]

    @classmethod
    def from_env(cls) -> "Settings":
        return cls(
            database_url=_env(
                "DATABASE_URL",
                "postgresql://procureflow:procureflow@localhost:5432/procureflow",
            ),
            internal_token=_env("ASSISTANT_INTERNAL_TOKEN", "dev-assistant-token"),
            llm_base_url=_env("ASSISTANT_LLM_BASE_URL", "http://127.0.0.1:11434/v1"),
            llm_api_key=_env("ASSISTANT_LLM_API_KEY", ""),
            model_name=_env("ASSISTANT_MODEL", "phi4-mini:3.8b"),
            model_quantization=_env("ASSISTANT_MODEL_QUANTIZATION", "Q4_K_M"),
            high_min_logprob=float(_env("ASSISTANT_HIGH_MIN_LOGPROB", "-0.35")),
            mid_min_logprob=float(_env("ASSISTANT_MID_MIN_LOGPROB", "-1.0")),
            auto_accept_limit_cents=int(
                _env("ASSISTANT_AUTO_ACCEPT_LIMIT_CENTS", "250000")
            ),
            max_turns=int(_env("ASSISTANT_MAX_TURNS", "40")),
            llm_timeout_seconds=float(_env("ASSISTANT_LLM_TIMEOUT_SECONDS", "60")),
            review_default_role=_env("ASSISTANT_REVIEW_ROLE", "ADMIN"),
            allow_roles=tuple(
                part.strip().upper()
                for part in _env("ASSISTANT_ALLOW_ROLES", "REQUESTER,ADMIN").split(",")
                if part.strip()
            ),
            review_roles=tuple(
                part.strip().upper()
                for part in _env(
                    "ASSISTANT_REVIEW_ROLES", "APPROVER,FINANCE,ADMIN"
                ).split(",")
                if part.strip()
            ),
        )
