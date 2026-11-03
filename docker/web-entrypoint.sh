#!/bin/sh
set -eu
umask 077

DATA_DIR="${DATA_DIR:-/app/.data}"
mkdir -p "$DATA_DIR"

# Coolify often injects secrets only at runtime. Generate stable fallbacks on
# first boot and persist them in the runtime volume so sessions survive restarts.
secret_value() {
  file="$1"
  provided="${2:-}"

  if [ -n "$provided" ]; then
    printf '%s' "$provided"
    return 0
  fi

  if [ -s "$file" ]; then
    cat "$file"
    return 0
  fi

  generated="$(node -e 'process.stdout.write(require("node:crypto").randomBytes(32).toString("base64"))')"
  printf '%s' "$generated" > "$file"
  printf '%s' "$generated"
}

if [ -z "${AUTH_SECRET:-}" ]; then
  AUTH_SECRET="$(secret_value "$DATA_DIR/auth-secret")"
  export AUTH_SECRET
fi

if [ -z "${INTERNAL_API_TOKEN:-}" ]; then
  INTERNAL_API_TOKEN="$(secret_value "$DATA_DIR/internal-api-token")"
  export INTERNAL_API_TOKEN
fi

pnpm db:migrate

if [ "${SEED_DEMO_DATA:-false}" = "true" ]; then
  pnpm db:seed
fi

exec pnpm --filter @procureflow/web start
