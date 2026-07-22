import { q } from "./db.js";
import { ALL_SEGMENTS } from "./segments.js";

// ─── Provider resolution (free / local first) ────────────────────────────────
// Priority: local AI_BASE_URL  →  Groq (free)  →  OpenAI. Degrades gracefully
// to deterministic, data-grounded insights when no key/endpoint is configured.
function resolveProvider() {
  if (process.env.AI_BASE_URL) {
    return { baseUrl: process.env.AI_BASE_URL.replace(/\/$/, ""), key: process.env.AI_API_KEY || "local", model: process.env.AI_MODEL || "local-model" };
  }
  if (process.env.GROQ_API_KEY) {
    return { baseUrl: "https://api.groq.com/openai/v1", key: process.env.GROQ_API_KEY, model: process.env.GROQ_MODEL || "llama-3.3-70b-versatile" };
  }
  if (process.env.OPENAI_API_KEY) {
    return { baseUrl: "https://api.openai.com/v1", key: process.env.OPENAI_API_KEY, model: process.env.OPENAI_MODEL || "gpt-4o-mini" };
  }
  return null;
}

export function aiEnabled() {
  return resolveProvider() !== null;
}

/** Call an OpenAI-compatible chat endpoint. Returns text or throws. */
export async function chat(messages, { temperature = 0.3, maxTokens = 700 } = {}) {
  const p = resolveProvider();
  if (!p) throw new Error("No AI provider configured");
  const res = await fetch(`${p.baseUrl}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${p.key}` },
    body: JSON.stringify({ model: p.model, messages, temperature, max_tokens: maxTokens }),
  });
  if (!res.ok) throw new Error(`AI ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return data.choices?.[0]?.message?.content?.trim() || "";
}

// ─── Deterministic, data-grounded insights (always available) ────────────────
export async function computeInsights() {
  const insights = [];
  const parts = await q("SELECT * FROM part_numbers");
  const segCounts = await q(
    "SELECT segment_key, COUNT(*) AS c FROM segment_values GROUP BY segment_key",
  );

  // Duplicate part numbers (should be unique, but detect near-dupes ignoring add-ons)
  const coreMap = new Map();
  for (const p of parts) {
    const core = p.part_number.split("-").slice(0, 11).join("-");
    coreMap.set(core, (coreMap.get(core) || 0) + 1);
  }
  const dupeClusters = [...coreMap.entries()].filter(([, c]) => c > 1);
  if (dupeClusters.length) {
    insights.push({
      type: "warning",
      title: `${dupeClusters.length} part families share a core code`,
      detail: `Multiple parts differ only by optional add-ons (e.g. ${dupeClusters[0][0]}…). Confirm these are intentional variants.`,
    });
  }

  // Draft / temporary parts
  const drafts = parts.filter((p) => p.status === "draft").length;
  const temporary = parts.filter((p) => p.product_stage === "temporary").length;
  if (temporary) {
    insights.push({
      type: "info",
      title: `${temporary} temporary-stage parts`,
      detail: "These are not yet stocked. Review whether any should be promoted to 'stocked'.",
    });
  }
  if (drafts) {
    insights.push({ type: "info", title: `${drafts} draft parts pending`, detail: "Drafts are excluded from active reporting until activated." });
  }

  // Unused segment values (defined but never referenced by a part)
  const used = new Set();
  for (const p of parts) {
    for (const s of ALL_SEGMENTS) {
      const col = s.key.replace(/[A-Z]/g, (m) => "_" + m.toLowerCase());
      if (p[col]) used.add(`${s.key}:${p[col]}`);
    }
  }
  const allValues = await q("SELECT segment_key, code FROM segment_values WHERE is_active = 1");
  const unused = allValues.filter((v) => !used.has(`${camel(v.segment_key)}:${v.code}`));
  if (unused.length) {
    insights.push({
      type: "info",
      title: `${unused.length} defined codes are never used`,
      detail: `Some dropdown values aren't referenced by any part yet (e.g. ${unused.slice(0, 3).map((u) => u.code).join(", ")}).`,
    });
  }

  // Most-used driver / cct
  const driverAgg = tally(parts, "driver");
  if (driverAgg.length) {
    insights.push({
      type: "success",
      title: `Top driver: ${driverAgg[0][0]}`,
      detail: `Used on ${driverAgg[0][1]} parts. Standardising on common drivers simplifies procurement.`,
    });
  }

  return { insights, stats: { parts: parts.length, segmentTypes: segCounts.length } };
}

function camel(s) {
  return s.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
}
function tally(rows, col) {
  const m = new Map();
  for (const r of rows) if (r[col]) m.set(r[col], (m.get(r[col]) || 0) + 1);
  return [...m.entries()].sort((a, b) => b[1] - a[1]);
}
