# syntax=docker/dockerfile:1.7

FROM node:20-bookworm-slim AS base
ENV PNPM_HOME=/pnpm \
    PATH=/pnpm:$PATH \
    NEXT_TELEMETRY_DISABLED=1 \
    CI=1
RUN corepack enable && corepack prepare pnpm@10.34.5 --activate
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY apps/web/package.json apps/web/package.json
COPY apps/worker/package.json apps/worker/package.json
COPY packages/shared/package.json packages/shared/package.json
COPY packages/db/package.json packages/db/package.json
COPY packages/workflows/package.json packages/workflows/package.json
COPY packages/integrations/package.json packages/integrations/package.json
RUN pnpm install --frozen-lockfile

FROM deps AS build
COPY . .
# Build-time placeholders only. Runtime values come from the compose environment.
ENV AUTH_SECRET=build-only-placeholder \
    AUTH_URL=http://localhost:3000 \
    NEXTAUTH_URL=http://localhost:3000 \
    DATABASE_URL=postgresql://build:build@127.0.0.1:5432/build \
    DIRECT_URL=postgresql://build:build@127.0.0.1:5432/build
RUN pnpm --filter @procureflow/web build

FROM base AS web
ENV NODE_ENV=production
COPY --from=build /app ./
EXPOSE 3000
CMD ["sh", "-c", "set -eu; : \"${AUTH_SECRET:?AUTH_SECRET is required at runtime}\"; : \"${INTERNAL_API_TOKEN:?INTERNAL_API_TOKEN is required at runtime}\"; pnpm db:migrate && if [ \"${SEED_DEMO_DATA:-false}\" = \"true\" ]; then pnpm db:seed; fi && pnpm --filter @procureflow/web start"]

FROM base AS worker
ENV NODE_ENV=production
COPY --from=build /app ./
CMD ["pnpm", "--filter", "@procureflow/worker", "start"]
