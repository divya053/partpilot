import mysql from "mysql2/promise";
import "dotenv/config";

// Shared connection pool. XAMPP/phpMyAdmin defaults are root / no password.
export const pool = mysql.createPool({
  host: process.env.DB_HOST || "127.0.0.1",
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASSWORD || "",
  database: process.env.DB_NAME || "partpilot",
  waitForConnections: true,
  connectionLimit: 10,
  charset: "utf8mb4",
});

/** Run a query and return rows. */
export async function q(sql, params = []) {
  const [rows] = await pool.query(sql, params);
  return rows;
}

/** Run a query and return the first row (or null). */
export async function one(sql, params = []) {
  const rows = await q(sql, params);
  return rows[0] || null;
}
