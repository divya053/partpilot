# IK Part Number Portal

A full-stack part number generation and management portal for IK lighting products. Engineers use it to build, track, and manage structured part number codes across all product categories.

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
- AI capability hooks are planned — discuss requirements before implementation

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
