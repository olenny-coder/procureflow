from __future__ import annotations

from typing import Any

from .config import Settings
from .contracts import SLOTS
from .dag import normalize_value
from .guardrails import final_guardrails
from .repository import Repository
from .routing import resolve_routing_path


class ReviewError(RuntimeError):
    pass


class ReviewService:
    def __init__(self, repository: Repository, settings: Settings) -> None:
        self.repo = repository
        self.settings = settings

    def list_reviews(self, role: str, status: str = "PENDING") -> list[dict[str, Any]]:
        if role.upper() not in self.settings.review_roles:
            raise ReviewError("Your role cannot review assistant escalations.")
        return self.repo.list_reviews(role, status)

    def decide(
        self,
        review_id: str,
        reviewer: dict[str, Any],
        decision: str,
        value: Any = None,
        note: str = "",
    ) -> dict[str, Any]:
        review = self.repo.get_review(review_id)
        if not review:
            raise ReviewError("Review item not found.")
        if review["status"] != "PENDING":
            raise ReviewError("This review item has already been decided.")
        if reviewer["role"].upper() != review["assigned_role"] and reviewer["role"].upper() != "ADMIN":
            raise ReviewError("This review item is outside your RBAC scope.")

        decision = decision.upper()
        if decision not in {"APPROVE", "REJECT", "EDIT"}:
            raise ReviewError("Decision must be APPROVE, REJECT, or EDIT.")
        if review["kind"] == "MALFORMED" and decision != "REJECT":
            raise ReviewError("Malformed model output can only be rejected.")

        final_value = value if decision == "EDIT" else review["proposed_value"]
        if decision == "APPROVE":
            final_value = review["proposed_value"]
        if decision == "REJECT":
            return self._reject(review, reviewer, note)
        return self._approve(review, reviewer, final_value, decision, note)

    def _reject(
        self,
        review: dict[str, Any],
        reviewer: dict[str, Any],
        note: str,
    ) -> dict[str, Any]:
        conversation_id = str(review["conversation_id"])
        updated = self.repo.update_review(
            str(review["id"]),
            status="REJECTED",
            reviewer_id=reviewer["id"],
            decision_note=note,
            decided_at=True,
        )
        if review.get("slot_key") and review["kind"] == "SLOT":
            self.repo.delete_slot(conversation_id, review["slot_key"])
            self.repo.update_conversation(
                conversation_id,
                status="ACTIVE",
                state="COLLECTING",
                pending_slot=None,
            )
        elif review["kind"] in {"FINALIZE", "MALFORMED"}:
            self.repo.update_conversation(
                conversation_id, status="ACTIVE", state="COLLECTING", pending_slot=None
            )
        self.repo.add_audit(
            conversation_id,
            str(review.get("turn_id") or "") or None,
            reviewer["id"],
            "HUMAN_DECISION",
            {
                "reviewId": str(review["id"]),
                "decision": "REJECT",
                "note": note,
                "kind": review["kind"],
                "slot": review.get("slot_key"),
            },
            self.settings.model_name,
            self.settings.model_quantization,
        )
        return {"review": updated, "status": "REJECTED"}

    def _approve(
        self,
        review: dict[str, Any],
        reviewer: dict[str, Any],
        final_value: Any,
        decision: str,
        note: str,
    ) -> dict[str, Any]:
        conversation_id = str(review["conversation_id"])
        conversation = self.repo.get_conversation(conversation_id)
        if not conversation:
            raise ReviewError("Conversation not found.")

        if review["kind"] == "SLOT":
            slot = review["slot_key"]
            if slot not in SLOTS:
                raise ReviewError("Unknown slot on review item.")
            try:
                normalized = normalize_value(slot, final_value)
            except Exception as exc:
                raise ReviewError(f"The reviewed value is invalid: {exc}") from exc
            guardrail = {
                "ok": True,
                "checks": [
                    {
                        "code": "HUMAN_APPROVED",
                        "ok": True,
                        "message": f"Approved by {reviewer['role']}.",
                    }
                ],
            }
            self.repo.upsert_slot(
                conversation_id,
                slot,
                "PENDING",
                normalized,
                review.get("turn_id"),
                review.get("confidence"),
                "HUMAN",
                guardrail,
            )
            self.repo.update_conversation(
                conversation_id,
                status="ACTIVE",
                state="READBACK",
                pending_slot=slot,
            )
            status = "APPROVED"
        elif review["kind"] == "FINALIZE":
            proposed = final_value or {}
            values = proposed.get("values", proposed)
            guardrails, vendor = final_guardrails(
                values,
                self.repo,
                self.settings.auto_accept_limit_cents,
                for_human=True,
            )
            if not guardrails.ok or vendor is None:
                raise ReviewError(
                    "Guardrails still fail after human review: "
                    + "; ".join(
                        check["message"] for check in guardrails.checks if not check["ok"]
                    )
                )
            routing = resolve_routing_path(values, vendor, self.repo.list_policies())
            requester = self.repo.get_requester(str(review["requester_id"]))
            if not requester:
                raise ReviewError("Requester is no longer active.")
            if requester["role"].upper() not in self.settings.allow_roles:
                raise ReviewError("Requester is no longer permitted to create a requisition.")
            request_id = self.repo.create_draft_request(
                str(review["requester_id"]),
                requester["department"],
                values,
                vendor,
                routing["path"],
            )
            self.repo.update_conversation(
                conversation_id,
                status="COMPLETE",
                state="DONE",
                pending_slot=None,
                routing_path=routing["path"],
                request_id=request_id,
            )
            status = "APPROVED"
            self.repo.add_audit(
                conversation_id,
                str(review.get("turn_id") or "") or None,
                reviewer["id"],
                "FINAL_WRITE",
                {
                    "reviewId": str(review["id"]),
                    "requestId": request_id,
                    "values": values,
                    "routing": routing,
                    "guardrails": guardrails.to_dict(),
                },
                self.settings.model_name,
                self.settings.model_quantization,
            )
        elif review["kind"] in {"POLICY", "SUPPLIER"}:
            # Informational lookup escalation: acknowledge, but never write a
            # procurement value or change the conversation state.
            status = "APPROVED"
        else:
            raise ReviewError("Unsupported review kind.")

        updated = self.repo.update_review(
            str(review["id"]),
            status="EDITED" if decision == "EDIT" else "APPROVED",
            reviewer_id=reviewer["id"],
            final_value=final_value,
            decision_note=note,
            decided_at=True,
        )
        self.repo.add_audit(
            conversation_id,
            str(review.get("turn_id") or "") or None,
            reviewer["id"],
            "HUMAN_DECISION",
            {
                "reviewId": str(review["id"]),
                "decision": decision,
                "finalValue": final_value,
                "note": note,
                "kind": review["kind"],
                "slot": review.get("slot_key"),
            },
            self.settings.model_name,
            self.settings.model_quantization,
        )
        return {"review": updated, "status": status}
