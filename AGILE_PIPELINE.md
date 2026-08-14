# PartPilot — Agile Delivery Pipeline

IKIO LED part-number builder & catalog platform.
Stack: Express + mysql2 (ESM) · React + Vite + TypeScript · MySQL (XAMPP local / VPS) · deployed to `ikiousa.tech/partpilot/` via PM2 + nginx.

**Status legend:** ✅ Done (shipped & pushed) · 🟡 In Progress · ⬜ To Do / Backlog · 🧊 Icebox (nice-to-have)

_Last updated: 2026-08-14_

---

## 📊 Epic board — at a glance

| # | Epic (major task) | Status | Progress |
|---|-------------------|--------|----------|
| E1 | Foundation & Platform | ✅ Done | 7/7 |
| E2 | Part-Number Engine | ✅ Done | 5/5 |
| E3 | Catalog Management | ✅ Done | 5/5 |
| E4 | Attributes & Values | ✅ Done | 6/6 |
| E5 | Bulk Operations (ERP-grade) | 🟡 In Progress | 7/8 |
| E6 | AI Build Agent | 🟡 In Progress | 7/9 |
| E7 | Insights & Reporting | 🟡 In Progress | 4/6 |
| E8 | Quality, Hardening & UX Polish | ⬜ Backlog | 1/7 |

**Overall: 42 / 53 subtasks complete (~79%)**

---

## E1 · Foundation & Platform ✅

> Goal: a running, secure, deployable app skeleton.

- ✅ **E1.1 Backend scaffolding** — Express + mysql2 (plain-JS ESM) API on :4100
  - ✅ DB pool / query helpers (`db.js`)
  - ✅ Static SPA serving + `/api` routing
- ✅ **E1.2 Database schema & migrations** — `migrate.js` (tables, JSON columns, `ensureColumn`)
  - ✅ `segment_values`, `segment_overrides`, `part_numbers`, catalog tables, `users`
  - ✅ Idempotent migrate + seed on boot
- ✅ **E1.3 Authentication** — session login, seeded demo logins
- ✅ **E1.4 RBAC** — `master` / `creator` / `viewer` roles, capability gates (`can`, `requireCap`)
- ✅ **E1.5 Frontend scaffolding** — Vite + React + TS, `api` client, toast, auth context
- ✅ **E1.6 Layout, navigation & routing** — sidebar, pages, protected routes
- ✅ **E1.7 Deployment / DevOps** — GitHub `divya053/partpilot`, PM2, nginx subpath (`/partpilot/`), build pipeline

---

## E2 · Part-Number Engine ✅

> Goal: assemble, validate and decode IKIO part numbers correctly.

- ✅ **E2.1 Segment model** — `CORE_SEGMENTS` + `OPTIONAL_SEGMENTS`, ordering, add-on letters
- ✅ **E2.2 Assembly** — `buildPartNumber()` (`IK-{model}{version}-{size}-{power}-…`)
- ✅ **E2.3 Live duplicate + similarity check** — `/part-numbers/check`, red alert + same-series list
- ✅ **E2.4 Decode** — decode known & unknown part numbers positionally
- ✅ **E2.5 Version / Variant split** — one Excel column → two smart dropdowns (numeric Version vs lettered Variant), same slot, family-filtered, no format/DB change

---

## E3 · Catalog Management ✅

> Goal: manage the master data behind part numbers.

- ✅ **E3.1 Companies** — CRUD (generic `crudRouter`)
- ✅ **E3.2 Products** — CRUD incl. model-code mapping
- ✅ **E3.3 Categories** — CRUD
- ✅ **E3.4 Templates** — preset segment layouts for the builder
- ✅ **E3.5 Catalog → Builder wiring** — pick a product → auto-fills Category & Model; datalist in builder

---

## E4 · Attributes & Values ✅

> Goal: manage every code, description and per-product meaning that feeds the builder.

- ✅ **E4.1 Attributes page** — view/edit segment label & help (`segment_overrides`), Excel import, key locked
- ✅ **E4.2 Units & Values — codes & descriptions** — per-segment table, add/edit/delete, active toggle
- ✅ **E4.3 Per-product meanings** — `model_descriptions` editor (same code, different meaning per model)
- ✅ **E4.4 Grid (matrix) editor** — codes × products spreadsheet grid, column toggles, save-all
- ✅ **E4.5 Excel import (values)** — one-sheet-per-segment auto-detect + single-sheet column mapping; prefilled template
- ✅ **E4.6 Clarity / UX pass** — dismissible "What is this page?" explainer, per-segment context strip, tab counts, plain-language labels, refresh-after-import

---

## E5 · Bulk Operations (ERP-grade) 🟡

> Goal: NetSuite-level ease — bulk edit, mass update, and bulk upload everywhere.

- ✅ **E5.1 Generic bulk import + column mapping** — `ImportWizard`, upsert by key, prefilled template (catalog pages)
- ✅ **E5.2 Sync / mirror mode** — delete records missing from the file (delete-permission gated)
- ✅ **E5.3 Multi-select + mass update** — checkboxes, tri-state select-all, `BulkBar` set-field-across-selection
  - ✅ Server `bulk-update` (parts + generic crud)
  - ✅ Library mass-set Status / Stage / Category / Company
- ✅ **E5.4 Bulk delete selected** — `bulk-delete` endpoints, counted confirm, role-gated
- ✅ **E5.5 Bulk Excel/CSV upload for Part Numbers** — keyless upsert by generated part number; wizard `keyless` + `getExisting`
- ✅ **E5.6 Inline (click-to-edit) cells** — `InlineEdit`; Library (product/company/category/status) + catalog via `ColumnDef.editKey`
- ✅ **E5.7 CSV export on catalog pages** — client-side export of filtered rows
- ⬜ **E5.8 Templates page bulk features** — Templates is a bespoke page; still needs selection / mass-update / inline edit

---

## E6 · AI Build Agent 🟡

> Goal: conversational, data-grounded part-number building, grounded in the Excel logic.

- ✅ **E6.1 Reasoning engine** (`agent.js`) — applicability matrix + per-model meaning + real co-occurrence
  - ✅ `validate()` (warn-but-allow), `guide()` (next-best-step), family-appropriate ranking
- ✅ **E6.2 Chat endpoint** — `POST /ai/agent` (+ `/agent/check`), Groq-grounded with deterministic fallback
  - ✅ Guardrails: never overwrite user choices, no invented add-ons, reject out-of-family picks, user words win
- ✅ **E6.3 Chat UI** (`AgentChat.tsx`) — thread auto-applies validated fields, next-step chips, warnings
- ✅ **E6.4 Progressive suggestions** — most-used-here per field, narrows as fields fill
- ✅ **E6.5 Auto-filter dropdowns by product model** — `optsFor` applicability filtering
- ✅ **E6.6 Plain-English auto-fill** — describe fixture → validated segment codes
- ✅ **E6.7 Explain part number** — plain-English narrative (grounded)
- 🟡 **E6.8 Self-training loop** — stats improve as parts are added; needs periodic `recomputeUsage` + data-quality backfill
- ⬜ **E6.9 Data-quality backfill** — codes with empty applicability (e.g. `0A`) can't be agent-picked; import per-family meanings so families resolve

---

## E7 · Insights & Reporting 🟡

> Goal: visibility into the registry and activity.

- ✅ **E7.1 Dashboard** — quick build, counts, deep-link cards
- ✅ **E7.2 Reports page** — registry views
- ✅ **E7.3 Audit log** — who changed what (`audit.js`, bulk actions logged)
- ✅ **E7.4 Data-grounded insights** — duplicates, drafts/temporary, unused codes, top driver
- ⬜ **E7.5 Advanced reports & filters** — saved filters, group-by, export of report views
- ⬜ **E7.6 Analytics charts** — trends over time (parts created, by series/category)

---

## E8 · Quality, Hardening & UX Polish ⬜

> Goal: production robustness and long-term ease of use.

- ✅ **E8.1 Type-safety gate** — `tsc --noEmit` clean on every change
- ⬜ **E8.2 Automated tests** — API integration tests (bulk endpoints, agent, part-number assembly) + smoke E2E
- ⬜ **E8.3 Saved views / user preferences** — remember filters, columns, page size per user
- ⬜ **E8.4 Column customization** — show/hide/reorder columns on data tables
- ⬜ **E8.5 Mobile / responsive polish** — tables scroll containers, condensed toolbars
- ⬜ **E8.6 Bulk-op safety rails** — undo window / soft-delete for mass delete; progress bar for large imports
- 🧊 **E8.7 Localization & theming** — light/dark, i18n scaffolding

---

## 🗺️ Delivery timeline (sprints)

| Sprint | Theme | Key deliverables | Status |
|--------|-------|------------------|--------|
| S1 | Foundation | App skeleton, auth, RBAC, deploy | ✅ |
| S2 | Engine + Catalog | Part-number format, catalog CRUD, builder | ✅ |
| S3 | Attributes & Values | Codes, per-model meanings, matrix, Excel import | ✅ |
| S4 | Builder intelligence | Suggestions, auto-filter, plain-descriptions, Version/Variant split | ✅ |
| S5 | AI Build Agent | Reasoning engine + chat agent + guardrails | ✅ |
| S6 | ERP bulk ops | Multi-select, mass update, bulk delete, parts upload, inline edit, export | ✅ |
| S7 | Clarity pass | Units & Values self-explanatory UX | ✅ |
| S8 | Hardening (next) | Templates bulk, tests, saved views, data-quality backfill | ⬜ |

---

## 🎯 Next sprint candidates (prioritized backlog)

1. ⬜ **E5.8** — Templates page: bring it onto the shared bulk toolkit (select / mass-update / inline edit).
2. ⬜ **E6.9** — Data-quality backfill so every valid code resolves to its family (unlocks fuller agent auto-pick).
3. ⬜ **E8.2** — Automated tests around bulk endpoints + agent (protect the ERP flows).
4. ⬜ **E8.3 / E8.4** — Saved views + column customization (per-user ERP ergonomics).
5. ⬜ **E7.5 / E7.6** — Advanced reports & trend charts.

---

_This pipeline reflects the actual shipped state of the `divya053/partpilot` `main` branch. Update statuses as items move; keep the epic-board counts and the overall % in sync._
