#!/usr/bin/env bash
# Build the locally reworked Temporal server from third_party/temporal.
#
# Requirements: Go 1.27+ (the repo's go.mod toolchain is honored via GOTOOLCHAIN).
# Output: third_party/temporal/.build/bin/{temporal-server,procureflow-bootstrap}
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SRC="$ROOT/third_party/temporal"
OUT="$SRC/.build/bin"

if [[ ! -f "$SRC/go.mod" ]]; then
  echo "third_party/temporal not found. Restore the vendored Temporal tree first." >&2
  exit 1
fi

if [[ -x "$ROOT/.tools/go/go/bin/go" ]]; then
  GO="${GO:-$ROOT/.tools/go/go/bin/go}"
else
  GO="${GO:-go}"
fi

mkdir -p "$OUT"
export CGO_ENABLED=0
export GOTOOLCHAIN="${GOTOOLCHAIN:-auto}"

echo "==> building Temporal server from $SRC"
(cd "$SRC" && "$GO" build -trimpath -ldflags "-s -w" -o "$OUT/temporal-server" ./cmd/server)

echo "==> building ProcureFlow Temporal bootstrap"
(cd "$SRC" && "$GO" build -trimpath -ldflags "-s -w" -o "$OUT/procureflow-bootstrap" ./cmd/tools/procureflow-bootstrap)

echo "==> built:"
ls -lh "$OUT/temporal-server" "$OUT/procureflow-bootstrap"
echo
echo "Run it with: pnpm temporal:dev"
