import express from "express";
import { q, one } from "../db.js";

const router = express.Router();

router.get("/", async (req, res) => {
  const { module, action, user, search, page = 1, pageSize = 25 } = req.query;
  const where = [];
  const params = [];
  if (module && module !== "all") { where.push("module = ?"); params.push(module); }
  if (action && action !== "all") { where.push("action = ?"); params.push(action); }
  if (user && user !== "all") { where.push("user_name = ?"); params.push(user); }
  if (search) { where.push("details LIKE ?"); params.push(`%${search}%`); }
  const whereSql = where.length ? "WHERE " + where.join(" AND ") : "";
  const total = (await one(`SELECT COUNT(*) AS c FROM audit_log ${whereSql}`, params)).c;
  const limit = Math.min(Number(pageSize) || 25, 200);
  const offset = (Math.max(Number(page) || 1, 1) - 1) * limit;
  const rows = await q(
    `SELECT * FROM audit_log ${whereSql} ORDER BY id DESC LIMIT ? OFFSET ?`,
    [...params, limit, offset],
  );
  res.json({ data: rows, total, page: Number(page), pageSize: limit });
});

// Distinct filter options
router.get("/filters", async (_req, res) => {
  const modules = await q("SELECT DISTINCT module FROM audit_log ORDER BY module");
  const actions = await q("SELECT DISTINCT action FROM audit_log ORDER BY action");
  const users = await q("SELECT DISTINCT user_name FROM audit_log WHERE user_name IS NOT NULL ORDER BY user_name");
  res.json({
    modules: modules.map((r) => r.module),
    actions: actions.map((r) => r.action),
    users: users.map((r) => r.user_name),
  });
});

export default router;
