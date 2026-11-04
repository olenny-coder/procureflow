from __future__ import annotations

from typing import Any

from .contracts import (
    CHECK_SUPPLIER,
    CONFIRM_READBACK,
    FINALIZE_INTAKE,
    LOOKUP_POLICY,
    REJECT_READBACK,
    RESOLVE_ROUTING,
    SETTERS,
    ToolSpec,
    correction_tool,
)
from .dag import available_slots, filled_slots, ready

QUESTION_WORDS = (
    "policy",
    "limit",
    "approved",
    "approval",
    "route",
    "routing",
    "path",
    "bid",
    "legal",
    "spend",
    "threshold",
    "supplier",
    "vendor",
    "?",
)


def _asks_question(message: str) -> bool:
    lower = message.lower()
    return any(word in lower for word in QUESTION_WORDS)


def visible_tools(
    state: str,
    slots: dict[str, dict[str, Any]],
    pending_slot: str | None,
    message: str,
    role: str,
) -> list[ToolSpec]:
    """Compute the only tools the model may see this turn.

    Filled slots, dependency-blocked slots, and non-applicable lookups are never
    passed to the model. This is the primary reliability boundary.
    """
    if state in {"HUMAN_REVIEW", "FAILED", "DONE"}:
        return []

    if state == "READBACK" and pending_slot:
        return [correction_tool([pending_slot]), CONFIRM_READBACK, REJECT_READBACK]

    if ready(slots):
        targets = sorted(filled_slots(slots))
        tools: list[ToolSpec] = []
        if targets:
            tools.append(correction_tool(targets))
        tools.extend([RESOLVE_ROUTING, LOOKUP_POLICY, FINALIZE_INTAKE])
        return tools

    tools = [SETTERS[slot] for slot in available_slots(slots)[:2]]
    lower = message.lower()
    if _asks_question(message):
        tools.append(LOOKUP_POLICY)
    if "vendor" in filled_slots(slots) or any(
        word in lower for word in ("supplier", "vendor", "approved")
    ):
        tools.append(CHECK_SUPPLIER)
    if any(word in lower for word in ("route", "routing", "path", "bid", "legal")):
        tools.append(RESOLVE_ROUTING)

    # Deduplicate while preserving deterministic order.
    by_name = {tool.name: tool for tool in tools}
    return list(by_name.values())


def tool_specs_by_name(tools: list[ToolSpec]) -> dict[str, ToolSpec]:
    return {tool.name: tool for tool in tools}


def setter_slot_for_name(name: str) -> str | None:
    for slot, spec in SETTERS.items():
        if spec.name == name:
            return slot
    return None
