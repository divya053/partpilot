import { Router } from "express";
import { db, partNumbersTable, segmentValuesTable } from "@workspace/db";
import { eq, or, and, desc, sql, count, type SQLWrapper } from "drizzle-orm";
import {
  ListPartNumbersQueryParams,
  CreatePartNumberBody,
  UpdatePartNumberBody,
  GetPartNumberParams,
  UpdatePartNumberParams,
  DeletePartNumberParams,
  DuplicatePartNumberParams,
  DecodePartNumberBody,
  ValidateBuilderPartNumberBody,
} from "@workspace/api-zod";
import {
  buildPartNumber,
  canAssemblePartNumber,
  createSegmentIndex,
  normalizeDraftValue,
  REQUIRED_CORE_FIELDS,
  scoreSimilarity,
  SEGMENT_FIELD_LABELS,
  type BuilderDraft,
  type BuilderField,
  type SegmentKey,
} from "../lib/partNumberBuilder";
import { requireCap } from "../lib/auth";

const router = Router();

// mysql2 hands back JSON columns as raw strings here (same as segment_values'
// applicable_products), so coerce `certificates` to an array before responding.
function parseCertificates(value: unknown): Array<{ name: string; status: string }> | null {
  let arr: unknown = value;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed === "") return null;
    try {
      arr = JSON.parse(trimmed);
    } catch {
      return null;
    }
  }
  if (!Array.isArray(arr)) return null;
  return arr
    .filter((x): x is Record<string, unknown> => !!x && typeof x === "object")
    .map((x) => ({ name: String(x.name ?? ""), status: String(x.status ?? "") }))
    .filter((c) => c.name !== "");
}

function serializePart<T extends { certificates?: unknown }>(row: T): T {
  return { ...row, certificates: parseCertificates(row.certificates) };
}

function containsInsensitive(column: SQLWrapper, value: string) {
  return sql`lower(${column}) like ${`%${value.toLowerCase()}%`}`;
}

function decodePartNumber(raw: string) {
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
    return {
      valid: false,
      segments: result,
      errors: ["Part number has too few segments - expected at least 11 dash-separated fields"],
      parseFailure: true,
    };
  }

  result.company = segments[0];
  if (result.company !== "IK") errors.push(`Unexpected company code: ${result.company}`);

  const modelVersion = segments[1];
  const modelMatch = modelVersion.match(/^([A-Z]+)(.+)$/);
  if (modelMatch) {
    result.productModel = modelMatch[1];
    result.versionVariant = modelMatch[2];
  } else {
    errors.push(`Cannot parse model/version from: ${modelVersion}`);
  }

  result.sizeVariant = segments[2];

  const powerSeg = segments[3];
  if (powerSeg && /^[FS]/.test(powerSeg)) {
    result.powerType = powerSeg[0];
    result.maxPower = powerSeg.slice(1);
  } else {
    errors.push(`Cannot parse power type/value from: ${powerSeg}`);
  }

  result.voltageRange = segments[4];
  result.dimming = segments[5];
  result.cct = segments[6];
  result.lightDistribution = segments[7];
  result.driver = segments[8];
  result.finish = segments[9];
  result.manufacturer = segments[10];

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

router.post("/validate-builder", async (req, res) => {
  const parsed = ValidateBuilderPartNumberBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const draft = parsed.data.draft as BuilderDraft;
  const ignoreId = parsed.data.ignoreId ?? null;

  const missingRequiredFields = REQUIRED_CORE_FIELDS
    .filter(({ key }) => !normalizeDraftValue(draft[key]))
    .map(({ label }) => label);

  const [segmentRows, parts] = await Promise.all([
    db.select().from(segmentValuesTable).where(eq(segmentValuesTable.isActive, true)),
    db.select().from(partNumbersTable).orderBy(desc(partNumbersTable.updatedAt)).limit(250),
  ]);

  const { byKey, byKeyAndCode } = createSegmentIndex(segmentRows);
  const requiredFieldSet = new Set(REQUIRED_CORE_FIELDS.map((item) => item.key));
  const selectedModel = normalizeDraftValue(draft.productModel);
  const fieldIssues: Array<{ field: string; message: string; severity: "error" | "warning" }> = [];

  for (const [field, rawValue] of Object.entries(draft) as Array<[BuilderField, string | null | undefined]>) {
    if (field === "productCategory" || field === "productName") {
      continue;
    }

    const value = normalizeDraftValue(rawValue);
    if (!value) {
      continue;
    }

    const key = field as SegmentKey;
    const match = byKeyAndCode.get(`${key}:${value}`);

    if (!match) {
      fieldIssues.push({
        field,
        message: `${SEGMENT_FIELD_LABELS[field]} value "${value}" is not an active allowed code.`,
        severity: "error",
      });
      continue;
    }

    if (
      selectedModel &&
      match.applicableProducts.length > 0 &&
      !match.applicableProducts.includes(selectedModel)
    ) {
      fieldIssues.push({
        field,
        message: `${value} is not marked as applicable to product model ${selectedModel}.`,
        severity: requiredFieldSet.has(field) ? "error" : "warning",
      });
    }
  }

  if (!normalizeDraftValue(draft.productName)) {
    fieldIssues.push({
      field: "productName",
      message: "Product Name is empty. The builder can still create a fallback name, but you should review it.",
      severity: "warning",
    });
  }

  const assembledPartNumber = canAssemblePartNumber(draft) ? buildPartNumber(draft) : null;
  const duplicateMatch = assembledPartNumber
    ? parts.find((part) => part.partNumber === assembledPartNumber && part.id !== ignoreId)
    : undefined;

  const similarMatches = parts
    .filter((part) => part.id !== ignoreId)
    .map((part) => ({
      part,
      similarityScore: scoreSimilarity(draft, part),
    }))
    .filter(({ part, similarityScore }) => {
      if (duplicateMatch && part.id === duplicateMatch.id) {
        return false;
      }
      return similarityScore >= 8;
    })
    .sort((a, b) => b.similarityScore - a.similarityScore)
    .slice(0, 5)
    .map(({ part, similarityScore }) => ({
      id: part.id,
      partNumber: part.partNumber,
      productName: part.productName,
      productCategory: part.productCategory,
      status: part.status,
      similarityScore,
    }));

  const fieldsNeedingSuggestions = new Set<SegmentKey>();
  for (const { key } of REQUIRED_CORE_FIELDS) {
    if (key !== "productCategory" && key !== "productName" && !normalizeDraftValue(draft[key])) {
      fieldsNeedingSuggestions.add(key as SegmentKey);
    }
  }
  for (const issue of fieldIssues) {
    if (issue.field !== "productCategory" && issue.field !== "productName" && issue.field in SEGMENT_FIELD_LABELS) {
      fieldsNeedingSuggestions.add(issue.field as SegmentKey);
    }
  }

  const nextSuggestions = [...fieldsNeedingSuggestions]
    .map((field) => {
      const values = (byKey.get(field) ?? [])
        .filter((row) => {
          if (!selectedModel) {
            return true;
          }
          return row.applicableProducts.length === 0 || row.applicableProducts.includes(selectedModel);
        })
        .slice(0, 5)
        .map((row) => ({
          code: row.code,
          description: row.description,
        }));

      return {
        field,
        label: SEGMENT_FIELD_LABELS[field],
        values,
      };
    })
    .filter((item) => item.values.length > 0);

  const hasErrors = fieldIssues.some((issue) => issue.severity === "error");

  res.json({
    assembledPartNumber,
    isReadyToCreate: missingRequiredFields.length === 0 && !hasErrors && !duplicateMatch,
    missingRequiredFields,
    fieldIssues,
    duplicateMatch: duplicateMatch
      ? {
          id: duplicateMatch.id,
          partNumber: duplicateMatch.partNumber,
          productName: duplicateMatch.productName,
          productCategory: duplicateMatch.productCategory,
          status: duplicateMatch.status,
          similarityScore: 999,
        }
      : null,
    similarMatches,
    nextSuggestions,
  });
});

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
        containsInsensitive(partNumbersTable.partNumber, search),
        containsInsensitive(partNumbersTable.productName, search),
        containsInsensitive(partNumbersTable.productDescription, search),
        containsInsensitive(partNumbersTable.sku, search),
      ),
    );
  }
  if (category) conditions.push(containsInsensitive(partNumbersTable.productCategory, category));
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

  res.json({ data: data.map(serializePart), total: Number(total), page: page ?? 1, limit: limit ?? 25 });
});

router.get("/recent", async (_req, res) => {
  const data = await db.select()
    .from(partNumbersTable)
    .orderBy(desc(partNumbersTable.updatedAt))
    .limit(10);
  res.json(data.map(serializePart));
});

router.post("/decode", async (req, res) => {
  const parsed = DecodePartNumberBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "partNumber is required" });
    return;
  }

  const { partNumber } = parsed.data;
  const result = decodePartNumber(partNumber);
  if ((result as { parseFailure?: boolean }).parseFailure) {
    res.status(400).json({ error: result.errors[0] });
    return;
  }

  res.json({ raw: partNumber, valid: result.valid, segments: result.segments, errors: result.errors });
});

router.post("/", requireCap("create"), async (req, res) => {
  const parsed = CreatePartNumberBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const data = parsed.data;
  const partNumber = buildPartNumber(data);

  const existing = await db.select({ id: partNumbersTable.id })
    .from(partNumbersTable)
    .where(eq(partNumbersTable.partNumber, partNumber))
    .limit(1);
  if (existing.length > 0) {
    res.status(409).json({ error: `Part number ${partNumber} already exists` });
    return;
  }

  const [{ id }] = await db.insert(partNumbersTable)
    .values({ ...data, partNumber })
    .$returningId();
  const [created] = await db.select().from(partNumbersTable)
    .where(eq(partNumbersTable.id, id));
  res.status(201).json(serializePart(created));
});

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

  res.json(serializePart(row));
});

router.patch("/:id", requireCap("edit"), async (req, res) => {
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

  await db.update(partNumbersTable)
    .set({ ...updates, partNumber: newPartNumber, updatedAt: new Date() })
    .where(eq(partNumbersTable.id, paramsParsed.data.id))
    .execute();
  const [updated] = await db.select().from(partNumbersTable)
    .where(eq(partNumbersTable.id, paramsParsed.data.id));
  res.json(serializePart(updated));
});

router.delete("/:id", requireCap("delete"), async (req, res) => {
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

router.post("/:id/duplicate", requireCap("duplicate"), async (req, res) => {
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

  const suffix = `_COPY_${Date.now()}`;
  const { id, createdAt, updatedAt, partNumber, ...rest } = existing;
  const [{ id: duplicateId }] = await db.insert(partNumbersTable)
    .values({
      ...rest,
      partNumber: partNumber + suffix,
      status: "draft",
      productName: `${rest.productName} (Copy)`,
    })
    .$returningId();
  const [created] = await db.select().from(partNumbersTable)
    .where(eq(partNumbersTable.id, duplicateId));
  res.status(201).json(serializePart(created));
});

export default router;
