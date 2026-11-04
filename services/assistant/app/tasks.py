from __future__ import annotations

from typing import Any

from .contracts import SLOTS
from .guardrails import CATEGORY_COST_CENTER


def run_slot_tasks(
    slot: str,
    value: Any,
    values: dict[str, Any],
    repository: Any,
    auto_accept_limit_cents: int,
    human_approved: bool = False,
) -> list[dict[str, Any]]:
    """Run the deterministic tasks attached to a slot-completion event.

    These are intentionally not LLM tools. They are the server-owned effects
    named in the DAG (`SlotDefinition.on_complete`). Only the final
    `create_requisition` task is a write; it lives in the finalization gate.
    """
    results: list[dict[str, Any]] = []
    for task in SLOTS[slot].on_complete:
        try:
            if task in {"vendor_master_lookup", "supplier_master_check"}:
                vendor = repository.find_vendor(str(value))
                ok = vendor is not None and vendor.get("status") == "APPROVED"
                detail = {
                    "found": bool(vendor),
                    "status": vendor.get("status") if vendor else None,
                }
            elif task == "category_cost_center_resolution":
                expected = CATEGORY_COST_CENTER.get(str(values.get("category", value)).upper())
                ok = expected is not None
                detail = {"expectedCostCenter": expected}
            elif task == "amount_guardrail":
                amount_cents = int(round(float(values.get("budget", value)) * 100))
                ok = amount_cents <= auto_accept_limit_cents or human_approved
                detail = {
                    "amountCents": amount_cents,
                    "limitCents": auto_accept_limit_cents,
                    "humanApproved": human_approved,
                }
            elif task == "cost_center_mapping":
                expected = CATEGORY_COST_CENTER.get(str(values.get("category", "")).upper())
                ok = expected is not None and str(value).upper() == expected
                detail = {"expectedCostCenter": expected}
            else:
                ok = True
                detail = {}
            results.append({"task": task, "ok": ok, "detail": detail})
        except Exception as exc:  # A failed task is a hard stop, never ignored.
            results.append({"task": task, "ok": False, "detail": {"error": str(exc)}})
    return results
