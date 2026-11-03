#!/usr/bin/env bash
# Start the locally reworked engine server with a durable SQLite dev store.
# Bootstraps the ProcureFlow namespace and custom search attributes.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SRC="$ROOT/third_party/temporal"
BIN="$SRC/.build/bin"

if [[ ! -x "$BIN/engine-server" || ! -x "$BIN/procureflow-bootstrap" ]]; then
  echo "Reworked engine binaries not found; building now..."
  "$ROOT/scripts/build-engine.sh"
fi

mkdir -p "$SRC/.build"
cd "$SRC"

export WORKFLOW_ENGINE_ADDRESS="${WORKFLOW_ENGINE_ADDRESS:-127.0.0.1:7233}"
export WORKFLOW_ENGINE_NAMESPACE="${WORKFLOW_ENGINE_NAMESPACE:-default}"

"$BIN/engine-server" --allow-no-auth --config-file config/procureflow-dev.yaml start &
SERVER_PID=$!

cleanup() {
  echo
  echo "Stopping reworked engine..."
  kill "$SERVER_PID" 2>/dev/null || true
  wait "$SERVER_PID" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

# The bootstrap command retries until the server is healthy, then creates the
# namespace and idempotently registers ProcureFlow search attributes.
WORKFLOW_ENGINE_ADDRESS="$WORKFLOW_ENGINE_ADDRESS" \
WORKFLOW_ENGINE_NAMESPACE="$WORKFLOW_ENGINE_NAMESPACE" \
WORKFLOW_ENGINE_BOOTSTRAP_WAIT_SECONDS="${WORKFLOW_ENGINE_BOOTSTRAP_WAIT_SECONDS:-120}" \
"$BIN/procureflow-bootstrap" || echo "bootstrap did not complete; server is still running" >&2

wait "$SERVER_PID"
