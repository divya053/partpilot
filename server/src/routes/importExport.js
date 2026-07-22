import express from "express";
import { pool, q } from "../db.js";
import { requireCap } from "../auth.js";
import { logAudit } from "../audit.js";
import { buildPartNumber, ALL_KEYS } from "../segments.js";

const router = express.Router();

const EXPORT_COLS = [
  "part_number", "product_category", "product_name", "sku", "company",
  "product_model", "version_variant", "size_variant", "power_type", "max_power",
  "voltage_range", "dimming", "cct", "light_distribution", "driver", "finish",
  "manufacturer", "status",
];

function toCsv(rows, cols) {
  const esc = (v) => {
    if (v == null) return "";
    const s = String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const header = cols.join(",");
  const body = rows.map((r) => cols.map((c) => esc(r[c])).join(",")).join("\n");
  return header + "\n" + body;
}

router.get("/export/parts.csv", async (req, res) => {
  const rows = await q(`SELECT * FROM part_numbers ORDER BY id`);
  await logAudit(req, "Part Number", "Exported", `Exported ${rows.length} part numbers (CSV)`);
  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", "attachment; filename=partpilot-parts.csv");
  res.send(toCsv(rows, EXPORT_COLS));
});

router.get("/export/parts.json", async (req, res) => {
  const rows = await q(`SELECT * FROM part_numbers ORDER BY id`);
  await logAudit(req, "Part Number", "Exported", `Exported ${rows.length} part numbers (JSON)`);
  res.setHeader("Content-Disposition", "attachment; filename=partpilot-parts.json");
  res.json(rows);
});

// Import an array of part-field objects (camelCase segment keys + metadata).
router.post("/import/parts", requireCap("import"), async (req, res) => {
  const rows = Array.isArray(req.body?.rows) ? req.body.rows : [];
  if (!rows.length) return res.status(400).json({ error: "No rows provided" });
  const snake = (s) => s.replace(/[A-Z]/g, (m) => "_" + m.toLowerCase());
  let created = 0, skipped = 0;
  const errors = [];
  for (const [idx, r] of rows.entries()) {
    try {
      const pn = buildPartNumber(r);
      const [dupe] = await pool.query("SELECT id FROM part_numbers WHERE part_number = ?", [pn]);
      if (dupe.length) { skipped++; continue; }
      const data = {
        part_number: pn,
        product_category: r.productCategory || "Uncategorized",
        product_name: r.productName || "Imported Product",
        sku: r.sku || null,
        status: r.status || "active",
        created_by: req.user?.display_name || "Import",
      };
      for (const key of ALL_KEYS) if (r[key] != null) data[snake(key)] = r[key];
      const cols = Object.keys(data);
      await pool.query(
        `INSERT INTO part_numbers (${cols.join(", ")}) VALUES (${cols.map(() => "?").join(", ")})`,
        cols.map((c) => data[c]),
      );
      created++;
    } catch (err) {
      errors.push({ row: idx + 1, error: err.message });
    }
  }
  await logAudit(req, "Part Number", "Imported", `Imported ${created} parts (${skipped} skipped)`);
  res.json({ created, skipped, errors });
});

export default router;
