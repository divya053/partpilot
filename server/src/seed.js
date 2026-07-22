import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { pool, q, one } from "./db.js";
import { migrate } from "./migrate.js";
import { hashPassword } from "./auth.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const seedData = JSON.parse(
  fs.readFileSync(path.join(__dirname, "data", "seed-data.json"), "utf8"),
);

const DEMO_COMPANIES = [
  { name: "ABC Construction Inc.", type: "contractor", contact_name: "John Smith", email: "john@abcconstruction.com", phone: "(555) 100-2000" },
  { name: "XYZ Distributors", type: "distributor", contact_name: "Michael Brown", email: "mike@xyzdist.com", phone: "(555) 200-3000" },
  { name: "Light Supply Co.", type: "distributor", contact_name: "Sarah Johnson", email: "sarah@lightsupply.com", phone: "(555) 300-4000" },
  { name: "BuildRight Solutions", type: "contractor", contact_name: "David Wilson", email: "david@buildright.com", phone: "(555) 400-5000" },
  { name: "National Electrical", type: "distributor", contact_name: "Chris Lee", email: "chris@nationalelec.com", phone: "(555) 500-6000", status: "inactive" },
  { name: "Elite Lighting Partners", type: "manufacturer_rep", contact_name: "Amanda Garcia", email: "amanda@elitelighting.com", phone: "(555) 600-7000" },
];

const DEMO_USERS = [
  { username: "master", display_name: "Master Admin", role: "master", password: "master123" },
  { username: "creator", display_name: "Jay K.", role: "creator", password: "creator123" },
  { username: "viewer", display_name: "Sam Viewer", role: "viewer", password: "viewer123" },
];

const PART_COLUMNS = [
  "part_number", "product_category", "product_name", "sku", "product_description",
  "internal_notes", "vendor_name", "product_stage", "company", "product_model",
  "version_variant", "size_variant", "power_type", "max_power", "voltage_range",
  "dimming", "cct", "light_distribution", "driver", "finish", "manufacturer",
  "lens_type", "emergency_option", "sensor_option", "surge_protection",
  "reflector_cover", "mounting_option", "photocontrol_option", "connectable_option",
  "base", "company_id", "status", "created_by",
];

async function seedSegmentValues() {
  const existing = await one("SELECT COUNT(*) AS c FROM segment_values");
  if (existing.c > 0) return `segment_values already has ${existing.c} rows — skipped`;

  for (const s of seedData.segmentValues) {
    let description = s.description;
    if (s.segmentKey === "manufacturer" && s.code === "BFU") description = "Bright Future (BFU)";
    if (s.segmentKey === "company" && s.code === "IK") description = "IKIO LED Lighting";
    await pool.query(
      `INSERT INTO segment_values (segment_key, code, description, applicable_products, sort_order, is_active)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [s.segmentKey, s.code, description, JSON.stringify(s.applicableProducts || []), s.sortOrder || 0, s.isActive ? 1 : 0],
    );
  }
  return `seeded ${seedData.segmentValues.length} segment values`;
}

async function seedCompanies() {
  const existing = await one("SELECT COUNT(*) AS c FROM companies");
  if (existing.c > 0) return `companies already has ${existing.c} rows — skipped`;
  for (const c of DEMO_COMPANIES) {
    await pool.query(
      `INSERT INTO companies (name, type, contact_name, email, phone, status) VALUES (?, ?, ?, ?, ?, ?)`,
      [c.name, c.type, c.contact_name, c.email, c.phone, c.status || "active"],
    );
  }
  return `seeded ${DEMO_COMPANIES.length} companies`;
}

async function seedCategoriesAndProducts() {
  const catCount = await one("SELECT COUNT(*) AS c FROM categories");
  const categories = [...new Set(seedData.partNumbers.map((p) => p.productCategory))];
  if (catCount.c === 0) {
    for (const name of categories) {
      const code = name.split(/\s+/).map((w) => w[0]).join("").toUpperCase().slice(0, 4);
      await pool.query(
        `INSERT INTO categories (name, code, description, status) VALUES (?, ?, ?, 'active')`,
        [name, code, `${name} fixtures`],
      );
    }
  }

  const prodCount = await one("SELECT COUNT(*) AS c FROM products");
  if (prodCount.c === 0) {
    const seen = new Map();
    for (const p of seedData.partNumbers) {
      const key = `${p.productModel}|${p.productName}`;
      if (seen.has(key)) continue;
      seen.set(key, true);
      await pool.query(
        `INSERT INTO products (name, model_code, category, description, status) VALUES (?, ?, ?, ?, 'active')`,
        [p.productName, p.productModel, p.productCategory, p.productDescription || null],
      );
    }
    return `seeded ${categories.length} categories, ${seen.size} products`;
  }
  return `categories/products already present — skipped`;
}

async function seedTemplates() {
  const existing = await one("SELECT COUNT(*) AS c FROM templates");
  if (existing.c > 0) return `templates already present — skipped`;
  const CORE = ["company", "productModel", "versionVariant", "sizeVariant", "powerType", "maxPower", "voltageRange", "dimming", "cct", "lightDistribution", "driver", "finish", "manufacturer"];
  const templates = [
    { name: "UFO High Bay", description: "Standard UFO high bay layout", segments: CORE },
    { name: "Linear High Bay", description: "Linear high bay fixtures", segments: CORE },
    { name: "Flood Light", description: "Outdoor flood lighting", segments: [...CORE, "mountingOption"] },
    { name: "Full 22-Segment", description: "Every segment incl. add-ons", segments: [...CORE, "lensType", "emergencyOption", "sensorOption", "surgeProtection", "reflectorCover", "mountingOption", "photocontrolOption", "connectableOption", "base"] },
  ];
  for (const t of templates) {
    await pool.query(
      `INSERT INTO templates (name, description, segments, created_by, usage_count) VALUES (?, ?, ?, 'Jay K.', ?)`,
      [t.name, t.description, JSON.stringify(t.segments), Math.floor((seedData.partNumbers.length / templates.length))],
    );
  }
  return `seeded ${templates.length} templates`;
}

async function seedUsers() {
  const existing = await one("SELECT COUNT(*) AS c FROM users");
  if (existing.c > 0) return `users already present — skipped`;
  for (const u of DEMO_USERS) {
    await pool.query(
      `INSERT INTO users (username, display_name, role, password_hash, status) VALUES (?, ?, ?, ?, 'active')`,
      [u.username, u.display_name, u.role, hashPassword(u.password)],
    );
  }
  return `seeded ${DEMO_USERS.length} users`;
}

async function seedPartNumbers() {
  const existing = await one("SELECT COUNT(*) AS c FROM part_numbers");
  if (existing.c > 0) return `part_numbers already has ${existing.c} rows — skipped`;

  const companies = await q("SELECT id, name FROM companies ORDER BY id");
  const parts = seedData.partNumbers;
  const placeholders = "(" + PART_COLUMNS.map(() => "?").join(", ") + ")";
  let i = 0;
  for (const p of parts) {
    const company = companies[i % companies.length];
    const stage = i % 5 === 0 ? "temporary" : "stocked";
    const values = [
      p.partNumber, p.productCategory, p.productName, p.sku || null, p.productDescription || null,
      p.internalNotes || null, company?.name || null, stage, p.company || "IK", p.productModel,
      p.versionVariant, p.sizeVariant, p.powerType, p.maxPower, p.voltageRange,
      p.dimming, p.cct, p.lightDistribution, p.driver, p.finish, p.manufacturer,
      p.lensType || null, p.emergencyOption || null, p.sensorOption || null, p.surgeProtection || null,
      p.reflectorCover || null, p.mountingOption || null, p.photocontrolOption || null, p.connectableOption || null,
      p.base || null, company?.id || null, p.status || "active", "Import",
    ];
    await pool.query(
      `INSERT INTO part_numbers (${PART_COLUMNS.join(", ")}) VALUES ${placeholders}`,
      values,
    );
    i++;
  }
  return `seeded ${parts.length} part numbers`;
}

export async function seed() {
  await migrate();
  const results = [];
  results.push(await seedSegmentValues());
  results.push(await seedCompanies());
  results.push(await seedCategoriesAndProducts());
  results.push(await seedTemplates());
  results.push(await seedUsers());
  results.push(await seedPartNumbers());
  return results;
}

// Allow running directly: `npm run seed`
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  seed()
    .then((r) => {
      console.log("Seed complete:\n - " + r.join("\n - "));
      return pool.end();
    })
    .catch((e) => {
      console.error(e);
      process.exit(1);
    });
}
