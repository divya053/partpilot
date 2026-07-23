import { q, one } from "./db.js";
import { CORE_SEGMENTS, OPTIONAL_SEGMENTS } from "./segments.js";

const ALL = [...CORE_SEGMENTS, ...OPTIONAL_SEGMENTS];
const snake = (s) => s.replace(/[A-Z]/g, (m) => "_" + m.toLowerCase());

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
    const row = await one("SELECT * FROM part_numbers WHERE part_number = ?", [pn]);
    if (row) {
      const lines = [];
      for (const s of ALL) {
        const code = row[snake(s.key)];
        if (!code) continue;
        lines.push(`  • ${s.label}: ${code} — ${descLookup.get(`${s.key}:${code}`) || code}`);
      }
      sections.push(`${pn} — "${row.product_name}" (${row.status}, created by ${row.created_by || "unknown"}):\n${lines.join("\n")}`);
    } else {
      sections.push(`${pn} — not found in the registry.`);
    }
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
