import { pool } from "@workspace/db";
import { hashPassword } from "./auth";
import { logger } from "./logger";

/**
 * Idempotent startup migration + seed. Creates the schema if it doesn't exist
 * and seeds the default role accounts on an empty users table. Safe to run on
 * every boot: `CREATE TABLE IF NOT EXISTS` never touches existing tables, and
 * users are only seeded when none exist. This lets a fresh VPS/Docker database
 * come up working with zero manual SQL.
 */

const CREATE_PART_NUMBERS = `
CREATE TABLE IF NOT EXISTS part_numbers (
  id INT AUTO_INCREMENT PRIMARY KEY,
  part_number TEXT NOT NULL,
  product_category TEXT NOT NULL,
  product_name TEXT NOT NULL,
  sku TEXT,
  product_description TEXT,
  internal_notes TEXT,
  company TEXT NOT NULL,
  product_model TEXT NOT NULL,
  version_variant TEXT NOT NULL,
  size_variant TEXT NOT NULL,
  power_type TEXT NOT NULL,
  max_power TEXT NOT NULL,
  voltage_range TEXT NOT NULL,
  dimming TEXT NOT NULL,
  cct TEXT NOT NULL,
  light_distribution TEXT NOT NULL,
  driver TEXT NOT NULL,
  finish TEXT NOT NULL,
  manufacturer TEXT NOT NULL,
  lens_type TEXT,
  emergency_option TEXT,
  sensor_option TEXT,
  surge_protection TEXT,
  reflector_cover TEXT,
  mounting_option TEXT,
  photocontrol_option TEXT,
  connectable_option TEXT,
  base TEXT,
  status TEXT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY part_numbers_part_number_unique (part_number(191))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`;

const CREATE_SEGMENT_VALUES = `
CREATE TABLE IF NOT EXISTS segment_values (
  id INT AUTO_INCREMENT PRIMARY KEY,
  segment_key TEXT NOT NULL,
  code TEXT NOT NULL,
  description TEXT NOT NULL,
  applicable_products JSON NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  UNIQUE KEY segment_values_key_code_unique (segment_key(100), code(100))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`;

const CREATE_USERS = `
CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  username TEXT NOT NULL,
  display_name TEXT NOT NULL,
  role TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY users_username_unique (username(191))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`;

const DEFAULT_USERS: Array<[string, string, string, string]> = [
  ["master", "Master Admin", "master", "master123"],
  ["creator", "Creator", "creator", "creator123"],
  ["viewer", "Viewer", "viewer", "viewer123"],
];

async function waitForDb(retries = 20, delayMs = 2000): Promise<void> {
  for (let attempt = 1; attempt <= retries; attempt += 1) {
    try {
      await pool.query("SELECT 1");
      return;
    } catch (err) {
      if (attempt === retries) throw err;
      logger.warn({ attempt }, "Database not ready yet, retrying…");
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
}

export async function migrateAndSeed(): Promise<void> {
  await waitForDb();

  await pool.query(CREATE_PART_NUMBERS);
  await pool.query(CREATE_SEGMENT_VALUES);
  await pool.query(CREATE_USERS);

  const [rows] = await pool.query("SELECT COUNT(*) AS c FROM users");
  const count = Number((rows as Array<{ c: number }>)[0]?.c ?? 0);
  if (count === 0) {
    for (const [username, displayName, role, password] of DEFAULT_USERS) {
      const passwordHash = await hashPassword(password);
      await pool.query(
        "INSERT INTO users (username, display_name, role, password_hash) VALUES (?, ?, ?, ?)",
        [username, displayName, role, passwordHash],
      );
    }
    logger.info("Seeded default accounts: master / creator / viewer");
  }

  logger.info("Database schema ready");
}
