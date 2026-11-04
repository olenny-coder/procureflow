from __future__ import annotations

from contextlib import contextmanager
from typing import Any, Iterator, Protocol

import psycopg
from psycopg.rows import dict_row
from psycopg.types.json import Jsonb


class Repository(Protocol):
    def create_conversation(self, requester_id: str, model: str, quant: str) -> dict[str, Any]: ...
    def get_conversation(self, conversation_id: str) -> dict[str, Any] | None: ...
    def update_conversation(self, conversation_id: str, **fields: Any) -> dict[str, Any]: ...
    def add_turn(self, conversation_id: str, role: str, content: str, visible_tools: list[str], tool_calls: list[dict[str, Any]], confidence: float | None, band: str | None, model: str, quant: str) -> dict[str, Any]: ...
    def update_turn(self, turn_id: str, content: str) -> None: ...
    def list_turns(self, conversation_id: str, limit: int = 20) -> list[dict[str, Any]]: ...
    def get_slots(self, conversation_id: str) -> dict[str, dict[str, Any]]: ...
    def upsert_slot(self, conversation_id: str, slot_key: str, status: str, value: Any, source_turn_id: str | None, confidence: float | None, band: str | None, guardrail: dict[str, Any]) -> dict[str, Any]: ...
    def delete_slot(self, conversation_id: str, slot_key: str) -> None: ...
    def add_review(self, conversation_id: str, requester_id: str, turn_id: str | None, slot_key: str | None, kind: str, proposed_value: Any, source_snippet: str, confidence: float | None, band: str | None, reason: str, assigned_role: str) -> dict[str, Any]: ...
    def get_review(self, review_id: str) -> dict[str, Any] | None: ...
    def list_reviews(self, role: str, status: str = "PENDING") -> list[dict[str, Any]]: ...
    def update_review(self, review_id: str, **fields: Any) -> dict[str, Any]: ...
    def add_audit(self, conversation_id: str, turn_id: str | None, actor_id: str | None, event_type: str, payload: dict[str, Any], model: str, quant: str) -> None: ...
    def find_vendor(self, name: str) -> dict[str, Any] | None: ...
    def list_policies(self) -> list[dict[str, Any]]: ...
    def get_requester(self, user_id: str) -> dict[str, Any] | None: ...
    def create_draft_request(self, requester_id: str, department: str, values: dict[str, Any], vendor: dict[str, Any], routing_path: str) -> str: ...


class PostgresRepository:
    def __init__(self, database_url: str) -> None:
        self.database_url = database_url

    @contextmanager
    def _connect(self) -> Iterator[psycopg.Connection]:
        with psycopg.connect(self.database_url, row_factory=dict_row) as connection:
            yield connection

    def _one(self, query: str, params: tuple[Any, ...]) -> dict[str, Any] | None:
        with self._connect() as connection:
            with connection.cursor() as cursor:
                cursor.execute(query, params)
                return cursor.fetchone()

    def _all(self, query: str, params: tuple[Any, ...] = ()) -> list[dict[str, Any]]:
        with self._connect() as connection:
            with connection.cursor() as cursor:
                cursor.execute(query, params)
                return list(cursor.fetchall())

    def create_conversation(self, requester_id: str, model: str, quant: str) -> dict[str, Any]:
        row = self._one(
            """
            INSERT INTO assistant_conversations (requester_id, model_name, model_quantization)
            VALUES (%s, %s, %s)
            RETURNING *
            """,
            (requester_id, model, quant),
        )
        assert row is not None
        return row

    def get_conversation(self, conversation_id: str) -> dict[str, Any] | None:
        return self._one(
            "SELECT * FROM assistant_conversations WHERE id = %s",
            (conversation_id,),
        )

    def update_conversation(self, conversation_id: str, **fields: Any) -> dict[str, Any]:
        allowed = {
            "status",
            "state",
            "pending_slot",
            "routing_path",
            "request_id",
            "updated_at",
        }
        values = {key: value for key, value in fields.items() if key in allowed}
        values["updated_at"] = "now()"
        assignments = []
        params: list[Any] = []
        for key, value in values.items():
            if key == "updated_at":
                assignments.append("updated_at = now()")
            else:
                assignments.append(f"{key} = %s")
                params.append(value)
        params.append(conversation_id)
        row = self._one(
            f"UPDATE assistant_conversations SET {', '.join(assignments)} WHERE id = %s RETURNING *",
            tuple(params),
        )
        assert row is not None
        return row

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
    ) -> dict[str, Any]:
        row = self._one(
            """
            INSERT INTO assistant_turns
              (conversation_id, turn_index, role, content, visible_tools, tool_calls, confidence, band, model_name, model_quantization)
            SELECT %s, COALESCE(MAX(turn_index), 0) + 1, %s, %s, %s, %s, %s, %s, %s, %s
            FROM assistant_turns WHERE conversation_id = %s
            RETURNING *
            """,
            (
                conversation_id,
                role,
                content,
                Jsonb(visible_tools),
                Jsonb(tool_calls),
                confidence,
                band,
                model,
                quant,
                conversation_id,
            ),
        )
        assert row is not None
        return row

    def update_turn(self, turn_id: str, content: str) -> None:
        with self._connect() as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    "UPDATE assistant_turns SET content = %s WHERE id = %s",
                    (content, turn_id),
                )

    def list_turns(self, conversation_id: str, limit: int = 20) -> list[dict[str, Any]]:
        rows = self._all(
            """
            SELECT * FROM (
              SELECT * FROM assistant_turns
              WHERE conversation_id = %s
              ORDER BY turn_index DESC
              LIMIT %s
            ) recent ORDER BY turn_index ASC
            """,
            (conversation_id, limit),
        )
        return rows

    def get_slots(self, conversation_id: str) -> dict[str, dict[str, Any]]:
        rows = self._all(
            "SELECT * FROM assistant_slot_values WHERE conversation_id = %s",
            (conversation_id,),
        )
        return {row["slot_key"]: row for row in rows}

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
    ) -> dict[str, Any]:
        row = self._one(
            """
            INSERT INTO assistant_slot_values
              (conversation_id, slot_key, status, value, source_turn_id, confidence, band, guardrail, confirmed_at)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, CASE WHEN %s = 'FILLED' THEN now() ELSE NULL END)
            ON CONFLICT (conversation_id, slot_key) DO UPDATE SET
              status = EXCLUDED.status,
              value = EXCLUDED.value,
              source_turn_id = EXCLUDED.source_turn_id,
              confidence = EXCLUDED.confidence,
              band = EXCLUDED.band,
              guardrail = EXCLUDED.guardrail,
              confirmed_at = EXCLUDED.confirmed_at,
              updated_at = now()
            RETURNING *
            """,
            (
                conversation_id,
                slot_key,
                status,
                Jsonb(value),
                source_turn_id,
                confidence,
                band,
                Jsonb(guardrail),
                status,
            ),
        )
        assert row is not None
        return row

    def delete_slot(self, conversation_id: str, slot_key: str) -> None:
        with self._connect() as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    "DELETE FROM assistant_slot_values WHERE conversation_id = %s AND slot_key = %s",
                    (conversation_id, slot_key),
                )

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
    ) -> dict[str, Any]:
        row = self._one(
            """
            INSERT INTO assistant_reviews
              (conversation_id, requester_id, turn_id, slot_key, kind, proposed_value, source_snippet, confidence, band, escalation_reason, assigned_role)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            RETURNING *
            """,
            (
                conversation_id,
                requester_id,
                turn_id,
                slot_key,
                kind,
                Jsonb(proposed_value),
                source_snippet,
                confidence,
                band,
                reason,
                assigned_role,
            ),
        )
        assert row is not None
        return row

    def get_review(self, review_id: str) -> dict[str, Any] | None:
        return self._one("SELECT * FROM assistant_reviews WHERE id = %s", (review_id,))

    def list_reviews(self, role: str, status: str = "PENDING") -> list[dict[str, Any]]:
        if role.upper() == "ADMIN":
            return self._all(
                "SELECT * FROM assistant_reviews WHERE status = %s ORDER BY created_at ASC",
                (status,),
            )
        return self._all(
            "SELECT * FROM assistant_reviews WHERE status = %s AND assigned_role = %s ORDER BY created_at ASC",
            (status, role.upper()),
        )

    def update_review(self, review_id: str, **fields: Any) -> dict[str, Any]:
        allowed = {
            "status",
            "reviewer_id",
            "final_value",
            "decision_note",
            "decided_at",
        }
        values = {key: value for key, value in fields.items() if key in allowed}
        assignments = []
        params: list[Any] = []
        for key, value in values.items():
            if key == "decided_at":
                assignments.append("decided_at = now()")
            elif key == "final_value":
                assignments.append("final_value = %s")
                params.append(Jsonb(value))
            else:
                assignments.append(f"{key} = %s")
                params.append(value)
        params.append(review_id)
        row = self._one(
            f"UPDATE assistant_reviews SET {', '.join(assignments)} WHERE id = %s RETURNING *",
            tuple(params),
        )
        assert row is not None
        return row

    def add_audit(
        self,
        conversation_id: str,
        turn_id: str | None,
        actor_id: str | None,
        event_type: str,
        payload: dict[str, Any],
        model: str,
        quant: str,
    ) -> None:
        with self._connect() as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    INSERT INTO assistant_audit_events
                      (conversation_id, turn_id, actor_id, event_type, payload, model_name, model_quantization)
                    VALUES (%s, %s, %s, %s, %s, %s, %s)
                    """,
                    (
                        conversation_id,
                        turn_id,
                        actor_id,
                        event_type,
                        Jsonb(payload),
                        model,
                        quant,
                    ),
                )

    def find_vendor(self, name: str) -> dict[str, Any] | None:
        return self._one(
            """
            SELECT * FROM vendors
            WHERE lower(name) = lower(%s)
            ORDER BY CASE WHEN status = 'APPROVED' THEN 0 ELSE 1 END, created_at ASC
            LIMIT 1
            """,
            (name.strip(),),
        )

    def list_policies(self) -> list[dict[str, Any]]:
        return self._all(
            "SELECT * FROM policies WHERE enabled = true ORDER BY priority ASC"
        )

    def get_requester(self, user_id: str) -> dict[str, Any] | None:
        return self._one(
            "SELECT id, email, name, role, department FROM users WHERE id = %s AND active = true",
            (user_id,),
        )

    def list_audit(
        self, conversation_id: str | None = None, limit: int = 200
    ) -> list[dict[str, Any]]:
        if conversation_id:
            return self._all(
                """
                SELECT * FROM assistant_audit_events
                WHERE conversation_id = %s
                ORDER BY created_at ASC
                LIMIT %s
                """,
                (conversation_id, limit),
            )
        return self._all(
            "SELECT * FROM assistant_audit_events ORDER BY created_at DESC LIMIT %s",
            (limit,),
        )

    def create_draft_request(
        self,
        requester_id: str,
        department: str,
        values: dict[str, Any],
        vendor: dict[str, Any],
        routing_path: str,
    ) -> str:
        budget = float(values["budget"])
        total_cents = int(round(budget * 100))
        quantity = int(values["quantity"])
        unit_cents = max(1, total_cents // max(quantity, 1))
        title = f"{values['category'].title()} purchase from {values['vendor']}"
        with self._connect() as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    INSERT INTO purchase_requests
                      (requester_id, department, title, justification, urgency, category, vendor_id, total_amount_cents, status, current_step)
                    VALUES (%s, %s, %s, %s, 'NORMAL', %s, %s, %s, 'DRAFT', 0)
                    RETURNING id
                    """,
                    (
                        requester_id,
                        department,
                        title,
                        values["justification"],
                        values["category"],
                        vendor["id"],
                        total_cents,
                    ),
                )
                request_id = cursor.fetchone()["id"]
                cursor.execute(
                    """
                    INSERT INTO purchase_request_items
                      (request_id, description, quantity, unit_price_cents, total_price_cents)
                    VALUES (%s, %s, %s, %s, %s)
                    """,
                    (
                        request_id,
                        f"{values['category'].title()} - {values['justification'][:160]}",
                        quantity,
                        unit_cents,
                        total_cents,
                    ),
                )
                return str(request_id)
