import express from "express";
import { pool, q, one } from "../db.js";
import { requireCap } from "../auth.js";
import { hashPassword } from "../auth.js";
import { logAudit } from "../audit.js";

const router = express.Router();
const publicUser = (u) => ({
  id: u.id, username: u.username, displayName: u.display_name,
  role: u.role, status: u.status, createdAt: u.created_at,
});

router.get("/", requireCap("manage_users"), async (_req, res) => {
  const rows = await q("SELECT * FROM users ORDER BY id");
  res.json(rows.map(publicUser));
});

router.post("/", requireCap("manage_users"), async (req, res) => {
  const { username, displayName, role = "viewer", password } = req.body || {};
  if (!username || !displayName || !password) {
    return res.status(400).json({ error: "username, displayName and password are required" });
  }
  const dupe = await one("SELECT id FROM users WHERE username = ?", [username]);
  if (dupe) return res.status(409).json({ error: "Username already taken" });
  const [result] = await pool.query(
    "INSERT INTO users (username, display_name, role, password_hash, status) VALUES (?, ?, ?, ?, 'active')",
    [username, displayName, role, hashPassword(password)],
  );
  const row = await one("SELECT * FROM users WHERE id = ?", [result.insertId]);
  await logAudit(req, "User", "Created", `Created user ${username} (${role})`);
  res.status(201).json(publicUser(row));
});

router.patch("/:id", requireCap("manage_users"), async (req, res) => {
  const { displayName, role, status, password } = req.body || {};
  const sets = [];
  const params = [];
  if (displayName !== undefined) { sets.push("display_name = ?"); params.push(displayName); }
  if (role !== undefined) { sets.push("role = ?"); params.push(role); }
  if (status !== undefined) { sets.push("status = ?"); params.push(status); }
  if (password) { sets.push("password_hash = ?"); params.push(hashPassword(password)); }
  if (!sets.length) return res.status(400).json({ error: "No fields to update" });
  params.push(req.params.id);
  await pool.query(`UPDATE users SET ${sets.join(", ")} WHERE id = ?`, params);
  const row = await one("SELECT * FROM users WHERE id = ?", [req.params.id]);
  if (!row) return res.status(404).json({ error: "Not found" });
  await logAudit(req, "User", "Updated", `Updated user ${row.username}`);
  res.json(publicUser(row));
});

router.delete("/:id", requireCap("manage_users"), async (req, res) => {
  const row = await one("SELECT * FROM users WHERE id = ?", [req.params.id]);
  if (!row) return res.status(404).json({ error: "Not found" });
  if (req.user?.id === row.id) return res.status(400).json({ error: "You cannot delete your own account" });
  await pool.query("DELETE FROM users WHERE id = ?", [req.params.id]);
  await logAudit(req, "User", "Deleted", `Deleted user ${row.username}`);
  res.json({ ok: true });
});

export default router;
