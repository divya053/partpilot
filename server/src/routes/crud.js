import express from "express";
import { pool, q, one } from "../db.js";
import { requireCap } from "../auth.js";
import { logAudit } from "../audit.js";

/**
 * Build a standard CRUD router for a simple table.
 * @param {object} cfg
 * @param {string} cfg.table       SQL table name
 * @param {string} cfg.module      Audit module label
 * @param {string[]} cfg.columns   Writable columns (snake_case)
 * @param {string[]} [cfg.jsonColumns]  Columns stored as JSON
 * @param {string} [cfg.searchColumn]   Column used by ?search=
 * @param {(row:any)=>string} [cfg.label]  Human label for audit details
 */
export function crudRouter(cfg) {
  const router = express.Router();
  const { table, module, columns, jsonColumns = [], searchColumn, label = (r) => r.name } = cfg;

  const parseRow = (row) => {
    if (!row) return row;
    for (const c of jsonColumns) {
      if (typeof row[c] === "string") {
        try { row[c] = JSON.parse(row[c]); } catch { /* leave as-is */ }
      }
    }
    return row;
  };

  const encode = (body) =>
    columns.map((c) => {
      const v = body[c];
      if (jsonColumns.includes(c)) return v == null ? null : JSON.stringify(v);
      return v === undefined ? null : v;
    });

  // LIST
  router.get("/", async (req, res) => {
    const { search, status } = req.query;
    const where = [];
    const params = [];
    if (search && searchColumn) { where.push(`${searchColumn} LIKE ?`); params.push(`%${search}%`); }
    if (status && status !== "all") { where.push(`status = ?`); params.push(status); }
    const sql = `SELECT * FROM ${table} ${where.length ? "WHERE " + where.join(" AND ") : ""} ORDER BY id DESC`;
    const rows = await q(sql, params);
    res.json(rows.map(parseRow));
  });

  // GET one
  router.get("/:id", async (req, res) => {
    const row = await one(`SELECT * FROM ${table} WHERE id = ?`, [req.params.id]);
    if (!row) return res.status(404).json({ error: "Not found" });
    res.json(parseRow(row));
  });

  // CREATE — only insert columns actually provided, so DB defaults apply to the rest.
  router.post("/", requireCap("write"), async (req, res) => {
    const cols = columns.filter((c) => c in req.body && req.body[c] !== undefined && req.body[c] !== "");
    if (!cols.length) return res.status(400).json({ error: "No fields provided" });
    const vals = cols.map((c) => (jsonColumns.includes(c) ? JSON.stringify(req.body[c]) : req.body[c]));
    const [result] = await pool.query(
      `INSERT INTO ${table} (${cols.join(", ")}) VALUES (${cols.map(() => "?").join(", ")})`,
      vals,
    );
    const row = await one(`SELECT * FROM ${table} WHERE id = ?`, [result.insertId]);
    await logAudit(req, module, "Created", label(row));
    res.status(201).json(parseRow(row));
  });

  // UPDATE (partial)
  router.patch("/:id", requireCap("write"), async (req, res) => {
    const keys = columns.filter((c) => c in req.body);
    if (!keys.length) return res.status(400).json({ error: "No fields to update" });
    const sets = keys.map((c) => `${c} = ?`).join(", ");
    const params = keys.map((c) => (jsonColumns.includes(c) ? JSON.stringify(req.body[c]) : req.body[c]));
    params.push(req.params.id);
    await pool.query(`UPDATE ${table} SET ${sets} WHERE id = ?`, params);
    const row = await one(`SELECT * FROM ${table} WHERE id = ?`, [req.params.id]);
    if (!row) return res.status(404).json({ error: "Not found" });
    await logAudit(req, module, "Updated", label(row));
    res.json(parseRow(row));
  });

  // DELETE
  router.delete("/:id", requireCap("delete"), async (req, res) => {
    const row = await one(`SELECT * FROM ${table} WHERE id = ?`, [req.params.id]);
    if (!row) return res.status(404).json({ error: "Not found" });
    await pool.query(`DELETE FROM ${table} WHERE id = ?`, [req.params.id]);
    await logAudit(req, module, "Deleted", label(row));
    res.json({ ok: true });
  });

  return router;
}
