from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from pydantic import BaseModel, Field

CATEGORIES = ("IT", "SOFTWARE", "SERVICES", "OFFICE", "MARKETING", "OTHER")


@dataclass(frozen=True)
class SlotDefinition:
    key: str
    label: str
    question: str
    depends_on: tuple[str, ...]
    value_type: str
    on_complete: tuple[str, ...] = ()


# The intake DAG is data. Add/remove a slot here and tool visibility,
# validation, and readiness change together.
SLOT_DEFINITIONS: tuple[SlotDefinition, ...] = (
    SlotDefinition(
        "vendor",
        "Vendor",
        "Which vendor or supplier are you buying from?",
        (),
        "string",
        ("vendor_master_lookup",),
    ),
    SlotDefinition(
        "category",
        "Category",
        "What category is this purchase? Options: IT, SOFTWARE, SERVICES, OFFICE, MARKETING, OTHER.",
        (),
        "category",
        ("category_cost_center_resolution",),
    ),
    SlotDefinition(
        "supplier",
        "Supplier record",
        "Which approved supplier record should this purchase use?",
        ("vendor",),
        "string",
        ("supplier_master_check",),
    ),
    SlotDefinition(
        "quantity",
        "Quantity",
        "How many units do you need?",
        ("category",),
        "integer",
        ("quantity_normalization",),
    ),
    SlotDefinition(
        "budget",
        "Budget",
        "What is the total budget in USD?",
        ("quantity", "supplier"),
        "number",
        ("amount_guardrail",),
    ),
    SlotDefinition(
        "cost_center",
        "Cost center",
        "Which cost center should absorb this purchase?",
        ("category",),
        "cost_center",
        ("cost_center_mapping",),
    ),
    SlotDefinition(
        "timeline",
        "Timeline",
        "When do you need this delivered? Use YYYY-MM-DD.",
        ("supplier",),
        "date",
        ("lead_time_input",),
    ),
    SlotDefinition(
        "justification",
        "Justification",
        "What business outcome does this purchase support?",
        ("category",),
        "text",
        ("routing_inputs_ready",),
    ),
)

SLOTS = {slot.key: slot for slot in SLOT_DEFINITIONS}
SLOT_KEYS = tuple(SLOTS)


class SetValueArgs(BaseModel):
    value: str | int | float


class SetCategoryArgs(BaseModel):
    value: str


class SetQuantityArgs(BaseModel):
    value: int = Field(ge=1, le=100_000)


class SetBudgetArgs(BaseModel):
    value: float = Field(gt=0, le=100_000_000)


class CorrectValueArgs(BaseModel):
    slot: str
    value: str | int | float


class LookupPolicyArgs(BaseModel):
    query: str = Field(min_length=1, max_length=500)


class CheckSupplierArgs(BaseModel):
    vendor: str = Field(min_length=1, max_length=200)


class EmptyArgs(BaseModel):
    pass


@dataclass(frozen=True)
class ToolSpec:
    name: str
    description: str
    parameters: dict[str, Any]
    model: type[BaseModel]

    def to_openai(self) -> dict[str, Any]:
        return {
            "type": "function",
            "function": {
                "name": self.name,
                "description": self.description,
                "parameters": self.parameters,
                "strict": True,
            },
        }


def _object(properties: dict[str, Any], required: list[str] | None = None) -> dict[str, Any]:
    return {
        "type": "object",
        "properties": properties,
        "required": required or [],
        "additionalProperties": False,
    }


SETTERS: dict[str, ToolSpec] = {
    "vendor": ToolSpec(
        "set_vendor",
        "Record the vendor name. The value is pending until the requester confirms the readback.",
        _object({"value": {"type": "string", "minLength": 2, "maxLength": 200}}, ["value"]),
        SetValueArgs,
    ),
    "category": ToolSpec(
        "set_category",
        "Record the procurement category. The value is pending until the requester confirms the readback.",
        _object({"value": {"type": "string", "enum": list(CATEGORIES)}}, ["value"]),
        SetCategoryArgs,
    ),
    "supplier": ToolSpec(
        "set_supplier",
        "Record the approved supplier name. The value is pending until the requester confirms the readback.",
        _object({"value": {"type": "string", "minLength": 2, "maxLength": 200}}, ["value"]),
        SetValueArgs,
    ),
    "quantity": ToolSpec(
        "set_quantity",
        "Record the requested quantity. The value is pending until the requester confirms the readback.",
        _object(
            {"value": {"type": "integer", "minimum": 1, "maximum": 100000}},
            ["value"],
        ),
        SetQuantityArgs,
    ),
    "budget": ToolSpec(
        "set_budget",
        "Record the total budget in USD. The value is pending until the requester confirms the readback.",
        _object(
            {"value": {"type": "number", "exclusiveMinimum": 0, "maximum": 100000000}},
            ["value"],
        ),
        SetBudgetArgs,
    ),
    "cost_center": ToolSpec(
        "set_cost_center",
        "Record the cost center code. The value is pending until the requester confirms the readback.",
        _object({"value": {"type": "string", "minLength": 3, "maxLength": 40}}, ["value"]),
        SetValueArgs,
    ),
    "timeline": ToolSpec(
        "set_timeline",
        "Record the required delivery date in YYYY-MM-DD. The value is pending until the requester confirms the readback.",
        _object({"value": {"type": "string", "format": "date"}}, ["value"]),
        SetValueArgs,
    ),
    "justification": ToolSpec(
        "set_justification",
        "Record the business justification. The value is pending until the requester confirms the readback.",
        _object({"value": {"type": "string", "minLength": 10, "maxLength": 2000}}, ["value"]),
        SetValueArgs,
    ),
}

LOOKUP_POLICY = ToolSpec(
    "lookup_policy",
    "Look up a procurement policy fact. Never answer policy questions from memory.",
    _object({"query": {"type": "string", "minLength": 1, "maxLength": 500}}, ["query"]),
    LookupPolicyArgs,
)

CHECK_SUPPLIER = ToolSpec(
    "check_supplier",
    "Check whether a vendor exists in the approved supplier master and return its status.",
    _object({"vendor": {"type": "string", "minLength": 1, "maxLength": 200}}, ["vendor"]),
    CheckSupplierArgs,
)

RESOLVE_ROUTING = ToolSpec(
    "resolve_routing_path",
    "Compute the purchasing route from the confirmed slot values and current policy data.",
    _object({}),
    EmptyArgs,
)

CONFIRM_READBACK = ToolSpec(
    "confirm_readback",
    "Confirm the pending value after the requester has seen the readback.",
    _object({}),
    EmptyArgs,
)

REJECT_READBACK = ToolSpec(
    "reject_readback",
    "Reject the pending value and return to collection.",
    _object({}),
    EmptyArgs,
)

FINALIZE_INTAKE = ToolSpec(
    "finalize_intake",
    "Create a draft requisition only after all slots are confirmed and all guardrails pass.",
    _object({}),
    EmptyArgs,
)


def correction_tool(slot_keys: list[str]) -> ToolSpec:
    enum = slot_keys or list(SLOT_KEYS)
    return ToolSpec(
        "correct_value",
        "Correct one inline value that the requester is reviewing. Use only for the listed slots.",
        _object(
            {
                "slot": {"type": "string", "enum": enum},
                "value": {"type": ["string", "number", "integer"]},
            },
            ["slot", "value"],
        ),
        CorrectValueArgs,
    )


ALL_TOOLS: dict[str, ToolSpec] = {
    **{spec.name: spec for spec in SETTERS.values()},
    LOOKUP_POLICY.name: LOOKUP_POLICY,
    CHECK_SUPPLIER.name: CHECK_SUPPLIER,
    RESOLVE_ROUTING.name: RESOLVE_ROUTING,
    CONFIRM_READBACK.name: CONFIRM_READBACK,
    REJECT_READBACK.name: REJECT_READBACK,
    FINALIZE_INTAKE.name: FINALIZE_INTAKE,
}
