import { pool, q } from "./db.js";

// Maps each segment_values.segment_key to its part_numbers column. Used to
// auto-detect "Used By" (applicable_products) from the parts that actually use
// each code. Keys are hardcoded here — never user input — so interpolating the
// column name into SQL is safe.
const SEGMENT_COLUMNS = {
  company: "company",
  productModel: "product_model",
  versionVariant: "version_variant",
  sizeVariant: "size_variant",
  powerType: "power_type",
  maxPower: "max_power",
  voltageRange: "voltage_range",
  dimming: "dimming",
  cct: "cct",
  lightDistribution: "light_distribution",
  driver: "driver",
  finish: "finish",
  manufacturer: "manufacturer",
  lensType: "lens_type",
  emergencyOption: "emergency_option",
  sensorOption: "sensor_option",
  surgeProtection: "surge_protection",
  reflectorCover: "reflector_cover",
  mountingOption: "mounting_option",
  photocontrolOption: "photocontrol_option",
  connectableOption: "connectable_option",
  base: "base",
};

/**
 * Recompute every segment value's `applicable_products` ("Used By") from the
 * distinct product models that use that code in part_numbers. Never touches
 * `description` — safe to run any time (boot, or after adding parts). Returns
 * the number of segment values touched.
 */
export async function recomputeUsage() {
  let touched = 0;
  for (const [key, col] of Object.entries(SEGMENT_COLUMNS)) {
    const rows = await q(
      `SELECT \`${col}\` AS code, product_model AS model
       FROM part_numbers
       WHERE \`${col}\` IS NOT NULL AND \`${col}\` <> ''
         AND product_model IS NOT NULL AND product_model <> ''
       GROUP BY \`${col}\`, product_model`,
    );
    const byCode = new Map();
    for (const r of rows) {
      if (!byCode.has(r.code)) byCode.set(r.code, new Set());
      byCode.get(r.code).add(r.model);
    }
    const values = await q("SELECT id, code FROM segment_values WHERE segment_key = ?", [key]);
    for (const v of values) {
      const models = byCode.has(v.code) ? [...byCode.get(v.code)].sort() : [];
      await pool.query("UPDATE segment_values SET applicable_products = ? WHERE id = ?", [JSON.stringify(models), v.id]);
      touched++;
    }
  }
  return touched;
}
