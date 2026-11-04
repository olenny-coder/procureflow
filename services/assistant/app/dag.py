from __future__ import annotations

from datetime import date
from decimal import Decimal, InvalidOperation
from typing import Any

from .contracts import CATEGORIES, SLOT_DEFINITIONS, SLOTS


class SlotValidationError(ValueError):
    def __init__(self, slot: str, message: str) -> None:
        super().__init__(f"{slot}: {message}")
        self.slot = slot
        self.message = message


def normalize_value(slot: str, raw: Any) -> Any:
    definition = SLOTS[slot]
    if raw is None:
        raise SlotValidationError(slot, "a value is required")

    if definition.value_type == "category":
        normalized = str(raw).strip().upper()
        if normalized not in CATEGORIES:
            raise SlotValidationError(slot, f"choose one of {', '.join(CATEGORIES)}")
        return normalized

    if definition.value_type == "integer":
        try:
            value = int(raw)
        except (TypeError, ValueError) as exc:
            raise SlotValidationError(slot, "enter a whole number") from exc
        if value < 1 or value > 100_000:
            raise SlotValidationError(slot, "quantity must be between 1 and 100,000")
        return value

    if definition.value_type == "number":
        try:
            value = Decimal(str(raw))
        except (InvalidOperation, TypeError, ValueError) as exc:
            raise SlotValidationError(slot, "enter a valid USD amount") from exc
        if value <= 0 or value > Decimal("100000000"):
            raise SlotValidationError(slot, "amount must be greater than zero")
        return float(value)

    if definition.value_type == "date":
        try:
            parsed = date.fromisoformat(str(raw))
        except ValueError as exc:
            raise SlotValidationError(slot, "use YYYY-MM-DD") from exc
        if parsed < date.today():
            raise SlotValidationError(slot, "the delivery date cannot be in the past")
        return parsed.isoformat()

    text = str(raw).strip()
    if definition.value_type == "cost_center":
        if not text.startswith("CC-") or len(text) < 8 or len(text) > 40:
            raise SlotValidationError(slot, "use a cost center like CC-IT-100")
        return text.upper()

    if definition.value_type == "text":
        if len(text) < 10:
            raise SlotValidationError(slot, "provide at least 10 characters")
        return text[:2000]

    if len(text) < 2:
        raise SlotValidationError(slot, "provide at least 2 characters")
    return text[:200]


def slot_states(rows: dict[str, dict[str, Any]]) -> dict[str, str]:
    return {key: row.get("status", "MISSING") for key, row in rows.items()}


def filled_slots(rows: dict[str, dict[str, Any]]) -> set[str]:
    return {key for key, row in rows.items() if row.get("status") == "FILLED"}


def dependencies_met(slot: str, rows: dict[str, dict[str, Any]]) -> bool:
    definition = SLOTS[slot]
    filled = filled_slots(rows)
    return all(dependency in filled for dependency in definition.depends_on)


def available_slots(rows: dict[str, dict[str, Any]]) -> list[str]:
    filled = filled_slots(rows)
    pending = {
        key
        for key, row in rows.items()
        if row.get("status") == "PENDING"
    }
    result: list[str] = []
    for definition in SLOT_DEFINITIONS:
        if definition.key in filled or definition.key in pending:
            continue
        if all(dependency in filled for dependency in definition.depends_on):
            result.append(definition.key)
    return result


def blocked_slots(rows: dict[str, dict[str, Any]]) -> list[str]:
    filled = filled_slots(rows)
    available = set(available_slots(rows))
    result = []
    for definition in SLOT_DEFINITIONS:
        if definition.key in filled or definition.key in available:
            continue
        if any(dependency not in filled for dependency in definition.depends_on):
            result.append(definition.key)
    return result


def ready(rows: dict[str, dict[str, Any]]) -> bool:
    return all(
        rows.get(definition.key, {}).get("status") == "FILLED"
        for definition in SLOT_DEFINITIONS
    )


def dependents(slot: str) -> list[str]:
    return [
        definition.key
        for definition in SLOT_DEFINITIONS
        if slot in definition.depends_on
    ]


def transitive_dependents(slot: str) -> set[str]:
    result: set[str] = set()
    queue = [slot]
    while queue:
        current = queue.pop()
        for dependent in dependents(current):
            if dependent not in result:
                result.add(dependent)
                queue.append(dependent)
    return result


def value_text(slot: str, value: Any) -> str:
    if slot == "budget":
        return f"${float(value):,.2f}"
    if slot == "timeline":
        return str(value)
    return str(value)


def next_question(rows: dict[str, dict[str, Any]]) -> str:
    available = available_slots(rows)
    if not available:
        return "Your intake is complete. Say finalize when you are ready for me to prepare the draft."
    slot = available[0]
    return SLOTS[slot].question


def correction_targets(rows: dict[str, dict[str, Any]]) -> list[str]:
    return [
        definition.key
        for definition in SLOT_DEFINITIONS
        if rows.get(definition.key, {}).get("status") in {"PENDING", "FILLED"}
    ]


def readback_message(slot: str, value: Any) -> str:
    return (
        f"I heard **{SLOTS[slot].label}: {value_text(slot, value)}**. "
        "Is that correct? I can correct it, or you can confirm."
    )
