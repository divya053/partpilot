// Mirror of server/src/segments.js buildPartNumber — for instant client preview.
export const CORE_KEYS = [
  "company", "productModel", "versionVariant", "sizeVariant", "powerType", "maxPower",
  "voltageRange", "dimming", "cct", "lightDistribution", "driver", "finish", "manufacturer",
];
export const OPTIONAL_KEYS = [
  "lensType", "emergencyOption", "sensorOption", "surgeProtection", "reflectorCover",
  "mountingOption", "photocontrolOption", "connectableOption", "base",
];

type Fields = Record<string, string | undefined | null>;

export function buildPartNumber(f: Fields): string {
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

export function partSegments(f: Fields): { label: string; value: string }[] {
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
  const optLabels: Record<string, string> = {
    lensType: "Lens", emergencyOption: "Emergency", sensorOption: "Sensor",
    surgeProtection: "Surge", reflectorCover: "Reflector", mountingOption: "Mounting",
    photocontrolOption: "Photocontrol", connectableOption: "Connectable", base: "Base",
  };
  for (const k of OPTIONAL_KEYS) if (f[k]) chunks.push({ label: optLabels[k], value: String(f[k]) });
  return chunks.filter((c) => c.value);
}
