# syntax=docker/dockerfile:1

# ── Stage 1: build the whole workspace (API bundle + web static) ──────────────
FROM node:24-bookworm-slim AS builder
WORKDIR /repo

# pnpm (lockfile is v9.0 → pnpm 10 reads it fine)
RUN npm install -g pnpm@10

# Install deps first (better layer caching). Copy manifests + lockfile.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json tsconfig.json ./
COPY lib ./lib
COPY artifacts ./artifacts
COPY scripts ./scripts
RUN pnpm install --frozen-lockfile

# Base path the SPA is served under. "/" for root/subdomain deploys; set to
# e.g. "/partpilot" when mounting behind a reverse proxy subpath. Vite bakes
# this into asset URLs, the router basename, and the API request prefix.
ARG VITE_BASE_PATH=/
ENV VITE_BASE_PATH=${VITE_BASE_PATH}

# Build only what we deploy: the API bundle (esbuild) and the web app (vite).
# Libs are consumed as TypeScript source, so no separate lib build is needed.
# REPL_ID is unset here, so Replit-only vite plugins are skipped automatically.
RUN pnpm --filter @workspace/api-server run build \
 && pnpm --filter @workspace/part-number-portal run build

# ── Stage 2: API runtime (self-contained esbuild bundle, no node_modules) ─────
FROM node:24-bookworm-slim AS api
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3001
COPY --from=builder /repo/artifacts/api-server/dist ./dist
# The esbuild bundle externalizes the mysql2 driver (see build.mjs), so it must
# be present at runtime. It's the only external dependency the API actually uses.
RUN npm init -y >/dev/null 2>&1 \
 && npm install --omit=dev --no-audit --no-fund mysql2@^3.15.2
EXPOSE 3001
CMD ["node", "dist/index.mjs"]

# ── Stage 3: web (static site + Caddy reverse proxy with automatic HTTPS) ─────
FROM caddy:2-alpine AS web
COPY --from=builder /repo/artifacts/part-number-portal/dist/public /srv
COPY deploy/Caddyfile /etc/caddy/Caddyfile
EXPOSE 80 443
