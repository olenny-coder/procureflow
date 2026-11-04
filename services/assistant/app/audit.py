from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from .repository import Repository


@dataclass
class AuditWriter:
    """Single append-only writer for every assistant control-flow decision."""

    repository: Repository
    model_name: str
    model_quantization: str

    def write(
        self,
        *,
        conversation_id: str,
        event_type: str,
        payload: dict[str, Any],
        turn_id: str | None = None,
        actor_id: str | None = None,
    ) -> None:
        self.repository.add_audit(
            conversation_id,
            turn_id,
            actor_id,
            event_type,
            payload,
            self.model_name,
            self.model_quantization,
        )
