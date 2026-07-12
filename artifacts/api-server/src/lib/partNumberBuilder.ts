import type { InferSelectModel } from "drizzle-orm";
import { partNumbersTable, segmentValuesTable } from "@workspace/db";

export type SegmentKey =
  | "company"
  | "productModel"
  | "versionVariant"
  | "sizeVariant"
  | "powerType"
  | "maxPower"
  | "voltageRange"
  | "dimming"
  | "cct"
  | "lightDistribution"
  | "driver"
  | "finish"
  | "manufacturer"
  | "lensType"
  | "emergencyOption"
  | "sensorOption"
  | "surgeProtection"
  | "reflectorCover"
  | "mountingOption"
  | "photocontrolOption"
  | "connectableOption"
  | "base";

export type BuilderField =
  | "productCategory"
  | "productName"
  | SegmentKey;

export type BuilderDraft = Partial<
  Record<
    BuilderField,
    string | null
  >
>;

export type SegmentValueRow = InferSelectModel<typeof segmentValuesTable>;
export type PartNumberRow = InferSelectModel<typeof partNumbersTable>;

export const REQUIRED_CORE_FIELDS: Array<{ key: BuilderField; label: string }> = [
  { key: "productCategory", label: "Product Category" },
  { key: "company", label: "Company" },
  { key: "productModel", label: "Product Model" },
  { key: "versionVariant", label: "Version / Variant" },
  { key: "sizeVariant", label: "Size Variant" },
  { key: "powerType", label: "Power Type" },
  { key: "maxPower", label: "Max Power" },
  { key: "voltageRange", label: "Voltage Range" },
  { key: "dimming", label: "Dimming" },
  { key: "cct", label: "CCT" },
  { key: "lightDistribution", label: "Light Distribution" },
  { key: "driver", label: "Driver" },
  { key: "finish", label: "Finish" },
  { key: "manufacturer", label: "Manufacturer" },
];

export const SEGMENT_FIELD_LABELS: Record<BuilderField, string> = {
  productCategory: "Product Category",
  productName: "Product Name",
  company: "Company",
  productModel: "Product Model",
  versionVariant: "Version / Variant",
  sizeVariant: "Size Variant",
  powerType: "Power Type",
  maxPower: "Max Power",
  voltageRange: "Voltage Range",
  dimming: "Dimming",
  cct: "CCT",
  lightDistribution: "Light Distribution",
  driver: "Driver",
  finish: "Finish",
  manufacturer: "Manufacturer",
  lensType: "Lens Type",
  emergencyOption: "Emergency Option",
  sensorOption: "Sensor Option",
  surgeProtection: "Surge Protection",
  reflectorCover: "Reflector Cover",
  mountingOption: "Mounting Option",
  photocontrolOption: "Photocontrol Option",
  connectableOption: "Connectable Option",
  base: "Base",
};

export const SEGMENT_KEYS: SegmentKey[] = [
  "company",
  "productModel",
  "versionVariant",
  "sizeVariant",
  "powerType",
  "maxPower",
  "voltageRange",
  "dimming",
  "cct",
  "lightDistribution",
  "driver",
  "finish",
  "manufacturer",
  "lensType",
  "emergencyOption",
  "sensorOption",
  "surgeProtection",
  "reflectorCover",
  "mountingOption",
  "photocontrolOption",
  "connectableOption",
  "base",
];

export type CompletePartNumberFields = {
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
};

export function normalizeDraftValue(value: string | null | undefined): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

/**
 * `applicable_products` is stored in a `longtext` column, so mysql2 returns it as a
 * raw JSON string rather than the `string[]` the schema/contract declare. Coerce it
 * back into a real array so applicability checks (and the "empty = applies to all"
 * rule) behave correctly whether the driver hands us a string or an array.
 */
export function parseApplicableProducts(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === "string");
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed === "") {
      return [];
    }
    try {
      const parsed = JSON.parse(trimmed);
      return Array.isArray(parsed)
        ? parsed.filter((item): item is string => typeof item === "string")
        : [];
    } catch {
      return [];
    }
  }

  return [];
}

export function buildPartNumber(fields: CompletePartNumberFields): string {
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

export function canAssemblePartNumber(
  draft: BuilderDraft,
): draft is BuilderDraft & CompletePartNumberFields {
  return REQUIRED_CORE_FIELDS.every(({ key }) => Boolean(normalizeDraftValue(draft[key])));
}

export function createSegmentIndex(segmentRows: SegmentValueRow[]) {
  const byKey = new Map<SegmentKey, SegmentValueRow[]>();
  const byKeyAndCode = new Map<string, SegmentValueRow>();

  for (const rawRow of segmentRows) {
    // Normalize applicableProducts once here so every downstream consumer works
    // with a real string[] instead of the raw JSON string mysql2 returns.
    const row: SegmentValueRow = {
      ...rawRow,
      applicableProducts: parseApplicableProducts(rawRow.applicableProducts),
    };
    const key = row.segmentKey as SegmentKey;
    const rows = byKey.get(key) ?? [];
    rows.push(row);
    byKey.set(key, rows);
    byKeyAndCode.set(`${key}:${row.code}`, row);
  }

  for (const rows of byKey.values()) {
    rows.sort((a, b) => a.sortOrder - b.sortOrder);
  }

  return { byKey, byKeyAndCode };
}

export function scoreSimilarity(draft: BuilderDraft, part: PartNumberRow): number {
  let score = 0;
  const weightedFields: Array<{ key: SegmentKey; points: number }> = [
    { key: "productModel", points: 4 },
    { key: "versionVariant", points: 3 },
    { key: "sizeVariant", points: 3 },
    { key: "powerType", points: 2 },
    { key: "maxPower", points: 3 },
    { key: "voltageRange", points: 2 },
    { key: "dimming", points: 1 },
    { key: "cct", points: 2 },
    { key: "lightDistribution", points: 2 },
    { key: "driver", points: 1 },
    { key: "finish", points: 1 },
    { key: "manufacturer", points: 1 },
  ];

  for (const { key, points } of weightedFields) {
    const draftValue = normalizeDraftValue(draft[key]);
    if (!draftValue) {
      continue;
    }
    if (draftValue === part[key]) {
      score += points;
    }
  }

  return score;
}
