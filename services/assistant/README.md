# ProcureFlow procurement assistant

A deterministic Python orchestrator with a small local language model as its language
interface. The model never decides the next slot, readiness, routing, submission,
retries, or permissions. Those are code.

## Boundary

```
Next.js authenticated request
  -> /api/assistant/* (session + CSRF + role check)
  -> Python FastAPI (internal token + authenticated user headers)
  -> Orchestrator (DAG, visibility, RBAC, guardrails, confidence, review, audit)
  -> Postgres (slots, turns, reviews, append-only audit)
  -> Ollama OpenAI-compatible /v1/chat/completions
```

The assistant can create a **DRAFT** requisition only after:

1. every slot is read back and confirmed;
2. the requester's role is allowed to create a requisition;
3. deterministic final guardrails pass;
4. the final confidence band is not LOW;
5. routing does not require a human (legal/sole-source/high amount/risk).

It never submits, approves, or starts an approval chain.

## Run locally

### 1. Ollama and the model

```bash
ollama serve
ollama pull phi4-mini:3.8b
ollama show phi4-mini:3.8b
```

The default configuration records `ASSISTANT_MODEL=phi4-mini:3.8b` and
`ASSISTANT_MODEL_QUANTIZATION=Q4_K_M`. Set the quantization to the value reported by
`ollama show` for the exact local artifact. A different ~4B model only requires changing
`ASSISTANT_MODEL` (and the quantization metadata); no code changes.

### Docker/WSL networking

Ollama must listen beyond Windows loopback:

```powershell
[Environment]::SetEnvironmentVariable("OLLAMA_HOST", "0.0.0.0:11434", "User")
# restart the Ollama app / `ollama serve`
```

On Docker Desktop, `host.docker.internal` is the normal route. If Docker runs inside
WSL without Docker Desktop, `host.docker.internal` resolves to the WSL Docker bridge,
not the Windows host. Use the WSL host gateway instead:

```env
ASSISTANT_LLM_BASE_URL=http://172.28.144.1:11434/v1
```

Find the current value with `ip route` in WSL. The assistant container must be able to
reach `/v1/models`; this is checked in the deployment troubleshooting section.

The Phi Ollama template sometimes emits a function call in `message.content`
instead of `message.tool_calls`. The adapter accepts only the exact structured
`[{"name":"...","arguments":{...}}]` form, validates it against the visible tool
schema, and records the protocol in the audit log. Prose that merely claims a value
was recorded is never treated as a write. If the model neither calls a tool nor
emits the exact structure, the orchestrator asks for the next slot again (or performs
a strict typed fallback for that one slot) rather than inventing state.

### 2. Database

From the repository root:

```bash
pnpm db:migrate
```

This creates the `assistant_*` tables, including the append-only audit trigger.

### 3. Assistant service

```bash
python -m venv .venv
# Windows: .venv\Scripts\activate
# macOS/Linux: source .venv/bin/activate
pip install -r services/assistant/requirements.txt
pnpm assistant:dev
```

Or `pnpm assistant:test` for the replay harness.

### 4. Web app

`.env`:

```env
ASSISTANT_SERVICE_URL="http://127.0.0.1:8001"
ASSISTANT_INTERNAL_TOKEN="dev-assistant-token"
ASSISTANT_MODEL="phi4-mini:3.8b"
ASSISTANT_MODEL_QUANTIZATION="Q4_K_M"
```

Then `pnpm dev` (or `pnpm --filter @procureflow/web dev`). The **Assistant** navigation
item is visible to requesters and admins; approvers/finance/admin see **AI reviews**.

## Tool visibility

`visible_tools()` is the primary reliability boundary for a 3.8B model:

- filled slots are hidden;
- dependency-blocked slots are hidden;
- while reading back, only `correct_value` for the pending slot plus
  `confirm_readback` / `reject_readback` are sent;
- `lookup_policy` appears for policy questions;
- `check_supplier` appears only for supplier/vendor questions;
- `resolve_routing_path` appears for route questions or when the DAG is complete;
- `finalize_intake` only appears when every slot is confirmed.

A tool not sent in the request cannot be called. If the model emits an unknown tool,
multiple tool calls, invalid JSON, or schema-invalid arguments, the turn is a hard
failure: no write, a review item, and an audit event.

## Confidence and HITL

`mean_logprob` is calculated from the OpenAI-compatible response logprobs. The bands are
configurable, calibrated on a labeled sample:

```env
ASSISTANT_HIGH_MIN_LOGPROB=-0.35
ASSISTANT_MID_MIN_LOGPROB=-1.0
```

- **HIGH** → proceed to readback.
- **MID** → deterministic guardrail checks (supplier master, cost-center mapping,
  amount limit) before readback.
- **LOW** / no logprobs → human review, never a silent accept.

When an OpenAI-compatible server does not support logprobs, the client retries once
without them; the resulting turn is LOW and goes to review rather than being trusted.

Reviewers see only items assigned to their role (ADMIN sees all). A slot approval still
returns the value to the requester as a **readback**; it does not silently move to filled.
A finalization approval re-runs guardrails and creates the draft.

## Audit

Every turn, tool call, arguments, visible set, confidence, band, guardrail result,
readback, review decision, routing decision, and final write is inserted into
`assistant_audit_events`. The table has a trigger that rejects UPDATE and DELETE. Model
name and quantization are stored on every audit event, turn, conversation, and review.

## Calibration

```bash
python services/assistant/calibration.py samples.jsonl --output thresholds.json
```

JSONL rows:

```json
{"logprob": -0.21, "label": 1}
{"logprob": -1.30, "label": 0}
```

Use your own labeled structured outputs/conversation turns. The script suggests
thresholds; validate on a held-out sample.

## Test harness

```bash
pnpm assistant:test
```

20 replay tests cover:

- initial visibility hides dependent slots;
- readback is required before a slot is filled;
- ambiguous values ask for clarification instead of guessing;
- malformed tool calls hard-fail and write nothing;
- Phi text tool calls and Phi envelope arguments are strictly adapted;
- prose cannot claim a value was recorded without a tool;
- explicit readback yes/no is deterministic;
- unapproved vendors are escalated;
- RBAC blocks finalization by non-requester roles;
- corrections invalidate transitive dependents;
- over-limit finalization requires human approval and writes no draft;
- a human approval can finalize only after guardrails pass;
- reviewer scope and approve/reject/readback behavior;
- audit includes model name, quantization, and visible tools.

## Files

| File | Responsibility |
| --- | --- |
| `app/contracts.py` | All LLM-facing schemas, slot definitions, tool schemas |
| `app/dag.py` | Slot DAG, dependencies, validation, readiness predicates |
| `app/tools.py` | Per-turn tool visibility |
| `app/orchestrator.py` | Turn/control-flow state machine |
| `app/guardrails.py` | Deterministic hard rules |
| `app/routing.py` | Grounded policy lookup and routing decision |
| `app/tasks.py` | Deterministic slot-completion tasks attached to the DAG |
| `app/confidence.py` | Mean logprob and banding |
| `app/reviews.py` | Scoped human review decisions |
| `app/repository.py` | Postgres persistence and draft creation |
| `app/audit.py` | (Audit is written through the repository) |
| `calibration.py` | Threshold suggestion |
