import express from "express";
import { pool, q, one } from "../db.js";
import { requireCap } from "../auth.js";
import { logAudit } from "../audit.js";
import { CORE_SEGMENTS, OPTIONAL_SEGMENTS, ALL_SEGMENTS, appliesToModel } from "../segments.js";
import { SEGMENT_COLUMNS } from "../usage.js";

const router = express.Router();

const parse = (r) => {
  if (r && typeof r.applicable_products === "string") {
    try { r.applicable_products = JSON.parse(r.applicable_products); } catch { r.applicable_products = []; }
  }
  if (r && typeof r.model_descriptions === "string") {
    try { r.model_descriptions = JSON.parse(r.model_descriptions); } catch { r.model_descriptions = {}; }
  }
  if (r && typeof r.model_applicability === "string") {
    try { r.model_applicability = JSON.parse(r.model_applicability); } catch { r.model_applicability = {}; }
  }
  if (r && r.model_descriptions == null) r.model_descriptions = {};
  if (r && r.model_applicability == null) r.model_applicability = {};
  return r;
};

// Editable label/help overrides for the built-in attribute definitions.
async function loadOverrides() {
  const rows = await q("SELECT segment_key, label, help FROM segment_overrides");
  const map = {};
  for (const r of rows) map[r.segment_key] = r;
  return map;
}
const applyOv = (d, ov) => {
  const o = ov[d.key];
  return o ? { ...d, label: o.label ?? d.label, help: o.help ?? d.help } : d;
};

// Segment definitions/metadata (for the Attributes page + builder ordering)
router.get("/meta", async (_req, res) => {
  const ov = await loadOverrides();
  const core = CORE_SEGMENTS.map((d) => applyOv(d, ov));
  const optional = OPTIONAL_SEGMENTS.map((d) => applyOv(d, ov));
  res.json({ core, optional, all: [...core, ...optional] });
});

// Update one attribute's label/help.
router.patch("/def/:key", requireCap("write"), async (req, res) => {
  const key = req.params.key;
  if (!ALL_SEGMENTS.some((s) => s.key === key)) return res.status(404).json({ error: "Unknown attribute" });
  const { label, help } = req.body || {};
  await pool.query(
    `INSERT INTO segment_overrides (segment_key, label, help) VALUES (?, ?, ?)
     ON DUPLICATE KEY UPDATE label = VALUES(label), help = VALUES(help)`,
    [key, label ?? null, help ?? null],
  );
  await logAudit(req, "Attribute", "Updated", `Updated attribute ${key}`);
  res.json({ ok: true });
});

// Bulk-update several attributes' label/help at once.
router.post("/def/bulk", requireCap("write"), async (req, res) => {
  const rows = Array.isArray(req.body?.rows) ? req.body.rows : [];
  let updated = 0;
  for (const r of rows) {
    const key = String(r.key || "").trim();
    if (!ALL_SEGMENTS.some((s) => s.key === key)) continue;
    await pool.query(
      `INSERT INTO segment_overrides (segment_key, label, help) VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE label = VALUES(label), help = VALUES(help)`,
      [key, r.label ?? null, r.help ?? null],
    );
    updated++;
  }
  await logAudit(req, "Attribute", "Updated", `Bulk updated ${updated} attribute(s)`);
  res.json({ updated });
});

// All values grouped by segmentKey (for the builder dropdowns), ranked by how
// often each code is actually used in the registry — common choices surface
// first, so new users see the "normal" options at the top of every dropdown.
router.get("/values/grouped", async (_req, res) => {
  const rows = await q(
    "SELECT * FROM segment_values WHERE is_active = 1 ORDER BY segment_key, sort_order, code",
  );
  const usage = new Map();
  for (const [key, col] of Object.entries(SEGMENT_COLUMNS)) {
    const counts = await q(
      `SELECT \`${col}\` AS code, COUNT(*) AS c FROM part_numbers
       WHERE \`${col}\` IS NOT NULL AND \`${col}\` <> '' GROUP BY \`${col}\``,
    );
    for (const r of counts) usage.set(`${key}:${r.code}`, Number(r.c));
  }
  const grouped = {};
  for (const r of rows.map(parse)) {
    r.usage_count = usage.get(`${r.segment_key}:${r.code}`) || 0;
    (grouped[r.segment_key] ||= []).push(r);
  }
  for (const list of Object.values(grouped)) {
    list.sort((a, b) => (b.usage_count - a.usage_count) || (a.sort_order - b.sort_order) || a.code.localeCompare(b.code));
  }
  res.json(grouped);
});

// Attributes summary: count of values per segment
router.get("/summary", async (_req, res) => {
  const counts = await q(
    "SELECT segment_key, COUNT(*) AS value_count, SUM(is_active) AS active_count FROM segment_values GROUP BY segment_key",
  );
  const map = Object.fromEntries(counts.map((c) => [c.segment_key, c]));
  const ov = await loadOverrides();
  res.json(
    ALL_SEGMENTS.map((s) => applyOv(s, ov)).map((s) => ({
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
  const { segmentKey, code, description, sortOrder = 0, isActive = true, applicableProducts = [], modelDescriptions = {}, modelApplicability = {} } = req.body;
  if (!segmentKey || !code) return res.status(400).json({ error: "segmentKey and code are required" });
  const dupe = await one("SELECT id FROM segment_values WHERE segment_key = ? AND code = ?", [segmentKey, code]);
  if (dupe) return res.status(409).json({ error: `${code} already exists for ${segmentKey}` });
  const md = modelDescriptions && typeof modelDescriptions === "object" ? modelDescriptions : {};
  const ma = modelApplicability && typeof modelApplicability === "object" ? modelApplicability : {};
  const [result] = await pool.query(
    `INSERT INTO segment_values (segment_key, code, description, applicable_products, model_descriptions, model_applicability, sort_order, is_active)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [segmentKey, code, description || code, JSON.stringify(applicableProducts), JSON.stringify(md), JSON.stringify(ma), sortOrder, isActive ? 1 : 0],
  );
  const row = await one("SELECT * FROM segment_values WHERE id = ?", [result.insertId]);
  await logAudit(req, "Segment", "Created", `Added ${segmentKey} value ${code}`);
  res.status(201).json(parse(row));
});

// ─── Import the Excel "Value Descriptions" sheet (with per-model meanings) ────
// Each value can mean different things per product model (e.g. Size "01" =
// "Version 1" for Linear High Bay but "60 LEDs" for Strip Lights). The client
// parses the sheet into rows { segmentKey, code, description, modelDescriptions:
// { MODEL_CODE: meaning } }. We set the generic description + the per-model map;
// applicable_products ("Used By") is left to the parts-based auto-detect.
router.post("/import-value-descriptions", requireCap("write"), async (req, res) => {
  const rows = Array.isArray(req.body?.rows) ? req.body.rows : [];
  if (!rows.length) return res.status(400).json({ error: "No rows provided" });

  let updated = 0, created = 0, withModels = 0;
  const errors = [];
  for (const [idx, r] of rows.entries()) {
    const line = idx + 1;
    try {
      const segmentKey = String(r.segmentKey || "").trim();
      const code = String(r.code || "").trim();
      if (!segmentKey || !code) { errors.push({ row: line, error: "Missing segment key or code" }); continue; }
      const description = (r.description ?? "").toString().trim();
      const md = (r.modelDescriptions && typeof r.modelDescriptions === "object") ? r.modelDescriptions : {};
      const mdJson = JSON.stringify(md);

      const existing = await one("SELECT id FROM segment_values WHERE segment_key = ? AND code = ?", [segmentKey, code]);
      if (existing) {
        if (description) await pool.query("UPDATE segment_values SET description = ?, model_descriptions = ? WHERE id = ?", [description, mdJson, existing.id]);
        else await pool.query("UPDATE segment_values SET model_descriptions = ? WHERE id = ?", [mdJson, existing.id]);
        updated++;
      } else {
        await pool.query(
          "INSERT INTO segment_values (segment_key, code, description, applicable_products, model_descriptions, sort_order, is_active) VALUES (?, ?, ?, ?, ?, ?, 1)",
          [segmentKey, code, description || code, JSON.stringify([]), mdJson, idx],
        );
        created++;
      }
      if (Object.keys(md).length) withModels++;
    } catch (err) {
      errors.push({ row: line, error: err.message });
    }
  }
  await logAudit(req, "Segment", "Imported", `Value Descriptions import — ${updated} updated, ${created} added, ${withModels} with per-model meanings`);
  res.json({ updated, created, withModels, errors });
});

router.patch("/values/:id", requireCap("write"), async (req, res) => {
  const allowed = ["code", "description", "sortOrder", "isActive", "applicableProducts", "modelDescriptions", "modelApplicability"];
  const colMap = { sortOrder: "sort_order", isActive: "is_active", applicableProducts: "applicable_products", modelDescriptions: "model_descriptions", modelApplicability: "model_applicability" };
  const sets = [];
  const params = [];
  for (const key of allowed) {
    if (!(key in req.body)) continue;
    const col = colMap[key] || key;
    let val = req.body[key];
    if (key === "isActive") val = val ? 1 : 0;
    if (key === "applicableProducts") val = JSON.stringify(val);
    if (key === "modelDescriptions") val = JSON.stringify(val && typeof val === "object" ? val : {});
    if (key === "modelApplicability") val = JSON.stringify(val && typeof val === "object" ? val : {});
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

// ─── Model-centric config: per product model, which codes apply + what they mean ──
// Returns every segment's codes with, FOR THIS MODEL, the effective "applies"
// flag, whether that flag is a manual override, and the per-model meaning.
router.get("/model-config/:model", async (req, res) => {
  const model = String(req.params.model || "").trim();
  if (!model) return res.status(400).json({ error: "model required" });
  const rows = (await q("SELECT * FROM segment_values ORDER BY segment_key, sort_order, code")).map(parse);
  const ov = await loadOverrides();
  const segMeta = ALL_SEGMENTS.map((s) => applyOv(s, ov));

  const bySeg = {};
  for (const r of rows) {
    if (r.segment_key === "productModel" || r.segment_key === "company") continue; // not model-scoped
    (bySeg[r.segment_key] ||= []).push({
      id: r.id, code: r.code, description: r.description,
      applies: appliesToModel(r, model),
      overridden: !!(r.model_applicability && model in r.model_applicability),
      usedByReal: Array.isArray(r.applicable_products) && r.applicable_products.includes(model),
      meaning: (r.model_descriptions && r.model_descriptions[model]) || "",
      isActive: !!r.is_active,
    });
  }
  const segments = segMeta
    .filter((s) => bySeg[s.key]?.length)
    .map((s) => ({ key: s.key, label: s.label, help: s.help, values: bySeg[s.key] }));
  res.json({ model, segments });
});

// Save per-model applies/meaning for a set of codes in one call.
// body: { changes: [{ id, applies:boolean, meaning:string }] }
router.post("/model-config/:model", requireCap("write"), async (req, res) => {
  const model = String(req.params.model || "").trim();
  const changes = Array.isArray(req.body?.changes) ? req.body.changes : [];
  if (!model) return res.status(400).json({ error: "model required" });
  let updated = 0;
  for (const ch of changes) {
    const row = parse(await one("SELECT * FROM segment_values WHERE id = ?", [ch.id]));
    if (!row) continue;
    const md = { ...(row.model_descriptions || {}) };
    const ap = { ...(row.model_applicability || {}) };
    // Meaning: set when non-empty, remove the key when cleared.
    const meaning = String(ch.meaning ?? "").trim();
    if (meaning) md[model] = meaning; else delete md[model];
    // Applicability override: store the explicit boolean the user chose.
    ap[model] = !!ch.applies;
    await pool.query(
      "UPDATE segment_values SET model_descriptions = ?, model_applicability = ? WHERE id = ?",
      [JSON.stringify(md), JSON.stringify(ap), ch.id],
    );
    updated++;
  }
  await logAudit(req, "Segment", "Model config", `Updated ${updated} code(s) for model ${model}`);
  res.json({ updated });
});

router.delete("/values/:id", requireCap("delete"), async (req, res) => {
  const row = await one("SELECT * FROM segment_values WHERE id = ?", [req.params.id]);
  if (!row) return res.status(404).json({ error: "Not found" });
  await pool.query("DELETE FROM segment_values WHERE id = ?", [req.params.id]);
  await logAudit(req, "Segment", "Deleted", `Deleted ${row.segment_key} value ${row.code}`);
  res.json({ ok: true });
});

export default router;
