import { Router } from "express";
import { db, partNumbersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { BulkImportPartNumbersBody } from "@workspace/api-zod";
import { requireCap } from "../lib/auth";

const router = Router();

function buildPartNumber(fields: {
  company: string;
  productModel: string;
  versionVariant: string;
  sizeVariant: string;
  powerType: string;
  maxPower: string;
  voltageRange: string;
  dimming: string;
  cct: string;
  lightDistribution: string;
  driver: string;
  finish: string;
  manufacturer: string;
  lensType?: string | null;
  emergencyOption?: string | null;
  sensorOption?: string | null;
  surgeProtection?: string | null;
  reflectorCover?: string | null;
  mountingOption?: string | null;
  photocontrolOption?: string | null;
  connectableOption?: string | null;
  base?: string | null;
}): string {
  const core = [
    fields.company,
    `${fields.productModel}${fields.versionVariant}`,
    fields.sizeVariant,
    `${fields.powerType}${fields.maxPower}`,
    fields.voltageRange,
    fields.dimming,
    fields.cct,
    fields.lightDistribution,
    fields.driver,
    fields.finish,
    fields.manufacturer,
  ].join("-");

  const opts = [
    fields.lensType,
    fields.emergencyOption,
    fields.sensorOption,
    fields.surgeProtection,
    fields.reflectorCover,
    fields.mountingOption,
    fields.photocontrolOption,
    fields.connectableOption,
    fields.base,
  ].filter(Boolean) as string[];

  return opts.length > 0 ? `${core}-${opts.join("-")}` : core;
}

router.post("/", requireCap("import"), async (req, res) => {
  const parsed = BulkImportPartNumbersBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { partNumbers } = parsed.data;
  let created = 0;
  let skipped = 0;
  const errors: { index: number; message: string }[] = [];

  for (let i = 0; i < partNumbers.length; i++) {
    const item = partNumbers[i];
    try {
      const partNumber = buildPartNumber(item as any);
      const existing = await db.select({ id: partNumbersTable.id })
        .from(partNumbersTable)
        .where(eq(partNumbersTable.partNumber, partNumber))
        .limit(1);
      if (existing.length > 0) {
        skipped++;
        continue;
      }
      await db.insert(partNumbersTable).values({ ...item, partNumber } as any);
      created++;
    } catch (e) {
      errors.push({ index: i, message: String(e) });
    }
  }

  res.json({ created, skipped, errors });
});

export default router;
