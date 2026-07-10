import { Router } from "express";
import { db, partNumbersTable } from "@workspace/db";
import { eq, count, sql, gte, and } from "drizzle-orm";

const router = Router();

// ─── DASHBOARD STATS ──────────────────────────────────────────────────────────

router.get("/", async (_req, res) => {
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const startOfWeek = new Date(now);
  startOfWeek.setDate(now.getDate() - now.getDay());
  startOfWeek.setHours(0, 0, 0, 0);

  const [
    totalRows,
    statusRows,
    categoriesRow,
    modelsRow,
    monthRow,
    weekRow,
  ] = await Promise.all([
    db.select({ total: count() }).from(partNumbersTable),
    db.select({ status: partNumbersTable.status, cnt: count() })
      .from(partNumbersTable)
      .groupBy(partNumbersTable.status),
    db.select({ cnt: sql<number>`count(distinct ${partNumbersTable.productCategory})` })
      .from(partNumbersTable),
    db.select({ cnt: sql<number>`count(distinct ${partNumbersTable.productModel})` })
      .from(partNumbersTable),
    db.select({ cnt: count() }).from(partNumbersTable)
      .where(gte(partNumbersTable.createdAt, startOfMonth)),
    db.select({ cnt: count() }).from(partNumbersTable)
      .where(gte(partNumbersTable.createdAt, startOfWeek)),
  ]);

  const byStatus: Record<string, number> = {};
  for (const row of statusRows) {
    byStatus[row.status] = Number(row.cnt);
  }

  res.json({
    total: Number(totalRows[0]?.total ?? 0),
    active: byStatus["active"] ?? 0,
    draft: byStatus["draft"] ?? 0,
    deprecated: byStatus["deprecated"] ?? 0,
    totalCategories: Number(categoriesRow[0]?.cnt ?? 0),
    totalModels: Number(modelsRow[0]?.cnt ?? 0),
    createdThisMonth: Number(monthRow[0]?.cnt ?? 0),
    createdThisWeek: Number(weekRow[0]?.cnt ?? 0),
  });
});

// ─── BY CATEGORY ──────────────────────────────────────────────────────────────

router.get("/by-category", async (_req, res) => {
  const rows = await db
    .select({
      category: partNumbersTable.productCategory,
      count: count(),
    })
    .from(partNumbersTable)
    .groupBy(partNumbersTable.productCategory)
    .orderBy(sql`count(*) desc`);
  res.json(rows.map((r) => ({ category: r.category, count: Number(r.count) })));
});

// ─── BY MODEL ─────────────────────────────────────────────────────────────────

router.get("/by-model", async (_req, res) => {
  const rows = await db
    .select({
      model: partNumbersTable.productModel,
      category: partNumbersTable.productCategory,
      count: count(),
    })
    .from(partNumbersTable)
    .groupBy(partNumbersTable.productModel, partNumbersTable.productCategory)
    .orderBy(sql`count(*) desc`);
  res.json(rows.map((r) => ({ model: r.model, category: r.category, count: Number(r.count) })));
});

export default router;
