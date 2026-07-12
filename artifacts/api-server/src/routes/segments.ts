import { Router } from "express";
import { db, segmentValuesTable } from "@workspace/db";
import { eq, and, asc } from "drizzle-orm";
import {
  GetSegmentParams,
  AddSegmentValueParams,
  AddSegmentValueBody,
  UpdateSegmentValueParams,
  UpdateSegmentValueBody,
  DeleteSegmentValueParams,
} from "@workspace/api-zod";
import { parseApplicableProducts } from "../lib/partNumberBuilder";
import type { SegmentValueRow } from "../lib/partNumberBuilder";
import { requireCap } from "../lib/auth";

const router = Router();

// `applicable_products` lives in a longtext column, so mysql2 returns it as a raw
// JSON string. Coerce it to the string[] the API contract promises before serializing.
function serializeSegmentValue(value: SegmentValueRow): SegmentValueRow {
  return { ...value, applicableProducts: parseApplicableProducts(value.applicableProducts) };
}

const VALID_SEGMENT_KEYS = new Set([
  "company","productModel","versionVariant","sizeVariant","powerType","maxPower",
  "voltageRange","dimming","cct","lightDistribution","driver","finish","manufacturer",
  "lensType","emergencyOption","sensorOption","surgeProtection","reflectorCover",
  "mountingOption","photocontrolOption","connectableOption","base",
]);

// Segment definitions — order and label metadata
export const SEGMENT_DEFINITIONS = [
  { key: "company",            label: "Company",                        isRequired: true,  isOptional: false },
  { key: "productModel",       label: "Product Model",                  isRequired: true,  isOptional: false },
  { key: "versionVariant",     label: "Version / Variant",              isRequired: true,  isOptional: false },
  { key: "sizeVariant",        label: "Size Variant",                   isRequired: true,  isOptional: false },
  { key: "powerType",          label: "Selectable / Fixed Power",       isRequired: true,  isOptional: false },
  { key: "maxPower",           label: "Max / Exact Power (W)",          isRequired: true,  isOptional: false },
  { key: "voltageRange",       label: "Voltage Range",                  isRequired: true,  isOptional: false },
  { key: "dimming",            label: "Dimming",                        isRequired: true,  isOptional: false },
  { key: "cct",                label: "CCT",                            isRequired: true,  isOptional: false },
  { key: "lightDistribution",  label: "Light Distribution",             isRequired: true,  isOptional: false },
  { key: "driver",             label: "Driver",                         isRequired: true,  isOptional: false },
  { key: "finish",             label: "Finish",                         isRequired: true,  isOptional: false },
  { key: "manufacturer",       label: "Manufacturer",                   isRequired: true,  isOptional: false },
  { key: "lensType",           label: "Lens Type (L)",                  isRequired: false, isOptional: true  },
  { key: "emergencyOption",    label: "Emergency Option (X)",           isRequired: false, isOptional: true  },
  { key: "sensorOption",       label: "Integrated Sensor (Y)",          isRequired: false, isOptional: true  },
  { key: "surgeProtection",    label: "Surge Protection (S)",           isRequired: false, isOptional: true  },
  { key: "reflectorCover",     label: "Reflector Cover (R)",            isRequired: false, isOptional: true  },
  { key: "mountingOption",     label: "Mounting Option (M)",            isRequired: false, isOptional: true  },
  { key: "photocontrolOption", label: "Photocontrol (P)",               isRequired: false, isOptional: true  },
  { key: "connectableOption",  label: "Connectable / Sets (C)",         isRequired: false, isOptional: true  },
  { key: "base",               label: "Base (B)",                       isRequired: false, isOptional: true  },
];

// ─── LIST ALL SEGMENTS ────────────────────────────────────────────────────────

router.get("/", async (_req, res) => {
  const values = await db.select().from(segmentValuesTable)
    .where(eq(segmentValuesTable.isActive, true))
    .orderBy(asc(segmentValuesTable.sortOrder));

  const result = SEGMENT_DEFINITIONS.map((def) => ({
    ...def,
    values: values.filter((v) => v.segmentKey === def.key).map(serializeSegmentValue),
  }));

  res.json(result);
});

// ─── GET ONE SEGMENT ──────────────────────────────────────────────────────────

router.get("/:key", async (req, res) => {
  const parsed = GetSegmentParams.safeParse({ key: req.params.key });
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid key" });
    return;
  }
  const def = SEGMENT_DEFINITIONS.find((d) => d.key === parsed.data.key);
  if (!def) {
    res.status(404).json({ error: "Segment not found" });
    return;
  }
  const values = await db.select().from(segmentValuesTable)
    .where(eq(segmentValuesTable.segmentKey, parsed.data.key))
    .orderBy(asc(segmentValuesTable.sortOrder));
  res.json({ ...def, values: values.map(serializeSegmentValue) });
});

// ─── ADD VALUE ────────────────────────────────────────────────────────────────

router.post("/:key/values", requireCap("manageSegments"), async (req, res) => {
  const paramsParsed = AddSegmentValueParams.safeParse({ key: req.params.key });
  if (!paramsParsed.success) {
    res.status(400).json({ error: "Invalid key" });
    return;
  }
  const bodyParsed = AddSegmentValueBody.safeParse(req.body);
  if (!bodyParsed.success) {
    res.status(400).json({ error: bodyParsed.error.message });
    return;
  }

  const { key } = paramsParsed.data;
  if (!VALID_SEGMENT_KEYS.has(key)) {
    res.status(404).json({ error: `Unknown segment key: ${key}` });
    return;
  }
  const { code, description, applicableProducts, sortOrder } = bodyParsed.data;

  const existing = await db.select({ id: segmentValuesTable.id })
    .from(segmentValuesTable)
    .where(and(eq(segmentValuesTable.segmentKey, key), eq(segmentValuesTable.code, code)))
    .limit(1);
  if (existing.length > 0) {
    res.status(409).json({ error: `Code ${code} already exists in segment ${key}` });
    return;
  }

  const [{ id }] = await db.insert(segmentValuesTable)
    .values({ segmentKey: key, code, description, applicableProducts: applicableProducts ?? [], sortOrder: sortOrder ?? 0 })
    .$returningId();
  const [created] = await db.select().from(segmentValuesTable)
    .where(eq(segmentValuesTable.id, id));
  res.status(201).json(serializeSegmentValue(created));
});

// ─── UPDATE VALUE ─────────────────────────────────────────────────────────────

router.patch("/:key/values/:code", requireCap("manageSegments"), async (req, res) => {
  const paramsParsed = UpdateSegmentValueParams.safeParse({ key: req.params.key, code: req.params.code });
  if (!paramsParsed.success) {
    res.status(400).json({ error: "Invalid params" });
    return;
  }
  const bodyParsed = UpdateSegmentValueBody.safeParse(req.body);
  if (!bodyParsed.success) {
    res.status(400).json({ error: bodyParsed.error.message });
    return;
  }

  const [row] = await db.select().from(segmentValuesTable)
    .where(and(
      eq(segmentValuesTable.segmentKey, paramsParsed.data.key),
      eq(segmentValuesTable.code, paramsParsed.data.code),
    ));
  if (!row) {
    res.status(404).json({ error: "Segment value not found" });
    return;
  }

  await db.update(segmentValuesTable)
    .set(bodyParsed.data)
    .where(eq(segmentValuesTable.id, row.id))
    .execute();
  const [updated] = await db.select().from(segmentValuesTable)
    .where(eq(segmentValuesTable.id, row.id));
  res.json(serializeSegmentValue(updated));
});

// ─── DELETE VALUE ─────────────────────────────────────────────────────────────

router.delete("/:key/values/:code", requireCap("manageSegments"), async (req, res) => {
  const parsed = DeleteSegmentValueParams.safeParse({ key: req.params.key, code: req.params.code });
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid params" });
    return;
  }

  const [row] = await db.select({ id: segmentValuesTable.id })
    .from(segmentValuesTable)
    .where(and(
      eq(segmentValuesTable.segmentKey, parsed.data.key),
      eq(segmentValuesTable.code, parsed.data.code),
    ));
  if (!row) {
    res.status(404).json({ error: "Segment value not found" });
    return;
  }

  await db.delete(segmentValuesTable).where(eq(segmentValuesTable.id, row.id));
  res.status(204).send();
});

export default router;
