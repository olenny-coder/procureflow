from __future__ import annotations

import pytest

from app.reviews import ReviewError, ReviewService
from tests.support import MemoryRepository, settings
from tests.test_orchestrator import build, run_tool

def test_low_confidence_slot_goes_to_review_and_reviewer_approves():
    repo, llm, orch, user = build()
    started = orch.start(user)
    outcome = run_tool(
        orch,
        llm,
        started.conversation_id,
        user,
        "set_vendor",
        {"value": "Acme"},
        score=-1.5,
    )
    assert outcome.review_id is not None
    assert repo.get_conversation(started.conversation_id)["status"] == "HUMAN_REVIEW"
    review = repo.get_review(outcome.review_id)
    assert review["assigned_role"] == "APPROVER"

    approver = {
        "id": "user-approver",
        "role": "APPROVER",
        "email": "approver@example.com",
        "name": "Avery Approver",
        "department": "Finance",
    }
    service = ReviewService(repo, settings())
    result = service.decide(outcome.review_id, approver, "APPROVE", note="Verified vendor")
    assert result["status"] == "APPROVED"
    assert repo.get_slots(started.conversation_id)["vendor"]["status"] == "PENDING"
    assert repo.get_conversation(started.conversation_id)["state"] == "READBACK"
    assert any(event["event_type"] == "HUMAN_DECISION" for event in repo.audit)


def test_reviewer_outside_scope_cannot_decide():
    repo, llm, orch, user = build()
    started = orch.start(user)
    outcome = run_tool(
        orch, llm, started.conversation_id, user, "set_vendor", {"value": "Acme"}, score=-1.5
    )
    finance = {
        "id": "user-finance",
        "role": "FINANCE",
        "email": "finance@example.com",
        "name": "Finley Finance",
        "department": "Finance",
    }
    with pytest.raises(ReviewError):
        ReviewService(repo, settings()).decide(outcome.review_id, finance, "APPROVE")


def test_reject_clears_pending_slot_and_resumes_collection():
    repo, llm, orch, user = build()
    started = orch.start(user)
    outcome = run_tool(
        orch, llm, started.conversation_id, user, "set_vendor", {"value": "Acme"}, score=-1.5
    )
    approver = {
        "id": "user-approver",
        "role": "APPROVER",
        "email": "approver@example.com",
        "name": "Avery Approver",
        "department": "Finance",
    }
    ReviewService(repo, settings()).decide(outcome.review_id, approver, "REJECT")
    assert "vendor" not in repo.get_slots(started.conversation_id)
    assert repo.get_conversation(started.conversation_id)["state"] == "COLLECTING"
