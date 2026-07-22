import express from "express";
import { pool, q, one } from "../db.js";
import { requireCap } from "../auth.js";
import { logAudit } from "../audit.js";
import { buildPartNumber, partSegments, ALL_KEYS } from "../segments.js";

const router = express.Router();

const snake = (s) => s.replace(/[A-Z]/g, (m) => "_" + m.toLowerCase());
const camel = (s) => s.replace(/_([a-z])/g, (_, c) => c.toUpperCase());

// Fields the client may send (camelCase). Segment keys + product metadata.
const META_FIELDS = [
  "productCategory", "productName", "sku", "productDescription", "internalNotes",
  "vendorName", "productStage", "vendorSpecSheet", "ikioSpecSheet", "companyId",
  "status", "createdBy",
];
const JSON_FIELDS = ["certificates"];
const WRITABLE = [...ALL_KEYS, ...META_FIELDS, ...JSON_FIELDS];

function toRow(row) {
  if (!row) return row;
  const out = {};
  for (const [k, v] of Object.entries(row)) {
    let val = v;
    if (JSON_FIELDS.includes(camel(k)) && typeof v === "string") {
      try { val = JSON.parse(v); } catch { /* ignore */ }
    }
    out[camel(k)] = val;
  }
  // Preserve the joined company name under both keys the UI reads.
  if ("company_name" in row) out.company_name = row.company_name;
  out.segments = partSegments(out);
  return out;
}

function pickWritable(body) {
  const data = {};
  for (const key of WRITABLE) {
    if (key in body) data[key] = body[key];
  }
  // companyId is an INT FK — an empty selection must be NULL, not "" (→ 0).
  if ("companyId" in data && (data.companyId === "" || data.companyId == null)) {
    data.companyId = null;
  }
  return data;
}

// ─── Preview: generate a part number without saving ──────────────────────────
router.post("/generate", (req, res) => {
  const pn = buildPartNumber(req.body || {});
  res.json({ partNumber: pn, segments: partSegments(req.body || {}) });
});

// ─── List (search + filters + pagination) ────────────────────────────────────
router.get("/", async (req, res) => {
  const { search, company, status, category, page = 1, pageSize = 20 } = req.query;
  const where = [];
  const params = [];
  if (search) {
    where.push("(part_number LIKE ? OR product_name LIKE ? OR product_description LIKE ?)");
    params.push(`%${search}%`, `%${search}%`, `%${search}%`);
  }
  if (company && company !== "all") { where.push("company_id = ?"); params.push(company); }
  if (status && status !== "all") { where.push("status = ?"); params.push(status); }
  if (category && category !== "all") { where.push("product_category = ?"); params.push(category); }
  const whereSql = where.length ? "WHERE " + where.join(" AND ") : "";

  const total = (await one(`SELECT COUNT(*) AS c FROM part_numbers ${whereSql}`, params)).c;
  const limit = Math.min(Number(pageSize) || 20, 200);
  const offset = (Math.max(Number(page) || 1, 1) - 1) * limit;
  const rows = await q(
    `SELECT p.*, c.name AS company_name FROM part_numbers p
     LEFT JOIN companies c ON c.id = p.company_id
     ${whereSql} ORDER BY p.id DESC LIMIT ? OFFSET ?`,
    [...params, limit, offset],
  );
  res.json({ data: rows.map(toRow), total, page: Number(page), pageSize: limit });
});

// ─── Get one ─────────────────────────────────────────────────────────────────
router.get("/:id", async (req, res) => {
  const row = await one(
    `SELECT p.*, c.name AS company_name FROM part_numbers p
     LEFT JOIN companies c ON c.id = p.company_id WHERE p.id = ?`,
    [req.params.id],
  );
  if (!row) return res.status(404).json({ error: "Not found" });
  res.json(toRow(row));
});

// ─── Create ──────────────────────────────────────────────────────────────────
router.post("/", requireCap("write"), async (req, res) => {
  const data = pickWritable(req.body);
  const partNumber = buildPartNumber(data);
  const dupe = await one("SELECT id FROM part_numbers WHERE part_number = ?", [partNumber]);
  if (dupe) return res.status(409).json({ error: `Part number ${partNumber} already exists`, existingId: dupe.id });

  const cols = ["part_number", ...Object.keys(data).map(snake)];
  const vals = [partNumber, ...Object.keys(data).map((k) =>
    JSON_FIELDS.includes(k) ? JSON.stringify(data[k]) : data[k])];
  if (!cols.includes("created_by")) { cols.push("created_by"); vals.push(req.user?.display_name || "System"); }

  const [result] = await pool.query(
    `INSERT INTO part_numbers (${cols.join(", ")}) VALUES (${cols.map(() => "?").join(", ")})`,
    vals,
  );
  const row = await one("SELECT * FROM part_numbers WHERE id = ?", [result.insertId]);
  await logAudit(req, "Part Number", "Created", `Created part number ${partNumber}`);
  res.status(201).json(toRow(row));
});

// ─── Update ──────────────────────────────────────────────────────────────────
router.patch("/:id", requireCap("write"), async (req, res) => {
  const existing = await one("SELECT * FROM part_numbers WHERE id = ?", [req.params.id]);
  if (!existing) return res.status(404).json({ error: "Not found" });

  const data = pickWritable(req.body);
  // Recompute part_number from the merged segment fields.
  const merged = { ...toRow(existing), ...data };
  const partNumber = buildPartNumber(merged);

  const sets = [];
  const params = [];
  for (const [k, v] of Object.entries(data)) {
    sets.push(`${snake(k)} = ?`);
    params.push(JSON_FIELDS.includes(k) ? JSON.stringify(v) : v);
  }
  sets.push("part_number = ?");
  params.push(partNumber);
  params.push(req.params.id);
  await pool.query(`UPDATE part_numbers SET ${sets.join(", ")} WHERE id = ?`, params);

  const row = await one("SELECT * FROM part_numbers WHERE id = ?", [req.params.id]);
  await logAudit(req, "Part Number", "Updated", `Updated ${partNumber}`);
  res.json(toRow(row));
});

// ─── Duplicate ───────────────────────────────────────────────────────────────
router.post("/:id/duplicate", requireCap("write"), async (req, res) => {
  const src = await one("SELECT * FROM part_numbers WHERE id = ?", [req.params.id]);
  if (!src) return res.status(404).json({ error: "Not found" });
  // Suffix the SKU-less clone with an incrementing marker on internal_notes.
  const base = src.part_number;
  let candidate = `${base}-COPY`;
  let n = 1;
  while (await one("SELECT id FROM part_numbers WHERE part_number = ?", [candidate])) {
    n += 1; candidate = `${base}-COPY${n}`;
  }
  const cols = Object.keys(src).filter((k) => k !== "id" && k !== "created_at" && k !== "updated_at");
  const vals = cols.map((c) => (c === "part_number" ? candidate : c === "status" ? "draft" : src[c]));
  const [result] = await pool.query(
    `INSERT INTO part_numbers (${cols.join(", ")}) VALUES (${cols.map(() => "?").join(", ")})`,
    vals,
  );
  const row = await one("SELECT * FROM part_numbers WHERE id = ?", [result.insertId]);
  await logAudit(req, "Part Number", "Duplicated", `Duplicated ${base} → ${candidate}`);
  res.status(201).json(toRow(row));
});

// ─── Delete ──────────────────────────────────────────────────────────────────
router.delete("/:id", requireCap("delete"), async (req, res) => {
  const row = await one("SELECT * FROM part_numbers WHERE id = ?", [req.params.id]);
  if (!row) return res.status(404).json({ error: "Not found" });
  await pool.query("DELETE FROM part_numbers WHERE id = ?", [req.params.id]);
  await logAudit(req, "Part Number", "Deleted", `Deleted ${row.part_number}`);
  res.json({ ok: true });
});

export default router;
