# Temporal local modifications

This repository vendors the Temporal server at `third_party/temporal/`. The
**upstream server code is unmodified**. The rework consists of a small,
ProcureFlow-specific bootstrap command and a durable local dev configuration. No
server internals, protobufs, or persistence code were changed.

Base: Temporal `main` @ `96a50b1db5baea9650310cbd8b16409e95597188`, tagged locally as
`temporal-base-96a50b1`. See [`TEMPORAL_BASE.md`](./TEMPORAL_BASE.md).

## Why no server-internal patch?

Before touching Temporal server source we evaluated the supported extension points:

1. **SDK APIs** — workflows, activities, signals, queries, timers, retries and
   search attributes cover all ProcureFlow orchestration needs.
2. **Interceptors** — the app registers a workflow inbound/outbound interceptor and
   an activity inbound/outbound interceptor for actor/request log context.
3. **Worker Plugins** — `IntegrationsWorkerPlugin` instantiates the email/Slack/ERP/
   storage/AI adapters before the worker starts.
4. **Dynamic configuration** — `config/dynamicconfig/development-sql.yaml` (upstream)
   tunes the local server; no fork needed.
5. **Custom activities/adapters** — all external calls (DB, email, ERP, Slack) are
   activities behind adapter interfaces.
6. **Server source** — not required.

The only operational gap was that stock Temporal requires an operator/CLI step to
register custom search attributes, and the development CLI’s in-memory store loses
all approval state on restart. The rework solves both **outside server internals**:

- a Go `procureflow-bootstrap` command built from the same vendored module uses the
  public Temporal Go SDK operator API to create the namespace and search attributes;
- a durable SQLite dev configuration keeps workflow history across restarts.

This keeps the reworked server replaceable by Temporal Cloud or a stock release.

## Modification inventory

| File | Type | Purpose | Diff summary | Required? |
| --- | --- | --- | --- | --- |
| `third_party/temporal/cmd/tools/procureflow-bootstrap/main.go` | Added | Wait for Temporal, create the configured namespace, idempotently register `ProcureFlowDepartment`, `ProcureFlowRisk`, `ProcureFlowStatus` Keyword search attributes via `OperatorService.AddSearchAttributes`. | New ~200-line standalone Go command. Uses only public `go.temporal.io/api` and `go.temporal.io/sdk/client` packages. Idempotent (ignores `AlreadyExists` / `NamespaceAlreadyExists`). | **Required** for `TEMPORAL_REWORK_ENABLED=true` locally; not used by stock/Cloud. |
| `third_party/temporal/config/procureflow-dev.yaml` | Added | Durable single-binary dev topology for the reworked server: SQLite file at `.build/temporal.db`, ports 7233/7243, archival filestore, upstream dynamic config. | New config derived from upstream `config/development-sqlite.yaml`; changes `mode: memory` → `mode: rwc` + `setup: true` and uses a file database so approvals survive restarts. | **Required** for `pnpm temporal:dev`. |

No existing upstream file was edited. `git diff temporal-base-96a50b1 -- third_party/temporal`
shows only the two added files. Build artifacts (`third_party/temporal/.build/`) are
gitignored and never committed.

## Feature flag boundary

Application behavior that relies on the bootstrap’s search attributes is gated by
`TEMPORAL_REWORK_ENABLED=true`:

- when true, workflows call `upsertSearchAttributes` with the ProcureFlow attributes;
- when false (Temporal Cloud, stock CLI/self-hosted), the app skips those upserts and
  continues to work from the PostgreSQL read model.

Everything else (approvals, timers, escalation, PO generation, audit trail) works
identically on stock Temporal. The CI stock-Temporal job proves this.

## Build/run

```bash
pnpm temporal:build   # -> third_party/temporal/.build/bin/{temporal-server,procureflow-bootstrap}
pnpm temporal:dev     # durable SQLite + bootstrap
pnpm dev              # reworked Temporal + worker + web
```

Equivalent shell entry points are `scripts/build-temporal.sh` and
`scripts/run-temporal-dev.sh`. Requires Go 1.27+.

## Verification

```bash
pnpm temporal:check
# checks TEMPORAL_MODIFICATIONS.md exists and mentions every changed file under
# third_party/temporal compared to temporal-base-96a50b1
```

Local end-to-end verification with the reworked server:

- `temporal operator search-attribute list` shows the three ProcureFlow attributes;
- workflow `describe` shows `ProcureFlowDepartment`, `ProcureFlowRisk` and
  `ProcureFlowStatus` on a completed request;
- a visibility query `ProcureFlowDepartment = 'Engineering'` returns the workflow;
- the full smoke flow issues a PO and writes the audit trail.
