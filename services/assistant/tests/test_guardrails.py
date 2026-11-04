from __future__ import annotations

from app.llm import LLMResult
from app.orchestrator import Orchestrator
from app.reviews import ReviewService
from tests.support import MemoryRepository, settings
from tests.test_orchestrator import build, run_tool, tool_result


def seed_complete(repo: MemoryRepository, conversation_id: str, budget: float = 5000):
    values = {
        "vendor": "Acme",
        "category": "SOFTWARE",
        "supplier": "Acme",
        "quantity": 2,
        "budget": budget,
        "cost_center": "CC-SW-200",
        "timeline": "2027-01-15",
        "justification": "Developer tooling for the platform team.",
    }
    for slot, value in values.items():
        repo.upsert_slot(
            conversation_id,
            slot,
            "FILLED",
            value,
            None,
            -0.1,
            "HIGH",
            {"ok": True, "checks": []},
        )


def test_over_limit_finalization_requires_human_and_creates_no_draft():
    repo, llm, orch, user = build()
    started = orch.start(user)
    seed_complete(repo, started.conversation_id, budget=5000)
    llm.results.append(tool_result("finalize_intake", {}))
    outcome = orch.turn(started.conversation_id, user, "finalize")
    assert outcome.review_id is not None
    assert repo.drafts == []
    review = repo.get_review(outcome.review_id)
    assert review["kind"] == "FINALIZE"
    assert "Amount exceeds" in review["escalation_reason"]


def test_human_finalization_approval_writes_draft_after_guardrails():
    repo, llm, orch, user = build()
    started = orch.start(user)
    seed_complete(repo, started.conversation_id, budget=5000)
    llm.results.append(tool_result("finalize_intake", {}))
    outcome = orch.turn(started.conversation_id, user, "finalize")
    assert repo.drafts == []

    admin = {
        "id": "user-admin",
        "role": "ADMIN",
        "email": "admin@example.com",
        "name": "Alex Admin",
        "department": "Finance",
    }
    result = ReviewService(repo, settings()).decide(
        outcome.review_id, admin, "APPROVE", note="Budget owner approved"
    )
    assert result["status"] == "APPROVED"
    assert len(repo.drafts) == 1
    assert repo.get_conversation(started.conversation_id)["status"] == "COMPLETE"


def test_finalize_without_all_slots_is_malformed_and_writes_nothing():
    repo, llm, orch, user = build()
    started = orch.start(user)
    llm.results.append(tool_result("finalize_intake", {}))
    outcome = orch.turn(started.conversation_id, user, "finalize")
    assert outcome.review_id is not None
    assert repo.drafts == []
    assert repo.get_conversation(started.conversation_id)["status"] == "HUMAN_REVIEW"
