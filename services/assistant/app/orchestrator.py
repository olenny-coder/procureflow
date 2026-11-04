from __future__ import annotations

import json
from dataclasses import dataclass
from typing import Any

from .audit import AuditWriter
from .confidence import band_for, mean_logprob
from .config import Settings
from .contracts import (
    ALL_TOOLS,
    CHECK_SUPPLIER,
    CONFIRM_READBACK,
    FINALIZE_INTAKE,
    LOOKUP_POLICY,
    REJECT_READBACK,
    RESOLVE_ROUTING,
    SLOTS,
)
from .dag import (
    SlotValidationError,
    available_slots,
    correction_targets,
    filled_slots,
    normalize_value,
    readback_message,
    ready,
    transitive_dependents,
    value_text,
)
from .guardrails import check_slot, final_guardrails
from .llm import LLMClient, LLMError, LLMResult
from .repository import Repository
from .routing import lookup_policy, resolve_routing_path
from .tasks import run_slot_tasks
from .tools import setter_slot_for_name, tool_specs_by_name, visible_tools


class AssistantError(RuntimeError):
    pass


class Forbidden(AssistantError):
    pass


class NotFound(AssistantError):
    pass


class MalformedToolCall(AssistantError):
    def __init__(self, message: str, raw: str = "") -> None:
        super().__init__(message)
        self.raw = raw


@dataclass
class TurnOutcome:
    conversation_id: str
    assistant_message: str
    state: str
    status: str
    visible_tools: list[str]
    review_id: str | None = None
    request_id: str | None = None
    confidence: float | None = None
    band: str | None = None


class Orchestrator:
    def __init__(
        self,
        repository: Repository,
        llm: LLMClient,
        settings: Settings,
    ) -> None:
        self.repo = repository
        self.llm = llm
        self.settings = settings

    # ------------------------------------------------------------------ setup
    def start(self, user: dict[str, Any]) -> TurnOutcome:
        if user["role"] not in self.settings.allow_roles:
            raise Forbidden("Your role cannot start a procurement intake.")
        conversation = self.repo.create_conversation(
            user["id"], self.settings.model_name, self.settings.model_quantization
        )
        conversation_id = str(conversation["id"])
        message = (
            "I can guide this purchase from intake to a draft requisition. "
            "I will ask one or two details at a time, read each value back, and never submit or "
            "approve anything without the proper workflow and human controls. "
            "Let's start: which vendor are you buying from?"
        )
        turn = self.repo.add_turn(
            conversation_id,
            "ASSISTANT",
            message,
            [],
            [],
            None,
            None,
            self.settings.model_name,
            self.settings.model_quantization,
        )
        self.repo.add_audit(
            conversation_id,
            str(turn["id"]),
            None,
            "CONVERSATION_STARTED",
            {"visibleTools": [], "nextSlots": ["vendor", "category"]},
            self.settings.model_name,
            self.settings.model_quantization,
        )
        return TurnOutcome(
            conversation_id=conversation_id,
            assistant_message=message,
            state="COLLECTING",
            status="ACTIVE",
            visible_tools=[],
        )

    # ------------------------------------------------------------------ turn
    def turn(
        self,
        conversation_id: str,
        user: dict[str, Any],
        message: str,
    ) -> TurnOutcome:
        conversation = self._load_conversation(conversation_id, user)
        if conversation["status"] == "COMPLETE":
            return self._outcome(
                conversation,
                "This intake is already complete. Open the draft requisition from your requests.",
            )
        if conversation["status"] == "HUMAN_REVIEW":
            return self._outcome(
                conversation,
                "This intake is waiting for a human reviewer. I cannot change or write values until "
                "the review is resolved.",
            )

        turns = self.repo.list_turns(conversation_id, self.settings.max_turns + 1)
        if len(turns) >= self.settings.max_turns:
            self.repo.update_conversation(
                conversation_id, status="HUMAN_REVIEW", state="FAILED"
            )
            review = self._escalate(
                conversation,
                None,
                None,
                "LOOP_LIMIT",
                {"message": "Maximum conversation turns reached."},
                "The conversation reached its turn limit.",
                "Turn limit reached; no further automatic actions.",
                self.settings.review_default_role,
            )
            self._audit(conversation_id, None, user["id"], "LOOP_LIMIT", {"reviewId": str(review["id"])})
            return self._outcome(
                conversation,
                "I stopped this conversation at the safety limit and sent it to a human reviewer.",
                review_id=str(review["id"]),
            )

        user_turn = self.repo.add_turn(
            conversation_id,
            "REQUESTER",
            message,
            [],
            [],
            None,
            None,
            self.settings.model_name,
            self.settings.model_quantization,
        )
        self._audit(
            conversation_id,
            str(user_turn["id"]),
            user["id"],
            "REQUESTER_TURN",
            {"message": message},
        )

        slots = self.repo.get_slots(conversation_id)
        state = conversation["state"]
        pending_slot = conversation["pending_slot"]
        if state == "READBACK" and not pending_slot:
            state = "COLLECTING"
            self.repo.update_conversation(conversation_id, state=state)

        tools = visible_tools(state, slots, pending_slot, message, user["role"])
        tool_specs = tool_specs_by_name(tools)
        visible_names = [tool.name for tool in tools]
        self._audit(
            conversation_id,
            str(user_turn["id"]),
            user["id"],
            "MODEL_REQUEST",
            {
                "visibleTools": visible_names,
                "state": state,
                "pendingSlot": pending_slot,
                "nextSlots": available_slots(slots),
            },
        )

        messages = self._messages(conversation, slots, pending_slot, message, user)
        try:
            result = self.llm.complete(messages, [tool.to_openai() for tool in tools])
        except LLMError as exc:
            self._audit(
                conversation_id,
                str(user_turn["id"]),
                user["id"],
                "MODEL_ERROR",
                {"error": str(exc)},
            )
            return self._outcome(
                conversation,
                "The local model is unavailable right now. Nothing was written or submitted. "
                "Please retry when Ollama is running.",
            )

        score = mean_logprob(result.logprobs)
        band = band_for(score, self.settings.high_min_logprob, self.settings.mid_min_logprob)
        assistant_turn = self.repo.add_turn(
            conversation_id,
            "ASSISTANT",
            "",
            visible_names,
            [{"name": call.name, "arguments": call.arguments_raw} for call in result.tool_calls],
            score,
            band,
            self.settings.model_name,
            self.settings.model_quantization,
        )
        turn_id = str(assistant_turn["id"])

        if len(result.tool_calls) > 1:
            return self._malformed(
                conversation,
                turn_id,
                user,
                "More than one tool call in a single turn.",
                json.dumps([call.__dict__ for call in result.tool_calls]),
            )
        if not result.tool_calls:
            content = result.content.strip() or (
                "I need one detail at a time. " + self._next_question(slots)
            )
            content = self._guard_claim(content, conversation, turn_id, user)
            self.repo.update_turn(turn_id, content)
            self._audit(
                conversation_id,
                turn_id,
                user["id"],
                "ASSISTANT_TURN",
                {"content": content, "confidence": score, "band": band},
            )
            return self._outcome(conversation, content, confidence=score, band=band)

        call = result.tool_calls[0]
        if call.name not in tool_specs:
            return self._malformed(
                conversation,
                turn_id,
                user,
                f"Tool {call.name!r} was not in the visible tool set.",
                call.arguments_raw,
            )

        try:
            arguments = json.loads(call.arguments_raw or "{}")
        except json.JSONDecodeError as exc:
            return self._malformed(
                conversation,
                turn_id,
                user,
                f"Tool arguments were not valid JSON: {exc.msg}",
                call.arguments_raw,
            )

        try:
            self._audit(
                conversation_id,
                turn_id,
                user["id"],
                "TOOL_CALL",
                {
                    "tool": call.name,
                    "arguments": arguments,
                    "visibleTools": visible_names,
                },
            )
            return self._execute_tool(
                conversation,
                turn_id,
                user,
                call.name,
                arguments,
                tool_specs[call.name],
                result,
                score,
                band,
                slots,
                message,
            )
        except SlotValidationError as exc:
            return self._malformed(conversation, turn_id, user, str(exc), call.arguments_raw)
        except MalformedToolCall as exc:
            return self._malformed(conversation, turn_id, user, str(exc), exc.raw)

    # ------------------------------------------------------------------ tools
    def _execute_tool(
        self,
        conversation: dict[str, Any],
        turn_id: str,
        user: dict[str, Any],
        name: str,
        arguments: dict[str, Any],
        spec: Any,
        result: LLMResult,
        score: float | None,
        band: str,
        slots: dict[str, dict[str, Any]],
        user_message: str,
    ) -> TurnOutcome:
        try:
            parsed = spec.model.model_validate(arguments)
        except Exception as exc:
            raise MalformedToolCall(str(exc), json.dumps(arguments)) from exc

        conversation_id = str(conversation["id"])
        if name == CONFIRM_READBACK.name:
            return self._confirm(conversation, turn_id, user, slots)
        if name == REJECT_READBACK.name:
            return self._reject(conversation, turn_id, user, slots)
        if name == LOOKUP_POLICY.name:
            return self._lookup_policy(conversation, turn_id, user, parsed.query, slots)
        if name == CHECK_SUPPLIER.name:
            return self._check_supplier(conversation, turn_id, user, parsed.vendor)
        if name == RESOLVE_ROUTING.name:
            return self._resolve_routing(conversation, turn_id, user, slots)
        if name == FINALIZE_INTAKE.name:
            return self._finalize(conversation, turn_id, user, slots, result, score, band)
        if name == "correct_value":
            return self._correct(
                conversation, turn_id, user, slots, parsed.slot, parsed.value, score, band
            )

        slot = setter_slot_for_name(name)
        if slot:
            return self._set_slot(
                conversation,
                turn_id,
                user,
                slot,
                parsed.value,
                score,
                band,
                slots,
                user_message,
            )
        raise MalformedToolCall(f"Unsupported tool {name!r}")

    def _set_slot(
        self,
        conversation: dict[str, Any],
        turn_id: str,
        user: dict[str, Any],
        slot: str,
        raw_value: Any,
        score: float | None,
        band: str,
        slots: dict[str, dict[str, Any]],
        user_message: str,
    ) -> TurnOutcome:
        conversation_id = str(conversation["id"])
        value = normalize_value(slot, raw_value)
        row = dict(slots)
        row[slot] = {"status": "PENDING", "value": value}
        guardrail = check_slot(
            slot,
            value,
            self.repo,
            self._values(row),
            self.settings.auto_accept_limit_cents,
        )
        self._audit(
            conversation_id,
            turn_id,
            user["id"],
            "GUARDRAIL_RESULT",
            {"slot": slot, "value": value, "result": guardrail.to_dict()},
        )
        self.repo.upsert_slot(
            conversation_id,
            slot,
            "PENDING",
            value,
            turn_id,
            score,
            band,
            guardrail.to_dict(),
        )

        needs_review = not guardrail.ok or band == "LOW"
        if needs_review:
            reason = (
                "Low confidence on the structured value."
                if band == "LOW"
                else "A deterministic guardrail requires human review."
            )
            review = self._escalate(
                conversation,
                turn_id,
                slot,
                "SLOT",
                value,
                user_message,
                reason,
                self._review_role(slot),
                score,
                band,
            )
            self.repo.update_conversation(
                conversation_id,
                status="HUMAN_REVIEW",
                state="REVIEW",
                pending_slot=slot,
            )
            message = (
                f"I have **{SLOTS[slot].label}: {value_text(slot, value)}** proposed, but "
                f"{reason.lower()} I sent it to a human reviewer; no request was created."
            )
            self.repo.update_turn(turn_id, message)
            self._audit(
                conversation_id,
                turn_id,
                user["id"],
                "HITL_ESCALATED",
                {"reviewId": str(review["id"]), "slot": slot, "reason": reason},
            )
            return self._outcome(
                conversation,
                message,
                review_id=str(review["id"]),
                confidence=score,
                band=band,
            )

        self.repo.update_conversation(
            conversation_id,
            status="ACTIVE",
            state="READBACK",
            pending_slot=slot,
        )
        message = readback_message(slot, value)
        self.repo.update_turn(turn_id, message)
        self._audit(
            conversation_id,
            turn_id,
            user["id"],
            "READBACK_REQUESTED",
            {"slot": slot, "value": value, "confidence": score, "band": band},
        )
        return self._outcome(conversation, message, confidence=score, band=band)

    def _confirm(
        self,
        conversation: dict[str, Any],
        turn_id: str,
        user: dict[str, Any],
        slots: dict[str, dict[str, Any]],
    ) -> TurnOutcome:
        conversation_id = str(conversation["id"])
        pending_slot = conversation.get("pending_slot")
        pending = slots.get(pending_slot) if pending_slot else None
        if not pending_slot or not pending or pending.get("status") != "PENDING":
            raise MalformedToolCall("confirm_readback called without a pending readback.")
        task_results = run_slot_tasks(
            pending_slot,
            pending["value"],
            self._values(slots),
            self.repo,
            self.settings.auto_accept_limit_cents,
            human_approved=pending.get("band") == "HUMAN",
        )
        failed = [task for task in task_results if not task["ok"]]
        if failed:
            review = self._escalate(
                conversation,
                turn_id,
                pending_slot,
                "SLOT",
                pending["value"],
                str(pending.get("value")),
                "A deterministic slot-completion task failed: "
                + ", ".join(task["task"] for task in failed),
                self._review_role(pending_slot),
                pending.get("confidence"),
                pending.get("band"),
            )
            self.repo.update_conversation(
                conversation_id,
                status="HUMAN_REVIEW",
                state="REVIEW",
                pending_slot=pending_slot,
            )
            message = (
                "I could not complete the deterministic checks for that value, so I sent it to "
                "human review. No request was created."
            )
            self.repo.update_turn(turn_id, message)
            self._audit(
                conversation_id,
                turn_id,
                user["id"],
                "SLOT_TASK_FAILED",
                {"slot": pending_slot, "tasks": task_results, "reviewId": str(review["id"])},
            )
            return self._outcome(
                conversation, message, review_id=str(review["id"]), band=pending.get("band")
            )
        self.repo.upsert_slot(
            conversation_id,
            pending_slot,
            "FILLED",
            pending["value"],
            str(pending.get("source_turn_id") or ""),
            pending.get("confidence"),
            pending.get("band"),
            pending.get("guardrail") or {},
        )
        updated_slots = self.repo.get_slots(conversation_id)
        state = "COMPLETE" if ready(updated_slots) else "COLLECTING"
        self.repo.update_conversation(
            conversation_id,
            status="ACTIVE",
            state=state,
            pending_slot=None,
        )
        message = (
            f"Confirmed **{SLOTS[pending_slot].label}: {value_text(pending_slot, pending['value'])}**. "
            + (
                "All intake values are confirmed. Say finalize when you want me to prepare the draft."
                if state == "COMPLETE"
                else self._next_question(updated_slots)
            )
        )
        self.repo.update_turn(turn_id, message)
        self._audit(
            conversation_id,
            turn_id,
            user["id"],
            "READBACK_CONFIRMED",
            {
                "slot": pending_slot,
                "value": pending["value"],
                "onCompleteTasks": task_results,
            },
        )
        return self._outcome(conversation, message)

    def _reject(
        self,
        conversation: dict[str, Any],
        turn_id: str,
        user: dict[str, Any],
        slots: dict[str, dict[str, Any]],
    ) -> TurnOutcome:
        conversation_id = str(conversation["id"])
        pending_slot = conversation.get("pending_slot")
        if not pending_slot:
            raise MalformedToolCall("reject_readback called without a pending readback.")
        self.repo.delete_slot(conversation_id, pending_slot)
        self.repo.update_conversation(
            conversation_id, status="ACTIVE", state="COLLECTING", pending_slot=None
        )
        message = f"Discarded the proposed {SLOTS[pending_slot].label}. {self._next_question(self.repo.get_slots(conversation_id))}"
        self.repo.update_turn(turn_id, message)
        self._audit(
            conversation_id,
            turn_id,
            user["id"],
            "READBACK_REJECTED",
            {"slot": pending_slot},
        )
        return self._outcome(conversation, message)

    def _correct(
        self,
        conversation: dict[str, Any],
        turn_id: str,
        user: dict[str, Any],
        slots: dict[str, dict[str, Any]],
        slot: str,
        raw_value: Any,
        score: float | None,
        band: str,
    ) -> TurnOutcome:
        conversation_id = str(conversation["id"])
        if slot not in SLOTS:
            raise MalformedToolCall(f"Unknown slot {slot!r}")
        if conversation["state"] == "COMPLETE":
            for dependent in transitive_dependents(slot):
                self.repo.delete_slot(conversation_id, dependent)
            self.repo.delete_slot(conversation_id, slot)
            self._audit(
                conversation_id,
                turn_id,
                user["id"],
                "DEPENDENT_SLOTS_INVALIDATED",
                {"slot": slot, "dependents": sorted(transitive_dependents(slot))},
            )
        value = normalize_value(slot, raw_value)
        guardrail = check_slot(
            slot,
            value,
            self.repo,
            self._values(slots),
            self.settings.auto_accept_limit_cents,
        )
        self.repo.upsert_slot(
            conversation_id, slot, "PENDING", value, turn_id, score, band, guardrail.to_dict()
        )
        self.repo.update_conversation(
            conversation_id, status="ACTIVE", state="READBACK", pending_slot=slot
        )
        message = readback_message(slot, value)
        self.repo.update_turn(turn_id, message)
        self._audit(
            conversation_id,
            turn_id,
            user["id"],
            "VALUE_CORRECTED",
            {"slot": slot, "value": value, "guardrail": guardrail.to_dict()},
        )
        return self._outcome(conversation, message, confidence=score, band=band)

    def _finalize(
        self,
        conversation: dict[str, Any],
        turn_id: str,
        user: dict[str, Any],
        slots: dict[str, dict[str, Any]],
        result: LLMResult,
        score: float | None,
        band: str,
    ) -> TurnOutcome:
        conversation_id = str(conversation["id"])
        if user["role"] not in self.settings.allow_roles:
            raise Forbidden("Your role cannot create a requisition.")
        if not ready(slots):
            raise MalformedToolCall("finalize_intake called before all slots were confirmed.")

        values = self._values(slots)
        guardrails, vendor = final_guardrails(
            values, self.repo, self.settings.auto_accept_limit_cents
        )
        routing = resolve_routing_path(values, vendor, self.repo.list_policies())
        self._audit(
            conversation_id,
            turn_id,
            user["id"],
            "ROUTING_DETERMINED",
            {
                "routing": routing,
                "guardrails": guardrails.to_dict(),
                "confidence": score,
                "band": band,
            },
        )

        reasons = [check["message"] for check in guardrails.checks if not check["ok"]]
        if routing["requiresHumanReview"]:
            reasons.extend(routing["reasons"])
        if band == "LOW":
            reasons.append("Final structured action had low confidence.")

        if reasons:
            review = self._escalate(
                conversation,
                turn_id,
                None,
                "FINALIZE",
                {"values": values, "routing": routing},
                str(values.get("justification", ""))[:500],
                "; ".join(reasons),
                self._review_role(None),
                score,
                band,
            )
            self.repo.update_conversation(
                conversation_id, status="HUMAN_REVIEW", state="REVIEW", routing_path=routing["path"]
            )
            message = (
                "The intake is complete, but a human review is required before any requisition is created: "
                + "; ".join(reasons)
                + " No request has been created yet."
            )
            self.repo.update_turn(turn_id, message)
            self._audit(
                conversation_id,
                turn_id,
                user["id"],
                "HITL_ESCALATED",
                {"reviewId": str(review["id"]), "kind": "FINALIZE", "reasons": reasons},
            )
            return self._outcome(
                conversation,
                message,
                review_id=str(review["id"]),
                confidence=score,
                band=band,
            )

        assert vendor is not None
        request_id = self.repo.create_draft_request(
            user["id"],
            user.get("department", "General"),
            values,
            vendor,
            routing["path"],
        )
        self.repo.update_conversation(
            conversation_id,
            status="COMPLETE",
            state="DONE",
            pending_slot=None,
            routing_path=routing["path"],
            request_id=request_id,
        )
        self._audit(
            conversation_id,
            turn_id,
            user["id"],
            "FINAL_WRITE",
            {
                "requestId": request_id,
                "routing": routing,
                "values": values,
                "guardrails": guardrails.to_dict(),
            },
        )
        message = (
            f"I created **draft requisition {request_id}** using the {routing['path'].replace('_', ' ').lower()} path. "
            "It is a DRAFT only — it has not been submitted, approved, or routed for approval. "
            "Open it from your requests to review and continue."
        )
        self.repo.update_turn(turn_id, message)
        return self._outcome(
            conversation,
            message,
            request_id=request_id,
            confidence=score,
            band=band,
        )

    # ------------------------------------------------------------------ lookups
    def _lookup_policy(
        self,
        conversation: dict[str, Any],
        turn_id: str,
        user: dict[str, Any],
        query: str,
        slots: dict[str, dict[str, Any]],
    ) -> TurnOutcome:
        values = self._values(slots)
        vendor = self.repo.find_vendor(values["vendor"]) if values.get("vendor") else None
        answer = lookup_policy(query, self.repo.list_policies(), values, vendor)
        self._audit(
            str(conversation["id"]),
            turn_id,
            user["id"],
            "TOOL_RESULT",
            {"tool": LOOKUP_POLICY.name, "result": answer},
        )
        if not answer.get("found"):
            review = self._escalate(
                conversation,
                turn_id,
                None,
                "POLICY",
                {"query": query},
                query,
                "No matching policy was found; the question needs finance review.",
                "FINANCE",
            )
            self._audit(
                str(conversation["id"]),
                turn_id,
                user["id"],
                "POLICY_LOOKUP_ESCALATED",
                {"reviewId": str(review["id"]), "query": query},
            )
        return self._paraphrase_tool_result(conversation, turn_id, user, answer, "policy")

    def _check_supplier(
        self,
        conversation: dict[str, Any],
        turn_id: str,
        user: dict[str, Any],
        vendor_name: str,
    ) -> TurnOutcome:
        vendor = self.repo.find_vendor(vendor_name)
        answer = {
            "found": bool(vendor),
            "vendor": {
                "name": vendor.get("name"),
                "status": vendor.get("status"),
                "riskLevel": vendor.get("risk_level"),
            }
            if vendor
            else None,
            "message": (
                "Vendor is in the supplier master."
                if vendor
                else "No matching vendor exists in the supplier master; route to procurement review."
            ),
        }
        self._audit(
            str(conversation["id"]),
            turn_id,
            user["id"],
            "TOOL_RESULT",
            {"tool": CHECK_SUPPLIER.name, "result": answer},
        )
        if not vendor:
            review = self._escalate(
                conversation,
                turn_id,
                None,
                "SUPPLIER",
                {"query": vendor_name},
                vendor_name,
                "No matching supplier was found; procurement review required.",
                "APPROVER",
            )
            self._audit(
                str(conversation["id"]),
                turn_id,
                user["id"],
                "SUPPLIER_LOOKUP_ESCALATED",
                {"reviewId": str(review["id"]), "query": vendor_name},
            )
        return self._paraphrase_tool_result(conversation, turn_id, user, answer, "supplier")

    def _resolve_routing(
        self,
        conversation: dict[str, Any],
        turn_id: str,
        user: dict[str, Any],
        slots: dict[str, dict[str, Any]],
    ) -> TurnOutcome:
        values = self._values(slots)
        vendor = self.repo.find_vendor(values["vendor"]) if values.get("vendor") else None
        answer = resolve_routing_path(values, vendor, self.repo.list_policies())
        self._audit(
            str(conversation["id"]),
            turn_id,
            user["id"],
            "TOOL_RESULT",
            {"tool": RESOLVE_ROUTING.name, "result": answer},
        )
        return self._paraphrase_tool_result(conversation, turn_id, user, answer, "routing")

    def _paraphrase_tool_result(
        self,
        conversation: dict[str, Any],
        turn_id: str,
        user: dict[str, Any],
        answer: dict[str, Any],
        topic: str,
    ) -> TurnOutcome:
        # The model may phrase the answer, but only from this deterministic result.
        fallback = self._fallback_answer(answer, topic)
        if not answer.get("found", True):
            message = fallback
        else:
            followup = [
                {
                    "role": "system",
                    "content": (
                        "Paraphrase the supplied lookup result for the requester. Do not add any "
                        "policy fact that is not in the result. Say clearly that this came from the "
                        "policy/supplier store. Do not claim a request was submitted or approved."
                    ),
                },
                {
                    "role": "user",
                    "content": f"Lookup result (JSON): {json.dumps(answer)}",
                },
            ]
            try:
                result = self.llm.complete(followup, [])
                message = result.content.strip() or fallback
            except LLMError:
                message = fallback
        message = self._guard_claim(message, conversation, turn_id, user)
        self.repo.update_turn(turn_id, message)
        self._audit(
            str(conversation["id"]),
            turn_id,
            user["id"],
            "ASSISTANT_TURN",
            {"content": message, "topic": topic, "groundedResult": answer},
        )
        return self._outcome(conversation, message)

    @staticmethod
    def _fallback_answer(answer: dict[str, Any], topic: str) -> str:
        if topic == "policy":
            if not answer.get("found"):
                return "I could not find a matching policy. I will route this question to finance review rather than guess."
            names = ", ".join(policy["name"] for policy in answer.get("policies", []))
            return f"The policy store returned these matching policies: {names}."
        if topic == "supplier":
            if not answer.get("found"):
                return "That vendor is not in the approved supplier master. I cannot auto-accept it; it needs procurement review."
            vendor = answer["vendor"]
            return f"The supplier master says {vendor['name']} is {vendor['status']} with {vendor['riskLevel']} risk."
        return f"The deterministic routing result is {answer.get('path', 'unknown')}: {'; '.join(answer.get('reasons', []))}."

    # ------------------------------------------------------------------ helpers
    def _load_conversation(self, conversation_id: str, user: dict[str, Any]) -> dict[str, Any]:
        conversation = self.repo.get_conversation(conversation_id)
        if not conversation:
            raise NotFound("Conversation not found")
        if str(conversation["requester_id"]) != str(user["id"]) and user["role"] != "ADMIN":
            raise Forbidden("You cannot access this conversation")
        return conversation

    def _messages(
        self,
        conversation: dict[str, Any],
        slots: dict[str, dict[str, Any]],
        pending_slot: str | None,
        message: str,
        user: dict[str, Any],
    ) -> list[dict[str, Any]]:
        filled = {key: row.get("value") for key, row in slots.items() if row.get("status") == "FILLED"}
        system = (
            "You are ProcureFlow's procurement intake assistant. You own language only. "
            "The application owns all control flow: it decides the next slot, readiness, routing, "
            "submission, retries, and RBAC. Never claim a request was submitted, approved, or routed. "
            "Ask for at most one or two missing fields. Use only the provided tools. Never invent "
            "policy, supplier, budget, or routing facts; call the grounded lookup tools. "
            "Every slot value must be read back and explicitly confirmed by the requester before it "
            "moves to filled. If the requester is ambiguous, ask a clarifying question. "
            f"Authenticated role: {user['role']}. "
            f"Confirmed values: {json.dumps(filled, default=str)}. "
            f"Pending readback slot: {pending_slot}. "
            f"Next available slots: {available_slots(slots)}."
        )
        history = self.repo.list_turns(str(conversation["id"]), 12)
        messages: list[dict[str, Any]] = [{"role": "system", "content": system}]
        for turn in history:
            if turn["role"] == "REQUESTER":
                messages.append({"role": "user", "content": turn["content"]})
            elif turn["role"] == "ASSISTANT":
                messages.append({"role": "assistant", "content": turn["content"]})
        if not messages or messages[-1].get("content") != message:
            messages.append({"role": "user", "content": message})
        return messages

    @staticmethod
    def _values(slots: dict[str, dict[str, Any]]) -> dict[str, Any]:
        return {
            key: row.get("value")
            for key, row in slots.items()
            if row.get("status") in {"FILLED", "PENDING"} and row.get("value") is not None
        }

    @staticmethod
    def _next_question(slots: dict[str, dict[str, Any]]) -> str:
        from .dag import next_question

        return next_question(slots)

    def _review_role(self, slot: str | None) -> str:
        if slot in {"budget", "cost_center"}:
            return "FINANCE"
        if slot in {"vendor", "supplier"}:
            return "APPROVER"
        return self.settings.review_default_role

    def _guard_claim(
        self,
        content: str,
        conversation: dict[str, Any],
        turn_id: str,
        user: dict[str, Any],
    ) -> str:
        """Hard guard against the model claiming an action the orchestrator did not do."""
        lower = content.lower()
        claims = (
            "has been submitted",
            "was submitted",
            "is submitted",
            "has been approved",
            "was approved",
            "i approved",
            "request created",
            "po issued",
            "routed for approval",
            "successfully submitted",
        )
        if any(claim in lower for claim in claims):
            self._audit(
                str(conversation["id"]),
                turn_id,
                user["id"],
                "UNSUPPORTED_CLAIM_BLOCKED",
                {"content": content},
            )
            return (
                "I have not submitted, approved, or routed anything. I can only collect and "
                "read back values, answer from the local policy/supplier stores, and prepare a "
                "draft after all controls pass. " + self._next_question(self.repo.get_slots(str(conversation["id"])))
            )
        return content

    def _escalate(
        self,
        conversation: dict[str, Any],
        turn_id: str | None,
        slot: str | None,
        kind: str,
        proposed_value: Any,
        source_snippet: str,
        reason: str,
        assigned_role: str,
        confidence: float | None = None,
        band: str | None = None,
    ) -> dict[str, Any]:
        review = self.repo.add_review(
            str(conversation["id"]),
            str(conversation["requester_id"]),
            turn_id,
            slot,
            kind,
            proposed_value,
            source_snippet,
            confidence,
            band,
            reason,
            assigned_role,
        )
        self._audit(
            str(conversation["id"]),
            turn_id,
            None,
            "REVIEW_CREATED",
            {
                "reviewId": str(review["id"]),
                "kind": kind,
                "slot": slot,
                "reason": reason,
                "assignedRole": assigned_role,
            },
        )
        return review

    def _malformed(
        self,
        conversation: dict[str, Any],
        turn_id: str,
        user: dict[str, Any],
        reason: str,
        raw: str,
    ) -> TurnOutcome:
        review = self._escalate(
            conversation,
            turn_id,
            None,
            "MALFORMED",
            {"raw": raw[:4000]},
            raw[:500],
            f"Malformed tool call: {reason}",
            self.settings.review_default_role,
        )
        self.repo.update_conversation(
            str(conversation["id"]), status="HUMAN_REVIEW", state="FAILED"
        )
        message = (
            "I could not safely process that model response, so I stopped and escalated it to a human "
            "reviewer. No data was written and no request was created."
        )
        self.repo.update_turn(turn_id, message)
        self._audit(
            str(conversation["id"]),
            turn_id,
            user["id"],
            "MALFORMED_TOOL_CALL",
            {"reason": reason, "raw": raw[:4000], "reviewId": str(review["id"])},
        )
        return self._outcome(
            conversation,
            message,
            review_id=str(review["id"]),
        )

    def _audit(
        self,
        conversation_id: str,
        turn_id: str | None,
        actor_id: str | None,
        event_type: str,
        payload: dict[str, Any],
    ) -> None:
        AuditWriter(
            self.repo,
            self.settings.model_name,
            self.settings.model_quantization,
        ).write(
            conversation_id=conversation_id,
            turn_id=turn_id,
            actor_id=actor_id,
            event_type=event_type,
            payload=payload,
        )

    def _outcome(
        self,
        conversation: dict[str, Any],
        message: str,
        review_id: str | None = None,
        request_id: str | None = None,
        confidence: float | None = None,
        band: str | None = None,
    ) -> TurnOutcome:
        current = self.repo.get_conversation(str(conversation["id"])) or conversation
        return TurnOutcome(
            conversation_id=str(current["id"]),
            assistant_message=message,
            state=current.get("state", "COLLECTING"),
            status=current.get("status", "ACTIVE"),
            visible_tools=[],
            review_id=review_id,
            request_id=str(current["request_id"]) if current.get("request_id") else request_id,
            confidence=confidence,
            band=band,
        )
