from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from .contracts import SLOTS
from .dag import SlotValidationError, normalize_value

CATEGORY_COST_CENTER = {
    "IT": "CC-IT-100",
    "SOFTWARE": "CC-SW-200",
    "SERVICES": "CC-PS-300",
    "OFFICE": "CC-OPS-400",
    "MARKETING": "CC-MKT-500",
    "OTHER": "CC-OPS-400",
}


@dataclass
class GuardrailResult:
    ok: bool
    checks: list[dict[str, Any]] = field(default_factory=list)

    def fail(self, code: str, message: str) -> None:
        self.ok = False
        self.checks.append({"code": code, "ok": False, "message": message})

    def pass_check(self, code: str, message: str) -> None:
        self.checks.append({"code": code, "ok": True, "message": message})

    def to_dict(self) -> dict[str, Any]:
        return {"ok": self.ok, "checks": self.checks}


def check_slot(
    slot: str,
    value: Any,
    repository: Any,
    values: dict[str, Any],
    auto_accept_limit_cents: int,
) -> GuardrailResult:
    result = GuardrailResult(ok=True)

    try:
        normalized = normalize_value(slot, value)
    except SlotValidationError as exc:
        result.fail("FORMAT_INVALID", exc.message)
        return result

    result.pass_check("FORMAT", f"{SLOTS[slot].label} format is valid")

    if slot in {"vendor", "supplier"}:
        vendor = repository.find_vendor(str(normalized))
        if not vendor:
            result.fail(
                "SUPPLIER_NOT_FOUND",
                f"{normalized} is not in the supplier master.",
            )
        elif vendor.get("status") != "APPROVED":
            result.fail(
                "SUPPLIER_NOT_APPROVED",
                f"{vendor.get('name')} is {vendor.get('status')}, not APPROVED.",
            )
        else:
            result.pass_check(
                "SUPPLIER_APPROVED",
                f"{vendor.get('name')} is in the approved supplier master.",
            )
            if vendor.get("risk_level") == "HIGH":
                result.pass_check(
                    "SUPPLIER_HIGH_RISK",
                    "Vendor is approved but high risk; final review will be required.",
                )

    if slot == "budget":
        amount_cents = int(round(float(normalized) * 100))
        if amount_cents > auto_accept_limit_cents:
            result.fail(
                "AMOUNT_OVER_AUTO_ACCEPT_LIMIT",
                f"Amount ${amount_cents / 100:,.2f} exceeds the auto-accept limit of "
                f"${auto_accept_limit_cents / 100:,.2f}.",
            )
        else:
            result.pass_check(
                "AMOUNT_WITHIN_LIMIT",
                "Amount is within the assistant auto-accept limit.",
            )

    if slot == "cost_center":
        category = str(values.get("category", "")).upper()
        expected = CATEGORY_COST_CENTER.get(category)
        if expected and str(normalized).upper() != expected:
            result.fail(
                "COST_CENTER_MISMATCH",
                f"{category} purchases map to {expected}.",
            )
        else:
            result.pass_check("COST_CENTER_MATCH", "Cost center matches the category.")

    return result


def final_guardrails(
    values: dict[str, Any],
    repository: Any,
    auto_accept_limit_cents: int,
    for_human: bool = False,
) -> tuple[GuardrailResult, dict[str, Any] | None]:
    result = GuardrailResult(ok=True)
    vendor = repository.find_vendor(str(values.get("vendor", "")))
    if not vendor:
        result.fail("SUPPLIER_NOT_FOUND", "Vendor is not in the supplier master.")
    elif vendor.get("status") != "APPROVED":
        result.fail(
            "SUPPLIER_NOT_APPROVED",
            f"Vendor status is {vendor.get('status')}; approved status is required.",
        )
    else:
        result.pass_check("SUPPLIER_APPROVED", "Vendor is approved.")
        if vendor.get("risk_level") == "HIGH" and not for_human:
            result.fail(
                "SUPPLIER_HIGH_RISK",
                "High-risk vendor requires legal/finance review.",
            )
        elif vendor.get("risk_level") == "HIGH":
            result.pass_check(
                "SUPPLIER_HIGH_RISK_HUMAN_APPROVED",
                "High-risk vendor is being accepted by a human reviewer.",
            )

    amount_cents = int(round(float(values.get("budget", 0)) * 100))
    if amount_cents > auto_accept_limit_cents and not for_human:
        result.fail(
            "AMOUNT_OVER_AUTO_ACCEPT_LIMIT",
            f"Amount exceeds ${auto_accept_limit_cents / 100:,.2f}; human review required.",
        )
    elif amount_cents > auto_accept_limit_cents:
        result.pass_check(
            "AMOUNT_HUMAN_APPROVED",
            "Amount exceeds the auto-accept limit but is approved by a human reviewer.",
        )
    else:
        result.pass_check("AMOUNT_WITHIN_LIMIT", "Amount is within the auto-accept limit.")

    category = str(values.get("category", "")).upper()
    expected = CATEGORY_COST_CENTER.get(category)
    if not expected:
        result.fail("CATEGORY_UNKNOWN", "No cost-center mapping exists for the category.")
    elif str(values.get("cost_center", "")).upper() != expected:
        result.fail(
            "COST_CENTER_MISMATCH",
            f"{category} must use {expected}.",
        )
    else:
        result.pass_check("COST_CENTER_MATCH", "Cost center matches category.")

    return result, vendor
