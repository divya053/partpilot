import fs from "node:fs";
import path from "node:path";
import XLSX from "xlsx";
import { db, partNumbersTable, pool, segmentValuesTable } from "@workspace/db";

type SegmentKey =
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

type PartNumberInsert = typeof partNumbersTable.$inferInsert;
type SegmentValueInsert = typeof segmentValuesTable.$inferInsert;
type PartNumberDraft = Omit<PartNumberInsert, "partNumber">;

const DROPDOWN_HEADER_TO_KEY: Record<string, SegmentKey> = {
  "Company": "company",
  "Product Model": "productModel",
  "Version/Variant": "versionVariant",
  "Size Variant": "sizeVariant",
  "Selectable/Fixed Power": "powerType",
  "Max/Exact Power": "maxPower",
  "Voltage Range": "voltageRange",
  "Dimming": "dimming",
  "CCTs": "cct",
  "Light Distribution": "lightDistribution",
  "Driver": "driver",
  "Finish": "finish",
  "Manufacturer": "manufacturer",
  "Lens Type \"L\"": "lensType",
  "Emergency Option \"X\"": "emergencyOption",
  "Integraetd Sensor Options \"Y\"": "sensorOption",
  "Surge Protection Options  \"S\"": "surgeProtection",
  "Reflector Cover Options  \"R\"": "reflectorCover",
  "Mounting Options  \"M\"": "mountingOption",
  "Photocontrol Options  \"P\"": "photocontrolOption",
  "Connectable in Series or not/Sets Options  \"C\"": "connectableOption",
  "Base \"B\"": "base",
};

const DESCRIPTION_SECTION_TO_KEY: Record<string, SegmentKey> = {
  "Product Model": "productModel",
  "Genreration/Series/Varient Type": "versionVariant",
  "Size Variant": "sizeVariant",
  "Selectable/Fixed Power": "powerType",
  "Voltage Range": "voltageRange",
  "Dimming": "dimming",
  "Light Distribution": "lightDistribution",
  "Driver": "driver",
  "Finish": "finish",
  "Lens Type \"L\"": "lensType",
  "Emergency Option \"X\"": "emergencyOption",
  "Integraetd Sensor Options \"Y\"": "sensorOption",
  "Surge Protection Options  \"S\"": "surgeProtection",
  "Reflector Cover Options  \"R\"": "reflectorCover",
  "Mounting Options  \"M\"": "mountingOption",
  "Photocontrol Options  \"P\"": "photocontrolOption",
  "Connectable in Series or not Options  \"C\"": "connectableOption",
  "Base  \"B\"": "base",
};

const OPTIONAL_PLACEHOLDERS = new Set([
  "l",
  "x",
  "y",
  "s",
  "r",
  "m",
  "p",
  "c",
  "b",
]);

const PART_ROW_INDEX = {
  productCategory: 0,
  productName: 1,
  sku: 2,
  productDescription: 3,
  internalNotes: 4,
  company: 6,
  productModel: 8,
  versionVariant: 9,
  sizeVariant: 11,
  powerType: 13,
  maxPower: 14,
  voltageRange: 16,
  dimming: 18,
  cct: 20,
  lightDistribution: 22,
  driver: 24,
  finish: 26,
  manufacturer: 28,
  lensType: 30,
  emergencyOption: 31,
  sensorOption: 32,
  surgeProtection: 33,
  reflectorCover: 34,
  mountingOption: 35,
  photocontrolOption: 36,
  connectableOption: 37,
  base: 38,
} as const;

function loadEnvFile(): void {
  if (process.env.DATABASE_URL) {
    return;
  }

  const envPath = path.resolve(process.cwd(), "artifacts/api-server/.env");
  if (!fs.existsSync(envPath)) {
    return;
  }

  const contents = fs.readFileSync(envPath, "utf8");
  for (const rawLine of contents.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }
    const eq = line.indexOf("=");
    if (eq <= 0) {
      continue;
    }
    const key = line.slice(0, eq).trim();
    const value = line.slice(eq + 1).trim();
    if (!(key in process.env)) {
      process.env[key] = value;
    }
  }
}

function findWorkbookPath(): string {
  const argPath = process.argv[2];
  const candidates = [
    argPath,
    "C:/Users/IKIO/Downloads/PART Number Builder Template_Divya.xlsx",
    path.resolve(
      process.cwd(),
      "attached_assets/PART_Number_Builder_Template_Divya_1783666889355.xlsx",
    ),
  ].filter(Boolean) as string[];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return path.resolve(candidate);
    }
  }

  throw new Error(
    `Workbook not found. Tried:\n${candidates.map((candidate) => `- ${candidate}`).join("\n")}`,
  );
}

function readSheetRows(workbook: XLSX.WorkBook, sheetName: string): unknown[][] {
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) {
    throw new Error(`Sheet "${sheetName}" not found in workbook`);
  }

  return XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    raw: false,
    defval: null,
    blankrows: false,
  }) as unknown[][];
}

function cleanCell(value: unknown, collapseWhitespace = true): string | null {
  if (value == null) {
    return null;
  }

  const text = String(value)
    .replace(/\r\n/g, "\n")
    .replace(/\u00a0/g, " ")
    .trim();

  if (!text || text === "-") {
    return null;
  }

  return collapseWhitespace ? text.replace(/[ \t]+/g, " ") : text;
}

function isOptionalPlaceholder(code: string): boolean {
  return OPTIONAL_PLACEHOLDERS.has(code);
}

function buildPartNumber(fields: Pick<
  PartNumberInsert,
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
  | "base"
>): string {
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

  const optionals = [
    fields.lensType,
    fields.emergencyOption,
    fields.sensorOption,
    fields.surgeProtection,
    fields.reflectorCover,
    fields.mountingOption,
    fields.photocontrolOption,
    fields.connectableOption,
    fields.base,
  ].filter(Boolean);

  return optionals.length > 0 ? `${core}-${optionals.join("-")}` : core;
}

function collectDescriptionMap(rows: unknown[][]): Map<string, string> {
  const descriptions = new Map<string, string>();
  let currentKey: SegmentKey | null = null;

  for (const row of rows) {
    const sectionName = cleanCell(row[0]);
    if (sectionName && DESCRIPTION_SECTION_TO_KEY[sectionName]) {
      currentKey = DESCRIPTION_SECTION_TO_KEY[sectionName];
    } else if (sectionName && !DESCRIPTION_SECTION_TO_KEY[sectionName]) {
      currentKey = null;
    }

    if (!currentKey) {
      continue;
    }

    const code = cleanCell(row[1]);
    const description = cleanCell(row[2], false);
    if (!code || !description) {
      continue;
    }

    descriptions.set(`${currentKey}:${code}`, description);
  }

  return descriptions;
}

function parsePartNumbers(rows: unknown[][]): PartNumberInsert[] {
  const byPartNumber = new Map<string, PartNumberInsert>();

  for (const row of rows.slice(4)) {
    const productCategory = cleanCell(row[PART_ROW_INDEX.productCategory]);
    const productModel = cleanCell(row[PART_ROW_INDEX.productModel]);
    if (!productCategory || !productModel) {
      continue;
    }

    const record: PartNumberDraft = {
      productCategory,
      productName: cleanCell(row[PART_ROW_INDEX.productName]) ?? "Unnamed Product",
      sku: cleanCell(row[PART_ROW_INDEX.sku]),
      productDescription: cleanCell(row[PART_ROW_INDEX.productDescription], false),
      internalNotes: cleanCell(row[PART_ROW_INDEX.internalNotes], false),
      company: cleanCell(row[PART_ROW_INDEX.company]) ?? "IK",
      productModel,
      versionVariant: cleanCell(row[PART_ROW_INDEX.versionVariant]) ?? "",
      sizeVariant: cleanCell(row[PART_ROW_INDEX.sizeVariant]) ?? "",
      powerType: cleanCell(row[PART_ROW_INDEX.powerType]) ?? "",
      maxPower: cleanCell(row[PART_ROW_INDEX.maxPower]) ?? "",
      voltageRange: cleanCell(row[PART_ROW_INDEX.voltageRange]) ?? "",
      dimming: cleanCell(row[PART_ROW_INDEX.dimming]) ?? "",
      cct: cleanCell(row[PART_ROW_INDEX.cct]) ?? "",
      lightDistribution: cleanCell(row[PART_ROW_INDEX.lightDistribution]) ?? "",
      driver: cleanCell(row[PART_ROW_INDEX.driver]) ?? "",
      finish: cleanCell(row[PART_ROW_INDEX.finish]) ?? "",
      manufacturer: cleanCell(row[PART_ROW_INDEX.manufacturer]) ?? "BFU",
      lensType: cleanCell(row[PART_ROW_INDEX.lensType]),
      emergencyOption: cleanCell(row[PART_ROW_INDEX.emergencyOption]),
      sensorOption: cleanCell(row[PART_ROW_INDEX.sensorOption]),
      surgeProtection: cleanCell(row[PART_ROW_INDEX.surgeProtection]),
      reflectorCover: cleanCell(row[PART_ROW_INDEX.reflectorCover]),
      mountingOption: cleanCell(row[PART_ROW_INDEX.mountingOption]),
      photocontrolOption: cleanCell(row[PART_ROW_INDEX.photocontrolOption]),
      connectableOption: cleanCell(row[PART_ROW_INDEX.connectableOption]),
      base: cleanCell(row[PART_ROW_INDEX.base]),
      status: "active",
    };

    const requiredFields = [
      record.company,
      record.productModel,
      record.versionVariant,
      record.sizeVariant,
      record.powerType,
      record.maxPower,
      record.voltageRange,
      record.dimming,
      record.cct,
      record.lightDistribution,
      record.driver,
      record.finish,
      record.manufacturer,
    ];

    if (requiredFields.some((field) => !field)) {
      continue;
    }

    const partNumber = buildPartNumber(record);
    byPartNumber.set(partNumber, { ...record, partNumber });
  }

  return [...byPartNumber.values()];
}

function collectApplicableProducts(partNumbers: PartNumberInsert[]): Map<string, string[]> {
  const usage = new Map<string, Set<string>>();
  const segmentKeys: SegmentKey[] = [
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

  for (const part of partNumbers) {
    for (const segmentKey of segmentKeys) {
      const code = part[segmentKey];
      if (!code) {
        continue;
      }

      const mapKey = `${segmentKey}:${code}`;
      const products = usage.get(mapKey) ?? new Set<string>();
      products.add(part.productModel);
      usage.set(mapKey, products);
    }
  }

  return new Map(
    [...usage.entries()].map(([key, products]) => [key, [...products].sort()]),
  );
}

function parseSegmentValues(
  rows: unknown[][],
  descriptions: Map<string, string>,
  applicableProducts: Map<string, string[]>,
): SegmentValueInsert[] {
  const headers = rows[0] ?? [];
  const values = new Map<string, SegmentValueInsert>();

  for (let columnIndex = 0; columnIndex < headers.length; columnIndex += 1) {
    const header = cleanCell(headers[columnIndex]);
    if (!header) {
      continue;
    }

    const segmentKey = DROPDOWN_HEADER_TO_KEY[header];
    if (!segmentKey) {
      continue;
    }

    let sortOrder = 0;
    for (let rowIndex = 1; rowIndex < rows.length; rowIndex += 1) {
      const code = cleanCell(rows[rowIndex]?.[columnIndex]);
      if (!code) {
        continue;
      }
      if (isOptionalPlaceholder(code)) {
        continue;
      }

      const description =
        descriptions.get(`${segmentKey}:${code}`) ??
        (segmentKey === "company" ? "IK Lighting" : code);
      const mapKey = `${segmentKey}:${code}`;

      values.set(mapKey, {
        segmentKey,
        code,
        description,
        applicableProducts: applicableProducts.get(mapKey) ?? [],
        sortOrder,
        isActive: true,
      });
      sortOrder += 1;
    }
  }

  return [...values.values()];
}

async function main(): Promise<void> {
  loadEnvFile();
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is required. Set it or provide artifacts/api-server/.env");
  }

  const workbookPath = findWorkbookPath();
  const workbook = XLSX.readFile(workbookPath, { cellDates: false });

  const dropdownRows = readSheetRows(workbook, "Dropdown Values");
  const descriptionRows = readSheetRows(workbook, "Value Descriptions");
  const partRows = readSheetRows(workbook, "Part Number Builder R1");

  const partNumbers = parsePartNumbers(partRows);
  const descriptions = collectDescriptionMap(descriptionRows);
  const applicableProducts = collectApplicableProducts(partNumbers);
  const segmentValues = parseSegmentValues(dropdownRows, descriptions, applicableProducts);

  for (const segmentValue of segmentValues) {
    await db
      .insert(segmentValuesTable)
      .values(segmentValue)
      .onDuplicateKeyUpdate({
        set: {
          description: segmentValue.description,
          applicableProducts: segmentValue.applicableProducts,
          sortOrder: segmentValue.sortOrder,
          isActive: segmentValue.isActive,
        },
      });
  }

  for (const partNumber of partNumbers) {
    await db
      .insert(partNumbersTable)
      .values(partNumber)
      .onDuplicateKeyUpdate({
        set: {
          productCategory: partNumber.productCategory,
          productName: partNumber.productName,
          sku: partNumber.sku,
          productDescription: partNumber.productDescription,
          internalNotes: partNumber.internalNotes,
          company: partNumber.company,
          productModel: partNumber.productModel,
          versionVariant: partNumber.versionVariant,
          sizeVariant: partNumber.sizeVariant,
          powerType: partNumber.powerType,
          maxPower: partNumber.maxPower,
          voltageRange: partNumber.voltageRange,
          dimming: partNumber.dimming,
          cct: partNumber.cct,
          lightDistribution: partNumber.lightDistribution,
          driver: partNumber.driver,
          finish: partNumber.finish,
          manufacturer: partNumber.manufacturer,
          lensType: partNumber.lensType,
          emergencyOption: partNumber.emergencyOption,
          sensorOption: partNumber.sensorOption,
          surgeProtection: partNumber.surgeProtection,
          reflectorCover: partNumber.reflectorCover,
          mountingOption: partNumber.mountingOption,
          photocontrolOption: partNumber.photocontrolOption,
          connectableOption: partNumber.connectableOption,
          base: partNumber.base,
          status: partNumber.status,
          updatedAt: new Date(),
        },
      });
  }

  console.log(`Imported ${segmentValues.length} segment values`);
  console.log(`Imported ${partNumbers.length} part numbers`);
  console.log(`Workbook: ${workbookPath}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
