from __future__ import annotations

import json

from app.llm import LLMResult, ToolCall
from tests.support import MemoryRepository, settings
from tests.test_orchestrator import build


def text_result(content: str, score: float = -0.1) -> LLMResult:
    return LLMResult(content=content, tool_calls=[], logprobs=[score])


def test_phi_text_tool_call_is_validated_and_applied():
    repo, llm, orch, user = build()
    started = orch.start(user)
    llm.results.append(
        text_result('[{"name":"set_vendor","arguments":{"value":"Acme"}}]')
    )
    outcome = orch.turn(started.conversation_id, user, "Acme")
    assert "heard" in outcome.assistant_message.lower()
    assert repo.get_slots(started.conversation_id)["vendor"]["status"] == "PENDING"
    assert any(event["event_type"] == "TEXT_TOOL_CALL_ADAPTER" for event in repo.audit)


def test_phi_envelope_arguments_are_strictly_unwrapped():
    repo, llm, orch, user = build()
    started = orch.start(user)
    llm.results.append(
        LLMResult(
            content="",
            tool_calls=[
                ToolCall(
                    id="call",
                    name="set_vendor",
                    arguments_raw=json.dumps(
                        {"type": "set_vendor", "parameters": {"value": "Acme"}}
                    ),
                )
            ],
            logprobs=[-0.1],
        )
    )
    outcome = orch.turn(started.conversation_id, user, "Acme")
    assert "heard" in outcome.assistant_message.lower()
    assert repo.get_slots(started.conversation_id)["vendor"]["value"] == "Acme"


def test_no_tool_prose_cannot_claim_a_value_was_recorded():
    repo, llm, orch, user = build()
    started = orch.start(user)
    llm.results.append(
        text_result("Acme has been recorded as the vendor. What category?")
    )
    outcome = orch.turn(started.conversation_id, user, "Acme")
    assert "recorded as the vendor" not in outcome.assistant_message.lower()
    assert "heard" in outcome.assistant_message.lower()
    assert repo.get_slots(started.conversation_id)["vendor"]["status"] == "PENDING"
    assert repo.get_conversation(started.conversation_id)["state"] == "READBACK"
    assert any(
        event["event_type"] == "DETERMINISTIC_SLOT_FALLBACK" for event in repo.audit
    )


def test_explicit_yes_at_readback_confirms_without_a_model_call():
    repo, llm, orch, user = build()
    started = orch.start(user)
    llm.results.append(
        LLMResult(
            content="",
            tool_calls=[
                ToolCall(
                    id="call",
                    name="set_vendor",
                    arguments_raw=json.dumps({"value": "Acme"}),
                )
            ],
            logprobs=[-0.1],
        )
    )
    orch.turn(started.conversation_id, user, "Acme")
    outcome = orch.turn(started.conversation_id, user, "yes")
    assert "confirmed" in outcome.assistant_message.lower()
    assert repo.get_slots(started.conversation_id)["vendor"]["status"] == "FILLED"
