import { pool } from "./db.js";

// Idempotent schema creation. Safe to run on every boot.
const STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS part_numbers (
    id INT AUTO_INCREMENT PRIMARY KEY,
    part_number VARCHAR(255) NOT NULL UNIQUE,
    product_category VARCHAR(191) NOT NULL,
    product_name VARCHAR(255) NOT NULL,
    sku VARCHAR(191),
    product_description TEXT,
    internal_notes TEXT,
    vendor_name VARCHAR(191),
    product_stage VARCHAR(64) DEFAULT 'stocked',
    certificates JSON,
    vendor_spec_sheet TEXT,
    ikio_spec_sheet TEXT,
    image TEXT,
    company VARCHAR(32) NOT NULL DEFAULT 'IK',
    product_model VARCHAR(64) NOT NULL,
    version_variant VARCHAR(64) NOT NULL,
    size_variant VARCHAR(64) NOT NULL,
    power_type VARCHAR(16) NOT NULL,
    max_power VARCHAR(32) NOT NULL,
    voltage_range VARCHAR(32) NOT NULL,
    dimming VARCHAR(16) NOT NULL,
    cct VARCHAR(32) NOT NULL,
    light_distribution VARCHAR(32) NOT NULL,
    driver VARCHAR(32) NOT NULL,
    finish VARCHAR(32) NOT NULL,
    manufacturer VARCHAR(32) NOT NULL,
    lens_type VARCHAR(32),
    emergency_option VARCHAR(32),
    sensor_option VARCHAR(32),
    surge_protection VARCHAR(32),
    reflector_cover VARCHAR(32),
    mounting_option VARCHAR(32),
    photocontrol_option VARCHAR(32),
    connectable_option VARCHAR(32),
    base VARCHAR(32),
    company_id INT,
    status VARCHAR(32) NOT NULL DEFAULT 'active',
    created_by VARCHAR(191),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

  `CREATE TABLE IF NOT EXISTS segment_values (
    id INT AUTO_INCREMENT PRIMARY KEY,
    segment_key VARCHAR(64) NOT NULL,
    code VARCHAR(64) NOT NULL,
    description TEXT NOT NULL,
    applicable_products JSON,
    sort_order INT NOT NULL DEFAULT 0,
    is_active TINYINT(1) NOT NULL DEFAULT 1,
    UNIQUE KEY segment_values_key_code (segment_key, code)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

  `CREATE TABLE IF NOT EXISTS companies (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    type VARCHAR(64) NOT NULL DEFAULT 'contractor',
    contact_name VARCHAR(191),
    email VARCHAR(191),
    phone VARCHAR(64),
    status VARCHAR(32) NOT NULL DEFAULT 'active',
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

  `CREATE TABLE IF NOT EXISTS products (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    model_code VARCHAR(64),
    category VARCHAR(191) NOT NULL,
    description TEXT,
    status VARCHAR(32) NOT NULL DEFAULT 'active',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

  `CREATE TABLE IF NOT EXISTS categories (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    code VARCHAR(64),
    description TEXT,
    status VARCHAR(32) NOT NULL DEFAULT 'active',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

  `CREATE TABLE IF NOT EXISTS templates (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    segments JSON NOT NULL,
    created_by VARCHAR(191),
    usage_count INT NOT NULL DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

  `CREATE TABLE IF NOT EXISTS audit_log (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT,
    user_name VARCHAR(191),
    module VARCHAR(64) NOT NULL,
    action VARCHAR(64) NOT NULL,
    details TEXT,
    ip_address VARCHAR(64),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

  `CREATE TABLE IF NOT EXISTS users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(191) NOT NULL UNIQUE,
    display_name VARCHAR(191) NOT NULL,
    role VARCHAR(32) NOT NULL DEFAULT 'viewer',
    password_hash VARCHAR(255) NOT NULL,
    status VARCHAR(32) NOT NULL DEFAULT 'active',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
];

// MySQL has no portable "ADD COLUMN IF NOT EXISTS", so check information_schema
// first. Lets new columns land on databases created before the column existed.
async function ensureColumn(table, column, ddl) {
  const [rows] = await pool.query(
    `SELECT COUNT(*) AS c FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [table, column],
  );
  if (Number(rows[0]?.c || 0) === 0) {
    await pool.query(`ALTER TABLE \`${table}\` ADD COLUMN ${ddl}`);
  }
}

export async function migrate() {
  for (const sql of STATEMENTS) {
    await pool.query(sql);
  }
  // Additive columns for databases created before these fields existed.
  await ensureColumn("part_numbers", "vendor_spec_sheet", "vendor_spec_sheet TEXT");
  await ensureColumn("part_numbers", "ikio_spec_sheet", "ikio_spec_sheet TEXT");
  await ensureColumn("part_numbers", "image", "image TEXT");
}
