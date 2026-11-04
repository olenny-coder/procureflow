from fastapi import FastAPI, Header, HTTPException
from pydantic import BaseModel, Field
import hmac

from .config import Settings
from .llm import OpenAICompatibleLLM
from .orchestrator import Forbidden, NotFound, Orchestrator
from .repository import PostgresRepository
from .reviews import ReviewError, ReviewService

settings = Settings.from_env()
repository = PostgresRepository(settings.database_url)
llm = OpenAICompatibleLLM(
    settings.llm_base_url,
    settings.model_name,
    settings.llm_api_key,
    settings.llm_timeout_seconds,
)
orchestrator = Orchestrator(repository, llm, settings)
reviews = ReviewService(repository, settings)

app = FastAPI(title="ProcureFlow Assistant", version="0.1.0")


class TurnInput(BaseModel):
    message: str = Field(min_length=1, max_length=4000)


class ReviewDecisionInput(BaseModel):
    decision: str = Field(pattern="(?i)^(approve|reject|edit)$")
    value: object | None = None
    note: str = Field(default="", max_length=2000)


def identity(
    x_assistant_token: str = Header(default=""),
    x_user_id: str = Header(default=""),
    x_user_role: str = Header(default=""),
    x_user_email: str = Header(default=""),
    x_user_name: str = Header(default=""),
    x_user_department: str = Header(default="General"),
) -> dict[str, str]:
    if not hmac.compare_digest(x_assistant_token, settings.internal_token):
        raise HTTPException(status_code=401, detail="Invalid assistant service token")
    if not x_user_id or not x_user_role:
        raise HTTPException(status_code=401, detail="Missing authenticated user context")
    return {
        "id": x_user_id,
        "role": x_user_role.upper(),
        "email": x_user_email,
        "name": x_user_name or x_user_email or "Requester",
        "department": x_user_department or "General",
    }


@app.get("/health")
def health() -> dict[str, str]:
    return {
        "status": "ok",
        "service": "procureflow-assistant",
        "model": settings.model_name,
        "quantization": settings.model_quantization,
    }


@app.post("/v1/conversations")
def create_conversation(
    x_assistant_token: str = Header(default=""),
    x_user_id: str = Header(default=""),
    x_user_role: str = Header(default=""),
    x_user_email: str = Header(default=""),
    x_user_name: str = Header(default=""),
    x_user_department: str = Header(default="General"),
) -> dict:
    user = identity(
        x_assistant_token,
        x_user_id,
        x_user_role,
        x_user_email,
        x_user_name,
        x_user_department,
    )
    try:
        outcome = orchestrator.start(user)
    except Forbidden as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc
    return _outcome(outcome)


@app.get("/v1/conversations/{conversation_id}")
def get_conversation(
    conversation_id: str,
    x_assistant_token: str = Header(default=""),
    x_user_id: str = Header(default=""),
    x_user_role: str = Header(default=""),
    x_user_email: str = Header(default=""),
    x_user_name: str = Header(default=""),
    x_user_department: str = Header(default="General"),
) -> dict:
    user = identity(
        x_assistant_token,
        x_user_id,
        x_user_role,
        x_user_email,
        x_user_name,
        x_user_department,
    )
    conversation = repository.get_conversation(conversation_id)
    if not conversation:
        raise HTTPException(status_code=404, detail="Conversation not found")
    if str(conversation["requester_id"]) != user["id"] and user["role"] != "ADMIN":
        raise HTTPException(status_code=403, detail="Forbidden")
    turns = repository.list_turns(conversation_id, 100)
    slots = repository.get_slots(conversation_id)
    return {
        "conversation": _conversation(conversation),
        "turns": [
            {
                "id": str(turn["id"]),
                "role": turn["role"],
                "content": turn["content"],
                "visibleTools": turn.get("visible_tools") or [],
                "confidence": turn.get("confidence"),
                "band": turn.get("band"),
                "createdAt": turn.get("created_at"),
            }
            for turn in turns
        ],
        "slots": [
            {
                "key": key,
                "status": row.get("status"),
                "value": row.get("value"),
                "band": row.get("band"),
            }
            for key, row in slots.items()
        ],
    }


@app.post("/v1/conversations/{conversation_id}/turns")
def create_turn(
    conversation_id: str,
    input: TurnInput,
    x_assistant_token: str = Header(default=""),
    x_user_id: str = Header(default=""),
    x_user_role: str = Header(default=""),
    x_user_email: str = Header(default=""),
    x_user_name: str = Header(default=""),
    x_user_department: str = Header(default="General"),
) -> dict:
    user = identity(
        x_assistant_token,
        x_user_id,
        x_user_role,
        x_user_email,
        x_user_name,
        x_user_department,
    )
    try:
        outcome = orchestrator.turn(conversation_id, user, input.message)
    except Forbidden as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc
    except NotFound as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return _outcome(outcome)


@app.get("/v1/audit")
def assistant_audit(
    conversationId: str | None = None,
    x_assistant_token: str = Header(default=""),
    x_user_id: str = Header(default=""),
    x_user_role: str = Header(default=""),
    x_user_email: str = Header(default=""),
    x_user_name: str = Header(default=""),
    x_user_department: str = Header(default="General"),
) -> dict:
    user = identity(
        x_assistant_token,
        x_user_id,
        x_user_role,
        x_user_email,
        x_user_name,
        x_user_department,
    )
    if user["role"] not in {"ADMIN", "FINANCE"}:
        raise HTTPException(status_code=403, detail="Audit access is limited to admin/finance")
    rows = repository.list_audit(conversationId, 500)
    return {
        "items": [
            {
                "id": str(row["id"]),
                "conversationId": str(row["conversation_id"]),
                "turnId": str(row["turn_id"]) if row.get("turn_id") else None,
                "actorId": str(row["actor_id"]) if row.get("actor_id") else None,
                "eventType": row["event_type"],
                "payload": row["payload"],
                "model": row.get("model_name"),
                "quantization": row.get("model_quantization"),
                "createdAt": row.get("created_at"),
            }
            for row in rows
        ]
    }


@app.get("/v1/reviews")
def list_reviews(
    x_assistant_token: str = Header(default=""),
    x_user_id: str = Header(default=""),
    x_user_role: str = Header(default=""),
    x_user_email: str = Header(default=""),
    x_user_name: str = Header(default=""),
    x_user_department: str = Header(default="General"),
) -> dict:
    user = identity(
        x_assistant_token,
        x_user_id,
        x_user_role,
        x_user_email,
        x_user_name,
        x_user_department,
    )
    try:
        items = reviews.list_reviews(user["role"])
    except ReviewError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc
    return {"items": [_review(item) for item in items]}


@app.post("/v1/reviews/{review_id}/decision")
def decide_review(
    review_id: str,
    input: ReviewDecisionInput,
    x_assistant_token: str = Header(default=""),
    x_user_id: str = Header(default=""),
    x_user_role: str = Header(default=""),
    x_user_email: str = Header(default=""),
    x_user_name: str = Header(default=""),
    x_user_department: str = Header(default="General"),
) -> dict:
    user = identity(
        x_assistant_token,
        x_user_id,
        x_user_role,
        x_user_email,
        x_user_name,
        x_user_department,
    )
    try:
        result = reviews.decide(
            review_id,
            user,
            input.decision,
            input.value,
            input.note,
        )
    except ReviewError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    return {
        "status": result["status"],
        "review": _review(result["review"]),
    }


def _outcome(outcome: object) -> dict:
    return {
        "conversationId": outcome.conversation_id,
        "assistantMessage": outcome.assistant_message,
        "state": outcome.state,
        "status": outcome.status,
        "visibleTools": outcome.visible_tools,
        "reviewId": outcome.review_id,
        "requestId": outcome.request_id,
        "confidence": outcome.confidence,
        "band": outcome.band,
    }


def _conversation(row: dict) -> dict:
    return {
        "id": str(row["id"]),
        "requesterId": str(row["requester_id"]),
        "status": row["status"],
        "state": row["state"],
        "pendingSlot": row.get("pending_slot"),
        "routingPath": row.get("routing_path"),
        "requestId": str(row["request_id"]) if row.get("request_id") else None,
        "model": row["model_name"],
        "quantization": row["model_quantization"],
    }


def _review(row: dict) -> dict:
    return {
        "id": str(row["id"]),
        "conversationId": str(row["conversation_id"]),
        "requesterId": str(row["requester_id"]),
        "turnId": str(row["turn_id"]) if row.get("turn_id") else None,
        "slotKey": row.get("slot_key"),
        "kind": row["kind"],
        "proposedValue": row.get("proposed_value"),
        "sourceSnippet": row.get("source_snippet"),
        "confidence": row.get("confidence"),
        "band": row.get("band"),
        "reason": row.get("escalation_reason"),
        "status": row.get("status"),
        "assignedRole": row.get("assigned_role"),
        "createdAt": row.get("created_at"),
    }
