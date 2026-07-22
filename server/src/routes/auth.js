import express from "express";
import { one } from "../db.js";
import { verifyPassword, signSession, requireAuth } from "../auth.js";
import { logAudit } from "../audit.js";

const router = express.Router();

// Scope the session cookie to the app's base path (e.g. /partpilot behind nginx).
const COOKIE_PATH = process.env.SESSION_COOKIE_PATH || "/";

router.post("/login", async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: "Username and password required" });
  const user = await one("SELECT * FROM users WHERE username = ?", [username]);
  if (!user || user.status === "inactive" || !verifyPassword(password, user.password_hash)) {
    return res.status(401).json({ error: "Invalid credentials" });
  }
  const token = signSession(user.id);
  res.cookie("sid", token, {
    httpOnly: true,
    sameSite: "lax",
    path: COOKIE_PATH,
    maxAge: 1000 * 60 * 60 * 24 * 7,
  });
  req.user = user;
  await logAudit(req, "Auth", "Login", `${user.display_name} signed in`);
  res.json({ id: user.id, username: user.username, displayName: user.display_name, role: user.role });
});

router.post("/logout", (req, res) => {
  res.clearCookie("sid", { path: COOKIE_PATH });
  res.json({ ok: true });
});

router.get("/me", (req, res) => {
  if (!req.user) return res.status(401).json({ error: "Not authenticated" });
  res.json({
    id: req.user.id,
    username: req.user.username,
    displayName: req.user.display_name,
    role: req.user.role,
  });
});

export default router;
