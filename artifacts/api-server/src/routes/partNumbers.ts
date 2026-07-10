import { Router } from "express";
import { db, partNumbersTable, segmentValuesTable } from "@workspace/db";
import { eq, ilike, or, and, desc, sql, count } from "drizzle-orm";
import {
  ListPartNumbersQueryParams,
  CreatePartNumberBody,
  UpdatePartNumberBody,
  GetPartNumberParams,
  UpdatePartNumberParams,
  DeletePartNumberParams,
  DuplicatePartNumberParams,
  DecodePartNumberBody,
} from "@workspace/api-zod";

const router = Router();

// ─── Helpers ──────────────────────────────────────────────────────────────────

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

function decodePartNumber(raw: string) {
  // Format: IK-{Model}{Version}-{Size}-{PowerType}{Power}-{Voltage}-{Dimming}-{CCT}-{LightDist}-{Driver}-{Finish}-{Manufacturer}[-opts...]
  const segments = raw.split("-");
  const errors: string[] = [];
  const result: Record<string, string | null> = {
    company: null,
    productModel: null,
    versionVariant: null,
    sizeVariant: null,
    powerType: null,
    maxPower: null,
    voltageRange: null,
    dimming: null,
    cct: null,
    lightDistribution: null,
    driver: null,
    finish: null,
    manufacturer: null,
    lensType: null,
    emergencyOption: null,
    sensorOption: null,
    surgeProtection: null,
    reflectorCover: null,
    mountingOption: null,
    photocontrolOption: null,
    connectableOption: null,
    base: null,
  };

  if (segments.length < 11) {
    return { valid: false, segments: result, errors: ["Part number has too few segments — expected at least 11 dash-separated fields"], parseFailure: true };
  }

  // Segment 0: Company
  result.company = segments[0];
  if (result.company !== "IK") errors.push(`Unexpected company code: ${result.company}`);

  // Segment 1: ProductModel + Version combined (e.g. UHB3, T8G0B)
  const modelVersion = segments[1];
  const modelMatch = modelVersion.match(/^([A-Z]+)(.+)$/);
  if (modelMatch) {
    result.productModel = modelMatch[1];
    result.versionVariant = modelMatch[2];
  } else {
    errors.push(`Cannot parse model/version from: ${modelVersion}`);
  }

  // Segment 2: Size Variant
  result.sizeVariant = segments[2];

  // Segment 3: PowerType + Power (e.g. S0240, F0015)
  const powerSeg = segments[3];
  if (powerSeg && /^[FS]/.test(powerSeg)) {
    result.powerType = powerSeg[0];
    result.maxPower = powerSeg.slice(1);
  } else {
    errors.push(`Cannot parse power type/value from: ${powerSeg}`);
  }

  // Segment 4: Voltage Range
  result.voltageRange = segments[4];

  // Segment 5: Dimming
  result.dimming = segments[5];

  // Segment 6: CCT
  result.cct = segments[6];

  // Segment 7: Light Distribution
  result.lightDistribution = segments[7];

  // Segment 8: Driver
  result.driver = segments[8];

  // Segment 9: Finish
  result.finish = segments[9];

  // Segment 10: Manufacturer
  result.manufacturer = segments[10];

  // Remaining: optional segments
  const optionals = segments.slice(11);
  const lensTypes = ["SC", "SF", "SM", "l"];
  const emergencyOpts = ["EM", "EM2", "EM5", "EMB16", "EM18", "x"];
  const sensorOpts = ["MWS", "PIR", "PC", "y"];
  const surgeOpts = ["10SP", "20SP", "s"];
  const reflectorOpts = ["PCR", "ALR", "r"];
  const mountingOpts = ["SM", "PM", "YM", "SLF", "POM", "FM", "m"];
  const photoOpts = ["3RP", "3NP", "5RP", "5NP", "7RP", "7NP", "p"];
  const connectOpts = ["CN", "N", "XL", "2L", "3L", "4L", "5L", "6L", "c"];
  const baseOpts = ["E39", "EX39", "G24", "GX23", "E26", "b"];

  for (const opt of optionals) {
    if (lensTypes.includes(opt)) result.lensType = opt;
    else if (emergencyOpts.includes(opt)) result.emergencyOption = opt;
    else if (sensorOpts.includes(opt)) result.sensorOption = opt;
    else if (surgeOpts.includes(opt)) result.surgeProtection = opt;
    else if (reflectorOpts.includes(opt)) result.reflectorCover = opt;
    else if (mountingOpts.includes(opt)) result.mountingOption = opt;
    else if (photoOpts.includes(opt)) result.photocontrolOption = opt;
    else if (connectOpts.includes(opt)) result.connectableOption = opt;
    else if (baseOpts.includes(opt)) result.base = opt;
  }

  return { valid: errors.length === 0, segments: result, errors };
}

// ─── LIST ─────────────────────────────────────────────────────────────────────

router.get("/", async (req, res) => {
  const parsed = ListPartNumbersQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid query parameters" });
    return;
  }
  const { page, limit, search, category, productModel, status, cct, finish, voltageRange } = parsed.data;
  const offset = ((page ?? 1) - 1) * (limit ?? 25);

  const conditions = [];
  if (search) {
    conditions.push(
      or(
        ilike(partNumbersTable.partNumber, `%${search}%`),
        ilike(partNumbersTable.productName, `%${search}%`),
        ilike(partNumbersTable.productDescription, `%${search}%`),
        ilike(partNumbersTable.sku, `%${search}%`),
      )
    );
  }
  if (category) conditions.push(ilike(partNumbersTable.productCategory, `%${category}%`));
  if (productModel) conditions.push(eq(partNumbersTable.productModel, productModel));
  if (status) conditions.push(eq(partNumbersTable.status, status));
  if (cct) conditions.push(eq(partNumbersTable.cct, cct));
  if (finish) conditions.push(eq(partNumbersTable.finish, finish));
  if (voltageRange) conditions.push(eq(partNumbersTable.voltageRange, voltageRange));

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const [data, [{ total }]] = await Promise.all([
    db.select().from(partNumbersTable)
      .where(where)
      .orderBy(desc(partNumbersTable.updatedAt))
      .limit(limit ?? 25)
      .offset(offset),
    db.select({ total: count() }).from(partNumbersTable).where(where),
  ]);

  res.json({ data, total: Number(total), page: page ?? 1, limit: limit ?? 25 });
});

// ─── RECENT ───────────────────────────────────────────────────────────────────

router.get("/recent", async (_req, res) => {
  const data = await db.select()
    .from(partNumbersTable)
    .orderBy(desc(partNumbersTable.updatedAt))
    .limit(10);
  res.json(data);
});

// ─── DECODE ───────────────────────────────────────────────────────────────────

router.post("/decode", async (req, res) => {
  const parsed = DecodePartNumberBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "partNumber is required" });
    return;
  }
  const { partNumber } = parsed.data;
  const result = decodePartNumber(partNumber);
  if ((result as any).parseFailure) {
    res.status(400).json({ error: result.errors[0] });
    return;
  }
  res.json({ raw: partNumber, valid: result.valid, segments: result.segments, errors: result.errors });
});

// ─── CREATE ───────────────────────────────────────────────────────────────────

router.post("/", async (req, res) => {
  const parsed = CreatePartNumberBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const data = parsed.data;
  const partNumber = buildPartNumber(data);

  // Check for duplicate
  const existing = await db.select({ id: partNumbersTable.id })
    .from(partNumbersTable)
    .where(eq(partNumbersTable.partNumber, partNumber))
    .limit(1);
  if (existing.length > 0) {
    res.status(409).json({ error: `Part number ${partNumber} already exists` });
    return;
  }

  const [created] = await db.insert(partNumbersTable)
    .values({ ...data, partNumber })
    .returning();
  res.status(201).json(created);
});

// ─── GET ONE ──────────────────────────────────────────────────────────────────

router.get("/:id", async (req, res) => {
  const parsed = GetPartNumberParams.safeParse({ id: Number(req.params.id) });
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const [row] = await db.select().from(partNumbersTable)
    .where(eq(partNumbersTable.id, parsed.data.id));
  if (!row) {
    res.status(404).json({ error: "Part number not found" });
    return;
  }
  res.json(row);
});

// ─── UPDATE ───────────────────────────────────────────────────────────────────

router.patch("/:id", async (req, res) => {
  const paramsParsed = UpdatePartNumberParams.safeParse({ id: Number(req.params.id) });
  if (!paramsParsed.success) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }

  const bodyParsed = UpdatePartNumberBody.safeParse(req.body);
  if (!bodyParsed.success) {
    res.status(400).json({ error: bodyParsed.error.message });
    return;
  }

  const [existing] = await db.select().from(partNumbersTable)
    .where(eq(partNumbersTable.id, paramsParsed.data.id));
  if (!existing) {
    res.status(404).json({ error: "Part number not found" });
    return;
  }

  const updates = bodyParsed.data;
  const merged = { ...existing, ...updates };
  const newPartNumber = buildPartNumber(merged);

  // Check for duplicate only if the part number would change
  if (newPartNumber !== existing.partNumber) {
    const conflict = await db.select({ id: partNumbersTable.id })
      .from(partNumbersTable)
      .where(eq(partNumbersTable.partNumber, newPartNumber))
      .limit(1);
    if (conflict.length > 0) {
      res.status(409).json({ error: `Part number ${newPartNumber} already exists` });
      return;
    }
  }

  const [updated] = await db.update(partNumbersTable)
    .set({ ...updates, partNumber: newPartNumber, updatedAt: new Date() })
    .where(eq(partNumbersTable.id, paramsParsed.data.id))
    .returning();
  res.json(updated);
});

// ─── DELETE ───────────────────────────────────────────────────────────────────

router.delete("/:id", async (req, res) => {
  const parsed = DeletePartNumberParams.safeParse({ id: Number(req.params.id) });
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const [existing] = await db.select({ id: partNumbersTable.id })
    .from(partNumbersTable).where(eq(partNumbersTable.id, parsed.data.id));
  if (!existing) {
    res.status(404).json({ error: "Part number not found" });
    return;
  }
  await db.delete(partNumbersTable).where(eq(partNumbersTable.id, parsed.data.id));
  res.status(204).send();
});

// ─── DUPLICATE ────────────────────────────────────────────────────────────────

router.post("/:id/duplicate", async (req, res) => {
  const parsed = DuplicatePartNumberParams.safeParse({ id: Number(req.params.id) });
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const [existing] = await db.select().from(partNumbersTable)
    .where(eq(partNumbersTable.id, parsed.data.id));
  if (!existing) {
    res.status(404).json({ error: "Part number not found" });
    return;
  }

  // Create a unique part number for the duplicate
  const suffix = `_COPY_${Date.now()}`;
  const { id, createdAt, updatedAt, partNumber, ...rest } = existing;
  const [created] = await db.insert(partNumbersTable)
    .values({ ...rest, partNumber: partNumber + suffix, status: "draft", productName: `${rest.productName} (Copy)` })
    .returning();
  res.status(201).json(created);
});

export default router;
