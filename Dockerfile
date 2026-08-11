# syntax=docker/dockerfile:1

FROM node:22-bookworm-slim AS dependencies
WORKDIR /app

RUN npm install --global pnpm@11.16.0
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

FROM dependencies AS builder
COPY . .
RUN pnpm build

FROM node:22-bookworm-slim AS runner
WORKDIR /app

ENV NODE_ENV=production \
    HOSTNAME=0.0.0.0 \
    PORT=3000 \
    WRANGLER_WRITE_LOGS=false \
    WRANGLER_LOG_PATH=/app/.wrangler/logs \
    MINIFLARE_REGISTRY_PATH=/app/.wrangler/registry

RUN npm install --global pnpm@11.16.0 \
    && mkdir -p /app/.wrangler \
    && chown -R node:node /app

COPY --from=builder --chown=node:node /app /app

USER node
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"

CMD ["pnpm", "exec", "vinext", "start", "--hostname", "0.0.0.0", "--port", "3000"]
