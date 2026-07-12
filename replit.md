# PartPilot (IK Part Number Portal)

**PartPilot** is a full-stack, AI-assisted part number generation and management portal for IK lighting products. Engineers use it to build, track, and manage structured part number codes across all product categories. (User-facing brand is "PartPilot"; workspace package names still use the original slugs.)

## Deploy

- Production deploy is Docker Compose: `db` (MySQL 8) + `api` (Node) + `web` (Caddy, static + `/api` proxy + automatic HTTPS). See [DEPLOY.md](DEPLOY.md).
- One command on a VPS: `cp deploy/.env.example .env` (edit it) then `docker compose up -d --build`.
- The API **self-migrates**: on boot it creates tables if missing and seeds master/creator/viewer if the users table is empty (`artifacts/api-server/src/lib/migrate.ts`), so a fresh database comes up working.
- The esbuild API bundle externalizes `mysql2`, so the `api` Docker stage installs just that one dependency at runtime.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — API server (port 8080, proxied at `/api`)
- `pnpm --filter @workspace/part-number-portal run dev` — Frontend (port 18880, proxied at `/`)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5, Zod validation (generated from OpenAPI)
- DB: PostgreSQL + Drizzle ORM
- Frontend: React + Vite + TanStack Query + Wouter + Recharts
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec at `lib/api-spec/openapi.yaml`)
- Build: esbuild (CJS bundle)

## Where things live

- `lib/api-spec/openapi.yaml` — source of truth for all API contracts
- `lib/db/src/schema/partNumbers.ts` — DB schema: `part_numbers` + `segment_values` tables
- `artifacts/api-server/src/routes/` — Express route handlers
- `artifacts/part-number-portal/src/` — React frontend
- `lib/api-client-react/src/generated/` — generated React Query hooks (do not edit)
- `lib/api-zod/src/generated/` — generated Zod schemas for server validation (do not edit)

## Part Number Format

`{Company}-{ProductModel}{Version}-{SizeVariant}-{PowerType}{MaxPower}-{VoltageRange}-{Dimming}-{CCT}-{LightDist}-{Driver}-{Finish}-{Manufacturer}[-optionals...]`

Example: `IK-UHB3-02-S0240-MV-D-CCT-WD-01-BK-BFU`

Optional add-ons (appended with dashes): Lens Type (L), Emergency Option (X), Sensor (Y), Surge Protection (S), Reflector Cover (R), Mounting (M), Photocontrol (P), Connectable/Sets (C), Base (B)

## Architecture decisions

- Part number string is computed server-side from individual segment fields on create/update — never stored raw then parsed
- Segment values are stored in the `segment_values` table with a `(segment_key, code)` unique constraint, seeded from the Excel template
- The builder wizard has 3 steps: Core Identity → Power & Electrical → Options & Finish; live part number string preview updates as fields are filled
- Status lifecycle: `draft` → `active` → `deprecated`

## AI layer (self-training from your own data)

- **Provider-agnostic** — every AI feature runs through `artifacts/api-server/src/lib/llm.ts`, which talks the OpenAI-compatible *chat completions* API. Configure via env (resolution order): `AI_BASE_URL` (local/Ollama/LM Studio) → `GROQ_API_KEY` (free, **default**, `https://api.groq.com/openai/v1`, model `llama-3.3-70b-versatile`) → `OPENAI_API_KEY`. Override any model with `AI_MODEL`.
- **"Self-training" = live analysis of the DB, not model training.** `artifacts/api-server/src/lib/aiContext.ts` mines the whole registry each request: status rollups, per-model learned conventions (e.g. "80% of UHB use finish BK"), segment-code usage/unused detection, duplicate/clone/stale-draft anomalies, undefined-code detection. Sharpens automatically as more parts are created.
- **Deterministic first, AI on top.** `computeInsights(ctx, scope, part)` produces suggestions + alerts that work with **no** API key. When a provider is configured, a short natural-language narrative and chat are layered on.
- AI endpoints (all under `/api/ai`): `GET /model-defaults?productModel=` (deterministic most-common segment values for a model), `GET /insights?scope=&partId=` (per-page suggestions/alerts + narrative), `POST /assistant` (data-aware chat), `POST /explain` (segment-by-segment plain-English breakdown).
- **No free-text "describe it in English → fill all fields" suggester.** It was removed because an LLM guesses/hallucinates the codes. The Builder's assist is now `SmartPrefill` — pick a product model and fill segments with the values your existing parts *actually* use (with % share), computed in DB, zero guessing.
- Frontend: global `AssistantDock` (in `layout.tsx`, scope-aware, on every page) + reusable `AiInsights` panel (`components/ai/`) embedded in Dashboard, Builder, Library, Part Detail, Segments. Builder has `SmartPrefill`; Part Detail has an AI "Explain This Part" card.

## Auth & Roles (RBAC)

- Password login with secure signed-cookie sessions. `lib/db/src/schema/users.ts` (`users` table); passwords hashed with scrypt (no external deps) in `artifacts/api-server/src/lib/auth.ts`.
- Roles & capabilities: **master** = everything incl. user management; **creator** = create/edit/duplicate parts; **viewer** = read-only. Matrix lives in `auth.ts` (`ROLE_CAPS`) and is mirrored client-side in `artifacts/part-number-portal/src/lib/auth.tsx`.
- Enforcement: `attachUser` (app.ts) loads `req.user` from the cookie; `requireAuth` gates everything except `/api/auth/*` and health; mutating routes use `requireCap("create"|"edit"|"delete"|"duplicate"|"manageSegments"|"import"|"manageUsers")`.
- Endpoints under `/api/auth`: `login`, `logout`, `me`, and `users` CRUD (master only). Seed accounts: **master/master123**, **creator/creator123**, **viewer/viewer123** (created via the one-off SQL seed — the app's `db push` needs a TTY).
- Frontend: `AuthProvider` + `useAuth().can(cap)`; the whole app is gated behind a Login page; nav, buttons, and the `/users` admin page are role-filtered. `SESSION_SECRET` env signs the cookie.
- The IK Assistant is a **know-everything advisor**: `assistantContext()` feeds it every duplicate configuration cluster, unfinished clone, stale draft, and invalid segment code, plus the user's role (so its advice matches what they're allowed to do). It never mutates data.
- **Self-training is live + instant.** All AI knowledge is recomputed from the DB per request, so it needs no training step. `GET /ai/learning-status` exposes what's been learned (parts, models, patterns, coverage, last-updated) — shown in the Dashboard "Self-Learning Model" card. `POST /ai/predict-next` returns per-field predictions conditioned on the current draft (empirical frequency among parts matching what's filled) — powers the Builder's "AI Next-Step Predictions" panel, which sharpens as more fields are set. After any create/edit/delete/segment change the frontend calls `invalidateAi(queryClient)` (`lib/ai-refresh.ts`) so every AI surface refetches immediately — the model visibly "retrains" on each new part.

## Product

- **Dashboard** — stats overview, category/model breakdown charts, recent parts list
- **Part Builder** — 3-step wizard generating part numbers in real time
- **Part Library** — searchable/filterable table of all part numbers
- **Part Detail** — full segment breakdown, edit, duplicate, status change, delete
- **Segment Config** — manage the valid codes per segment type (accordion UI)

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

- After any OpenAPI spec change, always run `pnpm --filter @workspace/api-spec run codegen` before touching route code
- Adding a new unique constraint via `pnpm --filter @workspace/db run push` requires an interactive TTY — apply via `executeSql` if adding to a table with existing data
- Do not run `pnpm dev` at the workspace root — use the managed workflows

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
