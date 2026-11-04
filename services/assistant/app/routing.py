from __future__ import annotations

from typing import Any


def resolve_routing_path(
    values: dict[str, Any],
    vendor: dict[str, Any] | None,
    policies: list[dict[str, Any]],
) -> dict[str, Any]:
    amount = float(values.get("budget", 0))
    category = str(values.get("category", "")).upper()
    justification = str(values.get("justification", "")).lower()
    risk = (vendor or {}).get("risk_level", "LOW")
    reasons: list[str] = []

    if "sole source" in justification or "sole-source" in justification:
        path = "SOLE_SOURCE_EXCEPTION"
        reasons.append("Justification indicates a sole-source purchase.")
    elif amount >= 50_000 or risk == "HIGH" or (
        category == "SERVICES" and amount >= 25_000
    ):
        path = "LEGAL_REVIEW"
        if amount >= 50_000:
            reasons.append("Amount is at or above $50,000.")
        if risk == "HIGH":
            reasons.append("Vendor risk is HIGH.")
        if category == "SERVICES" and amount >= 25_000:
            reasons.append("Professional services at or above $25,000 require legal review.")
    elif amount >= 25_000 or category in {"IT", "SOFTWARE"} and amount >= 10_000:
        path = "COMPETITIVE_BID"
        reasons.append("Amount or category triggers a competitive bid.")
    else:
        path = "STANDARD_PO"
        reasons.append("Amount and category fit the standard PO path.")

    matched = [
        {
            "name": policy.get("name"),
            "priority": policy.get("priority"),
            "conditions": policy.get("conditions"),
        }
        for policy in policies
        if _policy_matches(policy, values)
    ]

    return {
        "path": path,
        "reasons": reasons,
        "matchedPolicies": matched,
        "requiresHumanReview": path in {"LEGAL_REVIEW", "SOLE_SOURCE_EXCEPTION"},
    }


def _policy_matches(policy: dict[str, Any], values: dict[str, Any]) -> bool:
    conditions = policy.get("conditions") or {}
    min_amount = conditions.get("minAmountCents")
    max_amount = conditions.get("maxAmountCents")
    amount_cents = int(round(float(values.get("budget", 0)) * 100))
    if min_amount is not None and amount_cents < int(min_amount):
        return False
    if max_amount is not None and amount_cents > int(max_amount):
        return False

    categories = conditions.get("categories")
    if categories and str(values.get("category", "")).upper() not in {
        str(category).upper() for category in categories
    }:
        return False

    departments = conditions.get("departments")
    if departments and values.get("department") not in departments:
        return False

    return True


def lookup_policy(
    query: str,
    policies: list[dict[str, Any]],
    values: dict[str, Any],
    vendor: dict[str, Any] | None,
) -> dict[str, Any]:
    query_lower = query.lower()
    matches = []
    for policy in policies:
        haystack = f"{policy.get('name', '')} {policy.get('description', '')}".lower()
        if any(word in haystack for word in query_lower.split() if len(word) > 3):
            matches.append(policy)

    if not matches and values:
        matches = [policy for policy in policies if _policy_matches(policy, values)]

    if not matches:
        return {
            "found": False,
            "message": "No matching policy was found. This question needs finance review.",
            "policies": [],
        }

    return {
        "found": True,
        "policies": [
            {
                "name": policy.get("name"),
                "description": policy.get("description"),
                "conditions": policy.get("conditions"),
                "approvers": policy.get("approvers"),
            }
            for policy in matches
        ],
        "routing": resolve_routing_path(values, vendor, policies) if values else None,
    }
