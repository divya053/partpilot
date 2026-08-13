import express from "express";
import { pool, q, one } from "../db.js";
import { requireCap, can } from "../auth.js";
import { logAudit } from "../audit.js";
import { buildPartNumber, partSegments, ALL_KEYS } from "../segments.js";

const router = express.Router();

const snake = (s) => s.replace(/[A-Z]/g, (m) => "_" + m.toLowerCase());
const camel = (s) => s.replace(/_([a-z])/g, (_, c) => c.toUpperCase());

// Fields the client may send (camelCase). Segment keys + product metadata.
const META_FIELDS = [
  "productCategory", "productName", "sku", "productDescription", "internalNotes",
  "vendorName", "productStage", "vendorSpecSheet", "ikioSpecSheet", "image", "companyId",
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

// ─── Live duplicate + similarity check (no save) ─────────────────────────────
// Powers the builder's red "already exists" alert and the "similar existing
// part numbers" list (same product model / series). `excludeId` skips the part
// being edited so it doesn't flag itself.
router.post("/check", async (req, res) => {
  const data = pickWritable(req.body || {});
  const partNumber = buildPartNumber(data);
  const excludeId = Number(req.body?.excludeId) || null;
  const mapLite = (r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [camel(k), v]));

  const existing = await one(
    `SELECT id, part_number, product_name, status, created_by, created_at
     FROM part_numbers WHERE part_number = ? ${excludeId ? "AND id != ?" : ""} LIMIT 1`,
    excludeId ? [partNumber, excludeId] : [partNumber],
  );

  // Similar = same product model (series), most recent first.
  const model = data.productModel || "";
  let similar = [];
  if (model) {
    const params = [model];
    let sql =
      `SELECT p.id, p.part_number, p.product_name, p.status, p.product_category,
              p.version_variant, p.size_variant, p.max_power, p.voltage_range,
              p.image, p.created_at, c.name AS company_name
       FROM part_numbers p LEFT JOIN companies c ON c.id = p.company_id
       WHERE p.product_model = ?`;
    if (excludeId) { sql += " AND p.id != ?"; params.push(excludeId); }
    if (existing) { sql += " AND p.part_number != ?"; params.push(partNumber); }
    sql += " ORDER BY p.id DESC LIMIT 12";
    similar = (await q(sql, params)).map(mapLite);
  }

  res.json({ partNumber, duplicate: !!existing, existing: existing ? mapLite(existing) : null, similar });
});

// ─── Bulk: mass-update selected parts ────────────────────────────────────────
// Apply the same field(s) to many parts at once (NetSuite-style mass update).
// part_number is recomputed per row from its merged segment fields.
router.post("/bulk-update", requireCap("write"), async (req, res) => {
  const { ids, patch } = req.body || {};
  if (!Array.isArray(ids) || !ids.length) return res.status(400).json({ error: "ids[] required" });
  const data = pickWritable(patch || {});
  if (!Object.keys(data).length) return res.status(400).json({ error: "No writable fields in patch" });

  let updated = 0;
  for (const id of ids) {
    const existing = await one("SELECT * FROM part_numbers WHERE id = ?", [id]);
    if (!existing) continue;
    const partNumber = buildPartNumber({ ...toRow(existing), ...data });
    const sets = [], params = [];
    for (const [k, v] of Object.entries(data)) { sets.push(`${snake(k)} = ?`); params.push(JSON_FIELDS.includes(k) ? JSON.stringify(v) : v); }
    sets.push("part_number = ?"); params.push(partNumber, id);
    await pool.query(`UPDATE part_numbers SET ${sets.join(", ")} WHERE id = ?`, params);
    updated++;
  }
  await logAudit(req, "Part Number", "Bulk updated", `Mass-updated ${updated} part(s): ${Object.keys(data).join(", ")}`);
  res.json({ updated });
});

// ─── Bulk: delete selected parts ─────────────────────────────────────────────
router.post("/bulk-delete", requireCap("delete"), async (req, res) => {
  const { ids } = req.body || {};
  if (!Array.isArray(ids) || !ids.length) return res.status(400).json({ error: "ids[] required" });
  const nums = ids.map(Number).filter(Boolean);
  if (!nums.length) return res.status(400).json({ error: "no valid ids" });
  const [result] = await pool.query(`DELETE FROM part_numbers WHERE id IN (${nums.map(() => "?").join(",")})`, nums);
  await logAudit(req, "Part Number", "Bulk deleted", `Deleted ${result.affectedRows} part(s)`);
  res.json({ deleted: result.affectedRows });
});

// ─── Bulk: import parts from a spreadsheet (upsert by generated part number) ──
// Each row's part_number is computed from its segment fields; existing parts
// (same number) are updated, new ones inserted. Optional deleteMissing mirrors
// the file exactly (gated by delete permission).
router.post("/bulk", requireCap("write"), async (req, res) => {
  const { rows, deleteMissing } = req.body || {};
  if (!Array.isArray(rows)) return res.status(400).json({ error: "rows[] required" });
  if (deleteMissing && !can(req.user?.role, "delete")) return res.status(403).json({ error: "Your role can't delete records." });

  let created = 0, updated = 0, deleted = 0;
  const errors = [];
  const present = new Set();
  for (let i = 0; i < rows.length; i++) {
    try {
      const data = pickWritable(rows[i] || {});
      const partNumber = buildPartNumber(data);
      present.add(partNumber);
      const existing = await one("SELECT id FROM part_numbers WHERE part_number = ?", [partNumber]);
      if (existing) {
        const sets = [], params = [];
        for (const [k, v] of Object.entries(data)) { sets.push(`${snake(k)} = ?`); params.push(JSON_FIELDS.includes(k) ? JSON.stringify(v) : v); }
        if (sets.length) { params.push(existing.id); await pool.query(`UPDATE part_numbers SET ${sets.join(", ")} WHERE id = ?`, params); }
        updated++;
      } else {
        const cols = ["part_number", ...Object.keys(data).map(snake)];
        const vals = [partNumber, ...Object.keys(data).map((k) => JSON_FIELDS.includes(k) ? JSON.stringify(data[k]) : data[k])];
        if (!cols.includes("created_by")) { cols.push("created_by"); vals.push(req.user?.display_name || "Import"); }
        await pool.query(`INSERT INTO part_numbers (${cols.join(", ")}) VALUES (${cols.map(() => "?").join(", ")})`, vals);
        created++;
      }
    } catch (e) { errors.push({ row: i + 1, error: e.message }); }
  }
  if (deleteMissing && present.size) {
    const arr = [...present];
    const [r] = await pool.query(`DELETE FROM part_numbers WHERE part_number NOT IN (${arr.map(() => "?").join(",")})`, arr);
    deleted = r.affectedRows;
  }
  await logAudit(req, "Part Number", "Bulk import", `Imported parts: ${created} created, ${updated} updated, ${deleted} deleted`);
  res.json({ created, updated, deleted, errors });
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
