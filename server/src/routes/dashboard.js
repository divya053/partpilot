import express from "express";
import { q, one } from "../db.js";

const router = express.Router();

const dist = (col, limit) =>
  `SELECT \`${col}\` AS name, COUNT(*) AS value FROM part_numbers
   WHERE \`${col}\` IS NOT NULL AND \`${col}\` <> ''
   GROUP BY \`${col}\` ORDER BY value DESC${limit ? ` LIMIT ${limit}` : ""}`;

router.get("/", async (_req, res) => {
  const parts = (await one("SELECT COUNT(*) AS c FROM part_numbers")).c;
  const active = (await one("SELECT COUNT(*) AS c FROM part_numbers WHERE status = 'active'")).c;
  const drafts = (await one("SELECT COUNT(*) AS c FROM part_numbers WHERE status = 'draft'")).c;
  const deprecated = (await one("SELECT COUNT(*) AS c FROM part_numbers WHERE status = 'deprecated'")).c;
  const companies = (await one("SELECT COUNT(*) AS c FROM companies")).c;
  const products = (await one("SELECT COUNT(*) AS c FROM products")).c;
  const segmentValues = (await one("SELECT COUNT(*) AS c FROM segment_values")).c;
  const withImage = (await one("SELECT COUNT(*) AS c FROM part_numbers WHERE image IS NOT NULL AND image <> ''")).c;
  const withSpec = (await one("SELECT COUNT(*) AS c FROM part_numbers WHERE (vendor_spec_sheet IS NOT NULL AND vendor_spec_sheet <> '') OR (ikio_spec_sheet IS NOT NULL AND ikio_spec_sheet <> '')")).c;

  const byCategory = await q(dist("product_category", 8));
  const byStatus = await q("SELECT status AS name, COUNT(*) AS value FROM part_numbers GROUP BY status");
  const bySeries = await q(dist("product_model", 8));
  const byCct = await q(dist("cct", 8));
  const byFinish = await q(dist("finish", 8));
  const byVoltage = await q(dist("voltage_range", 6));
  const topDrivers = await q(dist("driver", 6));
  const topCompanies = await q(
    `SELECT c.id, c.name AS name, COUNT(*) AS value FROM part_numbers p
     JOIN companies c ON c.id = p.company_id GROUP BY c.id, c.name ORDER BY value DESC LIMIT 6`,
  );
  const monthlyTrend = await q(
    `SELECT DATE_FORMAT(created_at, '%Y-%m') AS ym, COUNT(*) AS value
     FROM part_numbers GROUP BY ym ORDER BY ym`,
  );

  const recentParts = await q(
    `SELECT p.id, p.part_number, p.product_name, p.status, p.image, p.created_at, c.name AS company_name
     FROM part_numbers p LEFT JOIN companies c ON c.id = p.company_id
     ORDER BY p.id DESC LIMIT 6`,
  );
  const recentActivity = await q("SELECT * FROM audit_log ORDER BY id DESC LIMIT 8");

  res.json({
    stats: { parts, active, drafts, deprecated, companies, products, segmentValues, withImage, withSpec },
    byCategory, byStatus, bySeries, byCct, byFinish, byVoltage,
    topDrivers, topCompanies, monthlyTrend, recentParts, recentActivity,
  });
});

export default router;
