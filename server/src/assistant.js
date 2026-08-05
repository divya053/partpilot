import { q, one } from "./db.js";
import { CORE_SEGMENTS, OPTIONAL_SEGMENTS } from "./segments.js";
import { aiEnabled, chat } from "./ai.js";

const ALL = [...CORE_SEGMENTS, ...OPTIONAL_SEGMENTS];
const snake = (s) => s.replace(/[A-Z]/g, (m) => "_" + m.toLowerCase());

async function loadSegValues(activeOnly = false) {
  const rows = await q(
    `SELECT segment_key, code, description FROM segment_values ${activeOnly ? "WHERE is_active = 1" : ""}`,
  );
  return rows.map((v) => ({ ...v, segment_key: camelKey(v.segment_key) }));
}

// ─── Progressive next-field suggestions + warnings ───────────────────────────
// Learns from the real part numbers (seeded from the master Excel and every
// part built since). As each field is filled the basis NARROWS to the parts
// that match everything picked so far, so the suggestion for the next field is
// "what everyone else who built this far chose". Falls back gracefully so it
// keeps helping even for brand-new combinations. Also returns `nextField` — the
// first still-empty required segment — so the builder can guide the user.
const CORE_MATCH = CORE_SEGMENTS.filter((s) => s.key !== "company");

export async function computeSuggestions(draft = {}) {
  const all = await q("SELECT * FROM part_numbers");
  const val = (k) => String(draft[k] ?? "").trim();

  // Narrow to parts matching every CORE field already chosen.
  const filledCore = CORE_MATCH.filter((s) => val(s.key));
  const matchOn = (keys) => all.filter((p) => keys.every((s) => String(p[snake(s.key)] ?? "") === val(s.key)));
  let parts = matchOn(filledCore);
  let scope = filledCore.length ? "matching parts" : "registry";
  // Fallbacks: relax to same series, then whole registry, so suggestions persist.
  if (!parts.length && val("productModel")) { parts = all.filter((p) => String(p.product_model ?? "") === val("productModel")); scope = "same series"; }
  if (!parts.length) { parts = all; scope = "registry"; }

  const basisCount = parts.length;
  const suggestions = [];
  const warnings = [];
  let nextField = null;

  for (const s of ALL) {
    if (s.key === "productModel" || s.key === "company") continue;
    const col = snake(s.key);
    const freq = new Map();
    for (const p of parts) { const v = p[col]; if (v != null && v !== "") freq.set(v, (freq.get(v) || 0) + 1); }

    const chosen = val(s.key);
    const isCore = CORE_MATCH.some((c) => c.key === s.key);
    if (chosen) {
      const cnt = freq.get(chosen) || 0;
      if (basisCount >= 5 && cnt === 0) {
        warnings.push({ key: s.key, label: s.label, code: chosen, message: `${s.label} “${chosen}” isn't used by any of the ${basisCount} matching parts — double-check it.` });
      } else if (basisCount >= 8 && cnt / basisCount < 0.1) {
        warnings.push({ key: s.key, label: s.label, code: chosen, message: `${s.label} “${chosen}” is unusual here — only ${cnt} of ${basisCount} matching parts use it.` });
      }
    } else {
      if (isCore && !nextField) nextField = s.key; // first empty required field = guide here
      if (freq.size) {
        const [top, cnt] = [...freq.entries()].sort((a, b) => b[1] - a[1])[0];
        const share = cnt / basisCount;
        const isOptional = OPTIONAL_SEGMENTS.some((o) => o.key === s.key);
        if (!isOptional || share >= 0.5) {
          suggestions.push({ key: s.key, label: s.label, code: top, count: cnt, share: Math.round(share * 100) });
        }
      }
    }
  }
  return { basisCount, scope, suggestions, warnings, nextField };
}

// ─── Plain-English → segment codes ───────────────────────────────────────────
// Deterministic matcher first (works with no AI key): match wattage patterns
// and each catalog value's description/code against the text. When an LLM is
// configured it refines the mapping, but every code it returns is validated
// against the real catalog — it can never invent one.
export async function parseDescription(text, { useAi = true } = {}) {
  const segValues = await loadSegValues(true);
  const byKey = new Map();
  for (const v of segValues) {
    if (!byKey.has(v.segment_key)) byKey.set(v.segment_key, []);
    byKey.get(v.segment_key).push(v);
  }

  const fields = {};
  const lower = ` ${String(text).toLowerCase()} `;

  // Wattage: "240W", "240 watt" → maxPower code with the same numeric value.
  const wm = String(text).match(/(\d{2,4})\s*w(att)?s?\b/i);
  if (wm) {
    const watts = Number(wm[1]);
    const hit = (byKey.get("maxPower") || []).find((v) => Number(v.code) === watts);
    if (hit) fields.maxPower = hit.code;
  }

  // Description/code containment, longest description wins per segment.
  for (const s of ALL) {
    if (fields[s.key]) continue;
    let best = null;
    for (const v of byKey.get(s.key) || []) {
      const desc = String(v.description || "").toLowerCase();
      if (desc.length >= 3 && lower.includes(desc)) {
        if (!best || desc.length > best.len) best = { code: v.code, len: desc.length };
        continue;
      }
      // Word-level: all 4+ char words of the description present in the text.
      // A SINGLE such word must be distinctive (≥5 chars) — otherwise common
      // words like "type"/"full"/"wide" cause false matches across segments
      // (e.g. "type IV" distribution wrongly hitting variant "0A - Type A").
      const words = desc.split(/[^a-z0-9]+/).filter((w) => w.length >= 4);
      if (words.length && words.every((w) => lower.includes(w)) && (words.length >= 2 || words[0].length >= 5)) {
        const len = words.join(" ").length;
        if (!best || len > best.len) best = { code: v.code, len };
        continue;
      }
      if (v.code.length >= 2 && new RegExp(`\\b${v.code.toLowerCase()}\\b`).test(lower)) {
        if (!best || v.code.length > best.len) best = { code: v.code, len: v.code.length };
      }
    }
    if (best) fields[s.key] = best.code;
  }

  if (!useAi || !aiEnabled()) return { fields, source: "deterministic" };

  // LLM refinement over the SAME catalog, strictly validated.
  try {
    const catalog = ALL.map((s) => {
      const vals = (byKey.get(s.key) || []).map((v) => `${v.code}=${v.description}`).join(" | ");
      return `${s.key} (${s.label}): ${vals}`;
    }).join("\n");
    const raw = await chat([
      { role: "system", content: "You map fixture descriptions to IKIO part-number segment codes. Respond with ONLY a JSON object of segmentKey: code pairs. Use ONLY codes present in the catalog. Omit segments the description doesn't mention." },
      { role: "user", content: `Catalog:\n${catalog}\n\nDescription: ${text}\n\nJSON:` },
    ], { temperature: 0 });
    const cleaned = raw.replace(/```json|```/g, "").trim();
    const parsed = JSON.parse(cleaned.slice(cleaned.indexOf("{"), cleaned.lastIndexOf("}") + 1));
    const validated = {};
    for (const [k, val] of Object.entries(parsed)) {
      const seg = ALL.find((s) => s.key === k);
      if (!seg) continue;
      const hit = (byKey.get(k) || []).find((v) => v.code.toUpperCase() === String(val).toUpperCase());
      if (hit) validated[k] = hit.code;
    }
    // LLM result wins where it found something; deterministic fills the gaps.
    return { fields: { ...fields, ...validated }, source: "ai" };
  } catch {
    return { fields, source: "deterministic" };
  }
}

// ─── Decode any part number (known or not) ───────────────────────────────────
export async function decodePartNumber(input) {
  const pn = String(input || "").trim().toUpperCase();
  if (!pn) return { partNumber: pn, found: false, segments: [] };
  const segValues = await loadSegValues(false);
  const descLookup = new Map(segValues.map((v) => [`${v.segment_key}:${v.code}`, v.description]));
  const desc = (key, code) => descLookup.get(`${key}:${code}`) || code;

  const row = await one("SELECT * FROM part_numbers WHERE part_number = ?", [pn]);
  if (row) {
    const segments = [];
    for (const s of ALL) {
      const code = row[snake(s.key)];
      if (!code) continue;
      segments.push({ key: s.key, label: s.label, code, description: desc(s.key, code) });
    }
    return { partNumber: pn, found: true, productName: row.product_name, status: row.status, createdBy: row.created_by, id: row.id, segments };
  }

  // Positional parse for numbers not in the registry.
  const tokens = pn.split("-").filter(Boolean);
  const segments = [];
  const push = (key, label, code) => segments.push({ key, label, code, description: desc(key, code) });
  if (tokens.length >= 4) {
    push("company", "Company", tokens[0]);
    const modelCodes = segValues.filter((v) => v.segment_key === "productModel").map((v) => v.code)
      .sort((a, b) => b.length - a.length);
    const mv = tokens[1] || "";
    const model = modelCodes.find((m) => mv.startsWith(m));
    if (model) {
      push("productModel", "Product Model", model);
      if (mv.length > model.length) push("versionVariant", "Version / Variant", mv.slice(model.length));
    } else if (mv) push("productModel", "Product Model", mv);
    const rest = tokens.slice(2);
    const coreOrder = [
      ["sizeVariant", "Size Variant"], ["__power__", "Power"], ["voltageRange", "Voltage Range"],
      ["dimming", "Dimming"], ["cct", "CCT"], ["lightDistribution", "Light Distribution"],
      ["driver", "Driver"], ["finish", "Finish"], ["manufacturer", "Manufacturer"],
    ];
    let i = 0;
    for (const [key, label] of coreOrder) {
      if (i >= rest.length) break;
      const tok = rest[i++];
      if (key === "__power__") {
        const m = tok.match(/^([FS])(\d+)$/);
        if (m) { push("powerType", "Power Type", m[1]); push("maxPower", "Max Power", m[2]); }
        else push("maxPower", "Power", tok);
      } else push(key, label, tok);
    }
    // Remaining tokens = optional add-ons; find which optional segment owns each code.
    for (; i < rest.length; i++) {
      const tok = rest[i];
      const ownerVal = segValues.find(
        (v) => v.code === tok && OPTIONAL_SEGMENTS.some((o) => o.key === v.segment_key),
      );
      const ownerSeg = ownerVal ? OPTIONAL_SEGMENTS.find((o) => o.key === ownerVal.segment_key) : null;
      if (ownerSeg) push(ownerSeg.key, ownerSeg.label, tok);
      else segments.push({ key: "addon", label: "Add-on", code: tok, description: tok });
    }
  }
  return { partNumber: pn, found: false, segments };
}

/**
 * Retrieval layer for the assistant. Looks at the question, pulls the relevant
 * rows from MySQL, and returns readable grounded sections. Used both as the
 * no-LLM answer AND as the context handed to the LLM — so answers always come
 * from real registry data, never invented codes.
 */
export async function buildAskContext(question) {
  const text = String(question || "");
  const lower = text.toLowerCase();
  const sections = [];

  const segValues = (await q("SELECT segment_key, code, description FROM segment_values"))
    .map((v) => ({ ...v, segment_key: camelKey(v.segment_key) })); // normalize snake→camel
  const descLookup = new Map(segValues.map((v) => [`${v.segment_key}:${v.code}`, v.description]));

  // ── 1. Part numbers mentioned in the question → decode from the registry ──
  const pnTokens = [...new Set(text.toUpperCase().match(/[A-Z0-9]+(?:-[A-Z0-9]+){3,}/g) || [])].slice(0, 3);
  for (const pn of pnTokens) {
    const d = await decodePartNumber(pn);
    const lines = d.segments.map((s) => `  • ${s.label}: ${s.code} — ${s.description}`);
    sections.push(
      d.found
        ? `${pn} — "${d.productName}" (${d.status}, created by ${d.createdBy || "unknown"}):\n${lines.join("\n")}`
        : `${pn} — not in the registry. Best-effort decode:\n${lines.join("\n")}`,
    );
  }

  // ── 2. "How are part numbers created / structured?" ──
  if (/(how|what|explain).{0,50}(creat|built|build|generat|structur|format|made|work|compos)/.test(lower) || /\b(structure|format)\b/.test(lower)) {
    const core = CORE_SEGMENTS.map((s) => s.label).join(" – ");
    const opts = OPTIONAL_SEGMENTS.map((s) => `${s.label} ("${s.letter}")`).join(", ");
    const example = await one("SELECT part_number, product_name FROM part_numbers ORDER BY id DESC LIMIT 1");
    sections.push(
      `How part numbers are built:\n` +
      `Every code is assembled from required segments joined by "-":\n` +
      `  IK - {Model}{Version} - {Size} - {PowerType}{MaxPower} - {Voltage} - {Dimming} - {CCT} - {Distribution} - {Driver} - {Finish} - {Manufacturer}\n` +
      `Order: ${core}.\n` +
      `Optional add-ons appended at the end: ${opts}.\n` +
      (example ? `Example from your registry: ${example.part_number} ("${example.product_name}").\n` : "") +
      `In the Part Number Builder each dropdown fills one segment, and the code assembles live — pick options, the number builds itself.`,
    );
  }

  // ── 3. Registry summary / counts ──
  if (/\b(summary|overview|how many|count|total|registry|all (the )?parts?)\b/.test(lower)) {
    const [tot] = await q("SELECT COUNT(*) AS c FROM part_numbers");
    const byStatus = await q("SELECT status, COUNT(*) AS c FROM part_numbers GROUP BY status ORDER BY c DESC");
    const byCat = await q("SELECT product_category, COUNT(*) AS c FROM part_numbers GROUP BY product_category ORDER BY c DESC LIMIT 6");
    const bySeries = await q("SELECT product_model, COUNT(*) AS c FROM part_numbers GROUP BY product_model ORDER BY c DESC LIMIT 6");
    const recent = await q("SELECT part_number, product_name FROM part_numbers ORDER BY id DESC LIMIT 3");
    sections.push(
      `Registry summary:\n` +
      `  • Total part numbers: ${tot.c} (${byStatus.map((s) => `${s.c} ${s.status}`).join(", ")})\n` +
      `  • Top categories: ${byCat.map((c) => `${c.product_category} (${c.c})`).join(", ")}\n` +
      `  • Top series: ${bySeries.map((s) => `${s.product_model} (${s.c})`).join(", ")}\n` +
      `  • Most recent: ${recent.map((r) => r.part_number).join(", ")}`,
    );
  }

  // ── 4. Segment codes mentioned → meanings ──
  const codeSet = new Map(); // CODE -> [{segment_key, description}]
  for (const v of segValues) {
    const key = v.code.toUpperCase();
    if (!codeSet.has(key)) codeSet.set(key, []);
    codeSet.get(key).push(v);
  }
  const words = [...new Set((text.match(/\b[A-Za-z0-9]{2,6}\b/g) || []).map((w) => w.toUpperCase()))];
  const inPn = new Set(pnTokens.flatMap((pn) => pn.split("-")));
  const segLabel = (key) => ALL.find((s) => s.key === camelKey(key))?.label || key;
  const codeHits = words.filter((w) => codeSet.has(w) && !inPn.has(w)).slice(0, 8);
  if (codeHits.length) {
    const lines = codeHits.flatMap((w) =>
      codeSet.get(w).slice(0, 2).map((v) => `  • ${v.code} (${segLabel(v.segment_key)}): ${v.description}`),
    );
    sections.push(`Code meanings:\n${lines.join("\n")}`);
  }

  // ── 5. A product series mentioned → its parts ──
  const modelCodes = segValues.filter((v) => v.segment_key === "productModel").map((v) => v.code.toUpperCase());
  const seriesHits = words.filter((w) => modelCodes.includes(w)).slice(0, 2);
  for (const model of seriesHits) {
    const [cnt] = await q("SELECT COUNT(*) AS c FROM part_numbers WHERE product_model = ?", [model]);
    if (!cnt.c) continue;
    const parts = await q(
      "SELECT part_number, product_name, status FROM part_numbers WHERE product_model = ? ORDER BY id DESC LIMIT 5",
      [model],
    );
    sections.push(
      `${model} series (${descLookup.get(`productModel:${model}`) || model}) — ${cnt.c} part number(s):\n` +
      parts.map((p) => `  • ${p.part_number} — ${p.product_name} (${p.status})`).join("\n") +
      (cnt.c > 5 ? `\n  …and ${cnt.c - 5} more in the Library.` : ""),
    );
  }

  // ── 6. A company mentioned → its parts ──
  const companies = await q("SELECT id, name FROM companies");
  for (const c of companies) {
    if (c.name.length < 4 || !lower.includes(c.name.toLowerCase().split(" ")[0])) continue;
    const [cnt] = await q("SELECT COUNT(*) AS c FROM part_numbers WHERE company_id = ?", [c.id]);
    if (!cnt.c) continue;
    const parts = await q(
      "SELECT part_number, product_name FROM part_numbers WHERE company_id = ? ORDER BY id DESC LIMIT 4",
      [c.id],
    );
    sections.push(
      `${c.name} — ${cnt.c} part number(s):\n` +
      parts.map((p) => `  • ${p.part_number} — ${p.product_name}`).join("\n") +
      (cnt.c > 4 ? `\n  …and ${cnt.c - 4} more in the Library.` : ""),
    );
    if (sections.length > 8) break;
  }

  return sections;
}

function camelKey(s) { return s.replace(/_([a-z])/g, (_, c) => c.toUpperCase()); }
