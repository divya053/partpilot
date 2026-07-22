import { pool } from "./db.js";

/** Write an audit-log entry. Never throws into the request path. */
export async function logAudit(req, module, action, details) {
  try {
    const ip =
      (req.headers["x-forwarded-for"] || "").split(",")[0].trim() ||
      req.socket?.remoteAddress ||
      null;
    await pool.query(
      `INSERT INTO audit_log (user_id, user_name, module, action, details, ip_address)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        req.user?.id ?? null,
        req.user?.display_name ?? "System",
        module,
        action,
        details ?? null,
        ip,
      ],
    );
  } catch (err) {
    console.warn("[audit] failed:", err.message);
  }
}
