// ─── Canonical segment definitions for the IKIO part-number engine ───────────
// The generated part number is (required, joined by "-"):
//   IK - {productModel}{versionVariant} - {sizeVariant} - {powerType}{maxPower}
//      - {voltageRange} - {dimming} - {cct} - {lightDistribution} - {driver}
//      - {finish} - {manufacturer}   then optional add-ons appended with "-".
// e.g. IK-UHB3-02-S0240-MV-D-CCT-WD-01-BK-BFU-MWS

export const CORE_SEGMENTS = [
  { key: "company", label: "Company", help: "Brand owner code (fixed: IK)." },
  { key: "productModel", label: "Product Model", help: "Fixture family, e.g. UHB = UFO High Bay." },
  { key: "versionVariant", label: "Version / Variant", help: "Generation / series of the model." },
  { key: "sizeVariant", label: "Size Variant", help: "Physical size class." },
  { key: "powerType", label: "Power Type", help: "F = Fixed power, S = Selectable power." },
  { key: "maxPower", label: "Max Power", help: "Max / exact wattage (padded, e.g. 0240 = 240W)." },
  { key: "voltageRange", label: "Voltage Range", help: "LV / MV / HV / MS input range." },
  { key: "dimming", label: "Dimming", help: "D = Dimmable, N = Non-dimmable." },
  { key: "cct", label: "CCT", help: "Colour temperature; CCT = field-selectable." },
  { key: "lightDistribution", label: "Light Distribution", help: "Beam / optic distribution (WD, ND, T2-T5…)." },
  { key: "driver", label: "Driver", help: "Driver brand/model code (e.g. Moso, Sosen)." },
  { key: "finish", label: "Finish", help: "Housing colour (BK, WH, BR, GR, SL, BN)." },
  { key: "manufacturer", label: "Manufacturer", help: "Manufacturing partner (BFU = Bright Future)." },
];

export const OPTIONAL_SEGMENTS = [
  { key: "lensType", label: "Lens Type", letter: "L", help: "Optional lens (SC, SF, SM)." },
  { key: "emergencyOption", label: "Emergency Option", letter: "X", help: "Battery / emergency pack." },
  { key: "sensorOption", label: "Sensor Option", letter: "Y", help: "Integrated sensor (MWS, PIR, PC)." },
  { key: "surgeProtection", label: "Surge Protection", letter: "S", help: "Surge protection level (10SP, 20SP)." },
  { key: "reflectorCover", label: "Reflector / Cover", letter: "R", help: "Reflector or cover (PCR, ALR)." },
  { key: "mountingOption", label: "Mounting Option", letter: "M", help: "Mounting accessory." },
  { key: "photocontrolOption", label: "Photocontrol Option", letter: "P", help: "Photocontrol receptacle." },
  { key: "connectableOption", label: "Connectable Option", letter: "C", help: "Connectable / linkable sets." },
  { key: "base", label: "Base", letter: "B", help: "Lamp base type (E39, E26, G24…)." },
];

export const ALL_SEGMENTS = [...CORE_SEGMENTS, ...OPTIONAL_SEGMENTS];
export const CORE_KEYS = CORE_SEGMENTS.map((s) => s.key);
export const OPTIONAL_KEYS = OPTIONAL_SEGMENTS.map((s) => s.key);
export const ALL_KEYS = ALL_SEGMENTS.map((s) => s.key);

/** Build the composite part number from a fields object. */
export function buildPartNumber(f) {
  const core = [
    f.company || "IK",
    `${f.productModel || ""}${f.versionVariant || ""}`,
    f.sizeVariant || "",
    `${f.powerType || ""}${f.maxPower || ""}`,
    f.voltageRange || "",
    f.dimming || "",
    f.cct || "",
    f.lightDistribution || "",
    f.driver || "",
    f.finish || "",
    f.manufacturer || "BFU",
  ].join("-");

  const optionals = OPTIONAL_KEYS.map((k) => f[k]).filter(Boolean);
  return optionals.length ? `${core}-${optionals.join("-")}` : core;
}

/** Ordered list of visible code chunks for the breakdown badges. */
export function partSegments(f) {
  const chunks = [
    { label: "Company", value: f.company || "IK" },
    { label: "Model", value: `${f.productModel || ""}${f.versionVariant || ""}` },
    { label: "Size", value: f.sizeVariant || "" },
    { label: "Power", value: `${f.powerType || ""}${f.maxPower || ""}` },
    { label: "Voltage", value: f.voltageRange || "" },
    { label: "Dimming", value: f.dimming || "" },
    { label: "CCT", value: f.cct || "" },
    { label: "Distribution", value: f.lightDistribution || "" },
    { label: "Driver", value: f.driver || "" },
    { label: "Finish", value: f.finish || "" },
    { label: "Manufacturer", value: f.manufacturer || "BFU" },
  ];
  for (const s of OPTIONAL_SEGMENTS) {
    if (f[s.key]) chunks.push({ label: s.label, value: f[s.key] });
  }
  return chunks.filter((c) => c.value);
}
