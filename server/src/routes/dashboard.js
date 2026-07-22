import express from "express";
import { q, one } from "../db.js";

const router = express.Router();

router.get("/", async (_req, res) => {
  const parts = (await one("SELECT COUNT(*) AS c FROM part_numbers")).c;
  const active = (await one("SELECT COUNT(*) AS c FROM part_numbers WHERE status = 'active'")).c;
  const drafts = (await one("SELECT COUNT(*) AS c FROM part_numbers WHERE status = 'draft'")).c;
  const companies = (await one("SELECT COUNT(*) AS c FROM companies")).c;
  const products = (await one("SELECT COUNT(*) AS c FROM products")).c;
  const segmentValues = (await one("SELECT COUNT(*) AS c FROM segment_values")).c;

  const byCategory = await q(
    "SELECT product_category AS name, COUNT(*) AS value FROM part_numbers GROUP BY product_category ORDER BY value DESC LIMIT 8",
  );
  const byStatus = await q(
    "SELECT status AS name, COUNT(*) AS value FROM part_numbers GROUP BY status",
  );
  const topDrivers = await q(
    "SELECT driver AS name, COUNT(*) AS value FROM part_numbers GROUP BY driver ORDER BY value DESC LIMIT 6",
  );
  const recentParts = await q(
    `SELECT p.id, p.part_number, p.product_name, p.status, p.created_at, c.name AS company_name
     FROM part_numbers p LEFT JOIN companies c ON c.id = p.company_id
     ORDER BY p.id DESC LIMIT 6`,
  );
  const recentActivity = await q("SELECT * FROM audit_log ORDER BY id DESC LIMIT 6");

  res.json({
    stats: { parts, active, drafts, companies, products, segmentValues },
    byCategory, byStatus, topDrivers, recentParts, recentActivity,
  });
});

export default router;
