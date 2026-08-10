# syntax=docker/dockerfile:1

FROM oven/bun:1.3.14-alpine AS base
WORKDIR /app

# Install workspace dependencies once, then share across targets.
FROM base AS deps
COPY package.json bun.lock ./
COPY apps/server/package.json apps/server/
COPY apps/web/package.json apps/web/
COPY packages/bot/package.json packages/bot/
COPY packages/cards/package.json packages/cards/
COPY packages/engine/package.json packages/engine/
COPY packages/evaluator/package.json packages/evaluator/
COPY packages/host/package.json packages/host/
COPY packages/protocol/package.json packages/protocol/
RUN bun install --frozen-lockfile

FROM deps AS build
COPY . .
# Browser-facing URLs are baked into the Vite client bundle at build time.
ARG VITE_API_URL=http://localhost:3001
ARG VITE_WS_URL=ws://localhost:3001
ARG VITE_TURNSTILE_SITE_KEY=
ENV VITE_API_URL=$VITE_API_URL \
    VITE_WS_URL=$VITE_WS_URL \
    VITE_TURNSTILE_SITE_KEY=$VITE_TURNSTILE_SITE_KEY
RUN bun run --cwd apps/web build

# --- API / WebSocket server -------------------------------------------------
FROM base AS server
ENV NODE_ENV=production
COPY --from=build /app /app
COPY docker/server-entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh
EXPOSE 3001
HEALTHCHECK --interval=10s --timeout=3s --start-period=20s --retries=5 \
  CMD bun -e "const r=await fetch('http://127.0.0.1:3001/health'); if(!r.ok) process.exit(1)"
ENTRYPOINT ["/entrypoint.sh"]

# --- Web UI -----------------------------------------------------------------
FROM base AS web
ENV NODE_ENV=production
COPY --from=build /app /app
WORKDIR /app/apps/web
EXPOSE 3000
HEALTHCHECK --interval=10s --timeout=3s --start-period=15s --retries=5 \
  CMD bun -e "const r=await fetch('http://127.0.0.1:3000/'); if(!r.ok) process.exit(1)"
CMD ["bun", "--bun", "vite", "preview", "--host", "0.0.0.0", "--port", "3000"]
