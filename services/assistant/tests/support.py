from __future__ import annotations

from copy import deepcopy
from datetime import datetime, timezone
from typing import Any
from uuid import uuid4

from app.config import Settings


def settings(**overrides: Any) -> Settings:
    base = dict(
        database_url="postgresql://unused",
        internal_token="test-token",
        llm_base_url="http://unused",
        llm_api_key="",
        model_name="phi4-mini:3.8b",
        model_quantization="Q4_K_M",
        high_min_logprob=-0.35,
        mid_min_logprob=-1.0,
        auto_accept_limit_cents=250000,
        max_turns=40,
        llm_timeout_seconds=1,
        review_default_role="ADMIN",
        allow_roles=("REQUESTER", "ADMIN"),
        review_roles=("APPROVER", "FINANCE", "ADMIN"),
    )
    base.update(overrides)
    return Settings(**base)


class MemoryRepository:
    def __init__(self) -> None:
        self.conversations: dict[str, dict[str, Any]] = {}
        self.turns: dict[str, list[dict[str, Any]]] = {}
        self.slots: dict[str, dict[str, dict[str, Any]]] = {}
        self.reviews: dict[str, dict[str, Any]] = {}
        self.audit: list[dict[str, Any]] = []
        self.drafts: list[dict[str, Any]] = []
        self.vendors = {
            "acme": {
                "id": "vendor-acme",
                "name": "Acme",
                "status": "APPROVED",
                "risk_level": "LOW",
            },
            "blocked": {
                "id": "vendor-blocked",
                "name": "Blocked",
                "status": "BLOCKED",
                "risk_level": "HIGH",
            },
        }
        self.policies = [
            {
                "name": "Standard software",
                "description": "Software purchases follow the standard PO path.",
                "priority": 10,
                "conditions": {"maxAmountCents": 2500000},
                "approvers": ["MANAGER", "FINANCE"],
            }
        ]
        self.requester = {
            "id": "user-1",
            "email": "requester@example.com",
            "name": "Riley Requester",
            "role": "REQUESTER",
            "department": "Engineering",
        }

    def create_conversation(self, requester_id: str, model: str, quant: str):
        conversation_id = str(uuid4())
        row = {
            "id": conversation_id,
            "requester_id": requester_id,
            "status": "ACTIVE",
            "state": "COLLECTING",
            "pending_slot": None,
            "routing_path": None,
            "request_id": None,
            "model_name": model,
            "model_quantization": quant,
        }
        self.conversations[conversation_id] = row
        self.turns[conversation_id] = []
        self.slots[conversation_id] = {}
        return row

    def get_conversation(self, conversation_id: str):
        row = self.conversations.get(conversation_id)
        return deepcopy(row) if row else None

    def update_conversation(self, conversation_id: str, **fields: Any):
        self.conversations[conversation_id].update(fields)
        return deepcopy(self.conversations[conversation_id])

    def add_turn(
        self,
        conversation_id: str,
        role: str,
        content: str,
        visible_tools: list[str],
        tool_calls: list[dict[str, Any]],
        confidence: float | None,
        band: str | None,
        model: str,
        quant: str,
    ):
        row = {
            "id": str(uuid4()),
            "conversation_id": conversation_id,
            "turn_index": len(self.turns[conversation_id]) + 1,
            "role": role,
            "content": content,
            "visible_tools": visible_tools,
            "tool_calls": tool_calls,
            "confidence": confidence,
            "band": band,
            "model_name": model,
            "model_quantization": quant,
            "created_at": datetime.now(timezone.utc),
        }
        self.turns[conversation_id].append(row)
        return deepcopy(row)

    def update_turn(self, turn_id: str, content: str) -> None:
        for turns in self.turns.values():
            for turn in turns:
                if turn["id"] == turn_id:
                    turn["content"] = content
                    return

    def list_turns(self, conversation_id: str, limit: int = 20):
        return deepcopy(self.turns[conversation_id][-limit:])

    def get_slots(self, conversation_id: str):
        return deepcopy(self.slots[conversation_id])

    def upsert_slot(
        self,
        conversation_id: str,
        slot_key: str,
        status: str,
        value: Any,
        source_turn_id: str | None,
        confidence: float | None,
        band: str | None,
        guardrail: dict[str, Any],
    ):
        row = {
            "conversation_id": conversation_id,
            "slot_key": slot_key,
            "status": status,
            "value": value,
            "source_turn_id": source_turn_id,
            "confidence": confidence,
            "band": band,
            "guardrail": guardrail,
        }
        self.slots[conversation_id][slot_key] = row
        return deepcopy(row)

    def delete_slot(self, conversation_id: str, slot_key: str) -> None:
        self.slots[conversation_id].pop(slot_key, None)

    def add_review(
        self,
        conversation_id: str,
        requester_id: str,
        turn_id: str | None,
        slot_key: str | None,
        kind: str,
        proposed_value: Any,
        source_snippet: str,
        confidence: float | None,
        band: str | None,
        reason: str,
        assigned_role: str,
    ):
        review_id = str(uuid4())
        row = {
            "id": review_id,
            "conversation_id": conversation_id,
            "requester_id": requester_id,
            "turn_id": turn_id,
            "slot_key": slot_key,
            "kind": kind,
            "proposed_value": proposed_value,
            "source_snippet": source_snippet,
            "confidence": confidence,
            "band": band,
            "escalation_reason": reason,
            "status": "PENDING",
            "assigned_role": assigned_role,
            "reviewer_id": None,
            "final_value": None,
            "decision_note": None,
        }
        self.reviews[review_id] = row
        return deepcopy(row)

    def get_review(self, review_id: str):
        row = self.reviews.get(review_id)
        return deepcopy(row) if row else None

    def list_reviews(self, role: str, status: str = "PENDING"):
        return [
            deepcopy(row)
            for row in self.reviews.values()
            if row["status"] == status
            and (role == "ADMIN" or row["assigned_role"] == role)
        ]

    def update_review(self, review_id: str, **fields: Any):
        self.reviews[review_id].update(fields)
        return deepcopy(self.reviews[review_id])

    def add_audit(self, conversation_id, turn_id, actor_id, event_type, payload, model, quant):
        self.audit.append(
            {
                "conversation_id": conversation_id,
                "turn_id": turn_id,
                "actor_id": actor_id,
                "event_type": event_type,
                "payload": payload,
                "model": model,
                "quantization": quant,
            }
        )

    def find_vendor(self, name: str):
        return deepcopy(self.vendors.get(name.lower()))

    def list_policies(self):
        return deepcopy(self.policies)

    def get_requester(self, user_id: str):
        return deepcopy(self.requester) if user_id == self.requester["id"] else None

    def create_draft_request(self, requester_id, department, values, vendor, routing_path):
        request_id = f"request-{len(self.drafts) + 1}"
        self.drafts.append(
            {
                "id": request_id,
                "requester_id": requester_id,
                "department": department,
                "values": values,
                "vendor": vendor,
                "routing": routing_path,
            }
        )
        return request_id
