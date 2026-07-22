import crypto from "node:crypto";
import { one } from "./db.js";

const SECRET = process.env.SESSION_SECRET || "partpilot-dev-secret";

// ─── Password hashing (scrypt, no external deps) ─────────────────────────────
export function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return `scrypt$${salt}$${hash}`;
}

export function verifyPassword(password, stored) {
  if (!stored || !stored.startsWith("scrypt$")) return false;
  const [, salt, hash] = stored.split("$");
  const check = crypto.scryptSync(password, salt, 64).toString("hex");
  const a = Buffer.from(hash, "hex");
  const b = Buffer.from(check, "hex");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// ─── Signed session token (userId + hmac) ────────────────────────────────────
export function signSession(userId) {
  const payload = String(userId);
  const sig = crypto.createHmac("sha256", SECRET).update(payload).digest("hex");
  return `${payload}.${sig}`;
}

export function readSession(token) {
  if (!token || !token.includes(".")) return null;
  const [payload, sig] = token.split(".");
  const expected = crypto.createHmac("sha256", SECRET).update(payload).digest("hex");
  if (sig !== expected) return null;
  const id = Number(payload);
  return Number.isFinite(id) ? id : null;
}

// ─── RBAC capability matrix ──────────────────────────────────────────────────
// master: everything incl. user management. creator: build/edit. viewer: read.
export const ROLE_CAPS = {
  master: new Set(["read", "write", "delete", "manage_users", "import", "settings"]),
  creator: new Set(["read", "write", "import"]),
  viewer: new Set(["read"]),
};

export function can(role, cap) {
  return ROLE_CAPS[role]?.has(cap) ?? false;
}

// ─── Express middleware ──────────────────────────────────────────────────────
export async function attachUser(req, _res, next) {
  const token = req.cookies?.sid;
  const id = readSession(token);
  if (id) {
    const user = await one(
      "SELECT id, username, display_name, role, status FROM users WHERE id = ?",
      [id],
    );
    if (user && user.status !== "inactive") req.user = user;
  }
  next();
}

export function requireAuth(req, res, next) {
  if (!req.user) return res.status(401).json({ error: "Not authenticated" });
  next();
}

export function requireCap(cap) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: "Not authenticated" });
    if (!can(req.user.role, cap)) {
      return res.status(403).json({ error: `Requires '${cap}' permission` });
    }
    next();
  };
}
