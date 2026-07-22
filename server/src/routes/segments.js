import express from "express";
import { pool, q, one } from "../db.js";
import { requireCap } from "../auth.js";
import { logAudit } from "../audit.js";
import { CORE_SEGMENTS, OPTIONAL_SEGMENTS, ALL_SEGMENTS } from "../segments.js";

const router = express.Router();

const parse = (r) => {
  if (r && typeof r.applicable_products === "string") {
    try { r.applicable_products = JSON.parse(r.applicable_products); } catch { r.applicable_products = []; }
  }
  return r;
};

// Segment definitions/metadata (for the Attributes page + builder ordering)
router.get("/meta", (_req, res) => {
  res.json({ core: CORE_SEGMENTS, optional: OPTIONAL_SEGMENTS, all: ALL_SEGMENTS });
});

// All values grouped by segmentKey (for the builder dropdowns)
router.get("/values/grouped", async (_req, res) => {
  const rows = await q(
    "SELECT * FROM segment_values WHERE is_active = 1 ORDER BY segment_key, sort_order, code",
  );
  const grouped = {};
  for (const r of rows.map(parse)) {
    (grouped[r.segment_key] ||= []).push(r);
  }
  res.json(grouped);
});

// Attributes summary: count of values per segment
router.get("/summary", async (_req, res) => {
  const counts = await q(
    "SELECT segment_key, COUNT(*) AS value_count, SUM(is_active) AS active_count FROM segment_values GROUP BY segment_key",
  );
  const map = Object.fromEntries(counts.map((c) => [c.segment_key, c]));
  res.json(
    ALL_SEGMENTS.map((s) => ({
      ...s,
      required: CORE_SEGMENTS.some((c) => c.key === s.key),
      valueCount: Number(map[s.key]?.value_count || 0),
      activeCount: Number(map[s.key]?.active_count || 0),
    })),
  );
});

// List values (optionally by segment / search)
router.get("/values", async (req, res) => {
  const { segmentKey, search } = req.query;
  const where = [];
  const params = [];
  if (segmentKey && segmentKey !== "all") { where.push("segment_key = ?"); params.push(segmentKey); }
  if (search) { where.push("(code LIKE ? OR description LIKE ?)"); params.push(`%${search}%`, `%${search}%`); }
  const rows = await q(
    `SELECT * FROM segment_values ${where.length ? "WHERE " + where.join(" AND ") : ""}
     ORDER BY segment_key, sort_order, code`,
    params,
  );
  res.json(rows.map(parse));
});

router.post("/values", requireCap("write"), async (req, res) => {
  const { segmentKey, code, description, sortOrder = 0, isActive = true, applicableProducts = [] } = req.body;
  if (!segmentKey || !code) return res.status(400).json({ error: "segmentKey and code are required" });
  const dupe = await one("SELECT id FROM segment_values WHERE segment_key = ? AND code = ?", [segmentKey, code]);
  if (dupe) return res.status(409).json({ error: `${code} already exists for ${segmentKey}` });
  const [result] = await pool.query(
    `INSERT INTO segment_values (segment_key, code, description, applicable_products, sort_order, is_active)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [segmentKey, code, description || code, JSON.stringify(applicableProducts), sortOrder, isActive ? 1 : 0],
  );
  const row = await one("SELECT * FROM segment_values WHERE id = ?", [result.insertId]);
  await logAudit(req, "Segment", "Created", `Added ${segmentKey} value ${code}`);
  res.status(201).json(parse(row));
});

router.patch("/values/:id", requireCap("write"), async (req, res) => {
  const allowed = ["code", "description", "sortOrder", "isActive", "applicableProducts"];
  const colMap = { sortOrder: "sort_order", isActive: "is_active", applicableProducts: "applicable_products" };
  const sets = [];
  const params = [];
  for (const key of allowed) {
    if (!(key in req.body)) continue;
    const col = colMap[key] || key;
    let val = req.body[key];
    if (key === "isActive") val = val ? 1 : 0;
    if (key === "applicableProducts") val = JSON.stringify(val);
    sets.push(`${col} = ?`);
    params.push(val);
  }
  if (!sets.length) return res.status(400).json({ error: "No fields to update" });
  params.push(req.params.id);
  await pool.query(`UPDATE segment_values SET ${sets.join(", ")} WHERE id = ?`, params);
  const row = await one("SELECT * FROM segment_values WHERE id = ?", [req.params.id]);
  if (!row) return res.status(404).json({ error: "Not found" });
  await logAudit(req, "Segment", "Updated", `Updated ${row.segment_key} value ${row.code}`);
  res.json(parse(row));
});

// ─── Bulk DESCRIPTION-ONLY update ────────────────────────────────────────────
// Matches existing rows by (segment_key + code) and updates ONLY their
// description. Never creates rows and never changes code/active/sort — this is
// the "edit descriptions in Excel and re-upload" workflow.
router.post("/values/bulk", requireCap("write"), async (req, res) => {
  const rows = Array.isArray(req.body?.rows) ? req.body.rows : [];
  if (!rows.length) return res.status(400).json({ error: "No rows provided" });

  let updated = 0, skipped = 0;
  const errors = [];
  for (const [idx, r] of rows.entries()) {
    const line = idx + 2; // +1 header, +1 for 1-based row numbers in the sheet
    try {
      const segmentKey = String(r.segmentKey ?? r.segment_key ?? "").trim();
      const code = String(r.code ?? "").trim();
      const description = (r.description ?? "").toString();
      if (!segmentKey || !code) { errors.push({ row: line, error: "Missing segment key or code" }); continue; }

      const existing = await one(
        "SELECT id, description FROM segment_values WHERE segment_key = ? AND code = ?",
        [segmentKey, code],
      );
      if (!existing) { skipped++; continue; }          // unknown code — never create here
      if (description.trim() === "") { skipped++; continue; }        // blank — don't wipe
      if (existing.description === description) { skipped++; continue; } // no change

      await pool.query("UPDATE segment_values SET description = ? WHERE id = ?", [description, existing.id]);
      updated++;
    } catch (err) {
      errors.push({ row: line, error: err.message });
    }
  }
  await logAudit(req, "Segment", "Updated", `Bulk description update — ${updated} updated, ${skipped} skipped`);
  res.json({ updated, skipped, errors });
});

router.delete("/values/:id", requireCap("delete"), async (req, res) => {
  const row = await one("SELECT * FROM segment_values WHERE id = ?", [req.params.id]);
  if (!row) return res.status(404).json({ error: "Not found" });
  await pool.query("DELETE FROM segment_values WHERE id = ?", [req.params.id]);
  await logAudit(req, "Segment", "Deleted", `Deleted ${row.segment_key} value ${row.code}`);
  res.json({ ok: true });
});

export default router;
