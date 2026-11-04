from __future__ import annotations

import json

import pytest

from app.contracts import SLOT_KEYS
from app.dag import transitive_dependents
from app.llm import LLMError, LLMResult, ToolCall
from app.orchestrator import Forbidden, Orchestrator
from app.tools import visible_tools
from tests.support import MemoryRepository, settings


class ScriptedLLM:
    def __init__(self, results: list[LLMResult] | None = None) -> None:
        self.results = results or []
        self.calls: list[list[dict]] = []

    def complete(self, messages, tools):
        self.calls.append(tools)
        if not self.results:
            raise LLMError("no scripted result")
        return self.results.pop(0)


def tool_result(name: str, arguments: dict, score: float = -0.1) -> LLMResult:
    return LLMResult(
        content="",
        tool_calls=[
            ToolCall(id=f"call-{name}", name=name, arguments_raw=json.dumps(arguments))
        ],
        logprobs=[score],
    )


def build():
    repo = MemoryRepository()
    llm = ScriptedLLM()
    orch = Orchestrator(repo, llm, settings())
    user = {
        "id": "user-1",
        "role": "REQUESTER",
        "email": "requester@example.com",
        "name": "Riley Requester",
        "department": "Engineering",
    }
    return repo, llm, orch, user


def run_tool(orch, llm, conversation_id, user, name, arguments, score=-0.1):
    llm.results.append(tool_result(name, arguments, score))
    return orch.turn(conversation_id, user, f"Please {name.replace('_', ' ')}")


def fill_intake(repo, llm, orch, conversation_id, user):
    values = [
        ("set_vendor", {"value": "Acme"}),
        ("set_category", {"value": "SOFTWARE"}),
        ("set_supplier", {"value": "Acme"}),
        ("set_quantity", {"value": 2}),
        ("set_budget", {"value": 1000}),
        ("set_cost_center", {"value": "CC-SW-200"}),
        ("set_timeline", {"value": "2027-01-15"}),
        ("set_justification", {"value": "Developer tooling for the platform team."}),
    ]
    for name, args in values:
        outcome = run_tool(orch, llm, conversation_id, user, name, args)
        assert "confirm" in outcome.assistant_message.lower()
        outcome = run_tool(orch, llm, conversation_id, user, "confirm_readback", {})
        assert "confirmed" in outcome.assistant_message.lower()
    return outcome


def test_initial_tool_visibility_hides_dependent_slots():
    tools = visible_tools("COLLECTING", {}, None, "hello", "REQUESTER")
    names = [tool.name for tool in tools]
    assert names == ["set_vendor", "set_category"]
    assert "set_supplier" not in names
    assert "set_quantity" not in names


def test_readback_is_required_before_slot_is_filled():
    repo, llm, orch, user = build()
    started = orch.start(user)
    outcome = run_tool(orch, llm, started.conversation_id, user, "set_vendor", {"value": "Acme"})
    assert "pending" not in outcome.assistant_message.lower()
    assert "acme" in outcome.assistant_message.lower()
    assert repo.get_slots(started.conversation_id)["vendor"]["status"] == "PENDING"
    assert repo.drafts == []

    finalize_attempt = run_tool(orch, llm, started.conversation_id, user, "finalize_intake", {})
    assert finalize_attempt.review_id is not None
    assert repo.drafts == []


def test_full_intake_reaches_draft_only_after_confirm_and_guards():
    repo, llm, orch, user = build()
    started = orch.start(user)
    fill_intake(repo, llm, orch, started.conversation_id, user)
    assert repo.get_conversation(started.conversation_id)["state"] == "COMPLETE"
    assert repo.drafts == []

    outcome = run_tool(orch, llm, started.conversation_id, user, "finalize_intake", {})
    assert outcome.request_id is not None
    assert len(repo.drafts) == 1
    assert "draft" in outcome.assistant_message.lower()
    assert "submitted" in outcome.assistant_message.lower()
    assert repo.get_conversation(started.conversation_id)["status"] == "COMPLETE"


def test_malformed_tool_call_is_hard_failure_and_escalates():
    repo, llm, orch, user = build()
    started = orch.start(user)
    llm.results.append(
        LLMResult(
            content="",
            tool_calls=[ToolCall(id="x", name="set_vendor", arguments_raw="{not-json")],
            logprobs=[-0.1],
        )
    )
    outcome = orch.turn(started.conversation_id, user, "Acme")
    assert outcome.review_id is not None
    assert repo.get_conversation(started.conversation_id)["status"] == "HUMAN_REVIEW"
    assert repo.drafts == []
    assert any(event["event_type"] == "MALFORMED_TOOL_CALL" for event in repo.audit)
    assert any(row["kind"] == "MALFORMED" for row in repo.reviews.values())


def test_unapproved_vendor_blocks_auto_accept_and_creates_review():
    repo, llm, orch, user = build()
    started = orch.start(user)
    outcome = run_tool(
        orch, llm, started.conversation_id, user, "set_vendor", {"value": "Blocked"}
    )
    assert outcome.review_id is not None
    assert repo.get_conversation(started.conversation_id)["state"] == "REVIEW"
    assert repo.get_slots(started.conversation_id)["vendor"]["status"] == "PENDING"
    assert repo.drafts == []


def test_rbac_blocks_finalize_for_non_requester_role():
    repo, llm, orch, user = build()
    started = orch.start(user)
    fill_intake(repo, llm, orch, started.conversation_id, user)
    finance = {**user, "role": "FINANCE"}
    llm.results.append(tool_result("finalize_intake", {}))
    with pytest.raises(Forbidden):
        orch.turn(started.conversation_id, finance, "finalize")
    assert repo.drafts == []


def test_correction_invalidates_transitive_dependents():
    dependents = transitive_dependents("vendor")
    assert "supplier" in dependents
    assert "budget" in dependents
    assert "timeline" in dependents
    assert "justification" not in dependents


def test_audit_contains_model_quantization_and_visible_tools():
    repo, llm, orch, user = build()
    started = orch.start(user)
    run_tool(orch, llm, started.conversation_id, user, "set_category", {"value": "SOFTWARE"})
    assert repo.audit
    assert all(event["model"] == "phi4-mini:3.8b" for event in repo.audit)
    assert all(event["quantization"] == "Q4_K_M" for event in repo.audit)
    assert any("visibleTools" in event["payload"] for event in repo.audit)


def test_calibration_thresholds_are_ordered():
    from app.confidence import band_for

    assert band_for(-0.1, -0.35, -1.0) == "HIGH"
    assert band_for(-0.6, -0.35, -1.0) == "MID"
    assert band_for(-1.4, -0.35, -1.0) == "LOW"
