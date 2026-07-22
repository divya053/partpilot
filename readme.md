# PartPilot — IKIO Part Number Builder

A full-stack app to **create, manage and track IKIO LED lighting part numbers**, styled after
the IKIO green mockups. It uses the **real 22-segment IKIO format** (e.g.
`IK-UHB3-02-S0240-MV-D-CCT-WD-01-BK-BFU-MWS`), seeded from the Excel master, with full CRUD,
role-based login, audit logging, and a free/local AI assistant.

```
PartPilot/
├─ server/   Node + Express + MySQL (mysql2) API — self-migrates & self-seeds
├─ client/   React + Vite + TypeScript SPA (green IKIO theme)
└─ PART_Number_Builder_Template_Divya_...xlsx   source workbook (already imported)
```

---

## 1. Prerequisites

- **XAMPP** running **MySQL** (MariaDB) — via the XAMPP Control Panel.
- A database named **`partpilot`** (already created in your phpMyAdmin).
- **Node.js 18+** (tested on Node 22).

Default XAMPP MySQL credentials (`root` / no password) are pre-configured in `server/.env`.
If yours differ, edit `server/.env`.

## 2. Run it (two terminals)

**Terminal 1 — API** (port 4100):
```bash
cd server
npm install
npm start
```
On first boot it creates all tables and seeds **219 segment values**, **193 real part numbers**,
6 companies, categories, products, templates and 3 demo users.

**Terminal 2 — Web app** (port 5173):
```bash
cd client
npm install
npm run dev
```
Open **http://localhost:5173**.

> Windows shortcut: double-click **`start.bat`** to launch both at once.

## 3. Demo logins

| Role    | Username  | Password    | Can do                                             |
|---------|-----------|-------------|----------------------------------------------------|
| Master  | `master`  | `master123` | Everything incl. user management, delete, settings |
| Creator | `creator` | `creator123`| Create / edit / import part numbers                |
| Viewer  | `viewer`  | `viewer123` | Read-only                                          |

---

## Features (maps to the readme key points)

- **Textual keys with descriptions** — every builder dropdown shows the **code + plain-English
  description** (e.g. driver `03 — Moso`, `04 — Meanwell`). Numeric codes always carry a meaning.
- **Driver details** — driver codes resolve to their real brand (Moso, Sosen, Inventronics,
  Meanwell…); shown in the builder hint, part detail, and dashboard "Top Drivers".
- **Fields after manufacturer (BFU)** — the 9 optional add-on segments (Lens, Emergency, Sensor,
  Surge, Reflector, Mounting, Photocontrol, Connectable, Base) plus product metadata.
- **Vendor spec sheet & IKIO spec sheet** — dedicated link fields on the builder and part detail.
- **Bright Future** — manufacturer `BFU` is labelled **"Bright Future (BFU)"**.
- **More AI** — dashboard insights, an "explain this part number" button, and a floating
  advisory assistant on every page (free/local provider, graceful deterministic fallback).
- **UI/UX** — clean IKIO green theme across all pages.

### Pages
Dashboard · Part Number Builder · Part Number Library · Part Detail · Companies · Products ·
Categories · Attributes · Units & Values · Templates · Reports · Import/Export · User Management ·
Audit Log · Settings — all with full CRUD where applicable.

### AI (optional, free/local)

Works out of the box with **deterministic, data-grounded insights** (no key needed). To enable
AI narratives, add one of these to `server/.env` and restart the API:

- `GROQ_API_KEY=...` (free — https://console.groq.com/keys), or
- `AI_BASE_URL=http://localhost:11434/v1` for a local Ollama/LM Studio endpoint.

---

## The part-number format (22 segments)

```
IK - {model}{version} - {size} - {powerType}{maxPower} - {voltage} - {dimming}
   - {cct} - {distribution} - {driver} - {finish} - {manufacturer}
   [ - optional add-ons: Lens, Emergency, Sensor, Surge, Reflector, Mounting,
       Photocontrol, Connectable, Base ]
```

Segment codes and descriptions live in the `segment_values` table (editable in **Units & Values**).
Re-seed any time with `cd server && npm run seed` (skips tables that already have data).

## Reset the database

Drop the tables in phpMyAdmin (or `DROP DATABASE partpilot; CREATE DATABASE partpilot;`) and
restart the API — it recreates and reseeds automatically.

## Ports

| Service | Port | Change in                                                                   |
|---------|------|-----------------------------------------------------------------------------|
| API     | 4100 | `server/.env`                                                               |
| Web     | 5173 | `client/vite.config.ts` (also update the proxy target if you move the API)  |
