// ─── PartPilot Build Agent — data-grounded reasoning engine ───────────────────
// Everything the agent "knows" comes from the same data the master Excel encodes,
// now living in MySQL:
//   1. APPLICABILITY  — segment_values.applicable_products (which product-model
//      codes a value is valid for) + model_descriptions (its per-model meaning).
//      This is the Excel "Value Descriptions" matrix: a blank cell = not
//      applicable to that family.
//   2. MEANING        — model_descriptions[model] || description  (what a code
//      means for the chosen family, e.g. Version "1" = "Recessed Downlight").
//   3. REAL COMBOS    — part_numbers rows (the ~200 built parts): what codes
//      actually co-occur per family → "typical vs unusual".
// The engine turns that into: valid options per segment, a next-best-step guide,
// and end-to-end validation. Per the product decision it WARNS, never blocks.

import { q } from "./db.js";
import { CORE_SEGMENTS, OPTIONAL_SEGMENTS, ALL_SEGMENTS, buildPartNumber } from "./segments.js";
import { aiEnabled, chat } from "./ai.js";
import { parseDescription } from "./assistant.js";

const snake = (s) => s.replace(/[A-Z]/g, (m) => "_" + m.toLowerCase());
const camel = (s) => s.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
const ALL = ALL_SEGMENTS;
// company is always "IK"; it never needs a decision, so it's excluded from
// matching/guiding/validation.
const CORE_NO_CO = CORE_SEGMENTS.filter((s) => s.key !== "company");

function decodeJson(x) {
  if (!x) return undefined;
  try { return typeof x === "string" ? JSON.parse(x) : x; } catch { return undefined; }
}
function normalizeValue(v) {
  return {
    segment_key: camel(v.segment_key),
    code: v.code,
    description: v.description || "",
    applicable_products: decodeJson(v.applicable_products) || [],
    model_descriptions: decodeJson(v.model_descriptions) || {},
  };
}

/** Load the full knowledge base for one request (the dataset is small). */
export async function loadKnowledge() {
  const values = (await q("SELECT segment_key, code, description, applicable_products, model_descriptions FROM segment_values WHERE is_active = 1")).map(normalizeValue);
  const parts = await q("SELECT * FROM part_numbers");
  const byKey = new Map();
  for (const v of values) {
    if (!byKey.has(v.segment_key)) byKey.set(v.segment_key, []);
    byKey.get(v.segment_key).push(v);
  }
  return { values, byKey, parts };
}

const meaningOf = (v, model) => (model && v.model_descriptions?.[model]) || v.description || v.code;

function familyName(byKey, model) {
  const pm = (byKey.get("productModel") || []).find((v) => v.code === model);
  return pm ? pm.description || model : model || "this product";
}

// Valid options for a segment given the chosen model. Mirrors the Builder's
// optsFor: a value applies if the model is in its Used-By list OR it has a
// per-model meaning. Values with NO applicability data at all are always shown,
// and the current pick is never hidden — so you're never stranded.
function optionsFor(byKey, key, model, current = "") {
  const all = byKey.get(key) || [];
  if (!model || key === "productModel" || key === "company") {
    return all.map((v) => ({ code: v.code, meaning: meaningOf(v, model) }));
  }
  const filtered = all.filter((v) => {
    const hasData = (v.applicable_products?.length || 0) > 0 || Object.keys(v.model_descriptions || {}).length > 0;
    const applies = v.applicable_products?.includes(model) || !!v.model_descriptions?.[model];
    return !hasData || applies || v.code === current;
  });
  return (filtered.length ? filtered : all).map((v) => ({ code: v.code, meaning: meaningOf(v, model) }));
}

// Is a code genuinely appropriate for this family? Stricter than optionsFor
// (which shows no-dependency-data codes everywhere so humans aren't stranded):
// the AGENT should only auto-pick / recommend codes that either explicitly
// apply to the model or actually co-occur in a real part of that family. This
// stops it suggesting e.g. variant "0A" (Type A) for a UFO High Bay.
function familyAppropriate(knowledge, key, model, code) {
  if (!model || key === "productModel" || key === "company") return true;
  const v = (knowledge.byKey.get(key) || []).find((x) => x.code === code);
  if (!v) return false;
  if ((v.applicable_products || []).includes(model) || (v.model_descriptions || {})[model]) return true;
  const col = snake(key);
  return knowledge.parts.some((p) => String(p.product_model) === model && String(p[col] ?? "") === code);
}

// Narrow the real parts to those matching every core field chosen so far, so
// stats reflect "what everyone who built this far picked". Falls back to same
// series, then the whole registry, so guidance never goes blank.
function narrow(parts, draft) {
  const val = (k) => String(draft[k] ?? "").trim();
  const filled = CORE_NO_CO.filter((s) => val(s.key));
  let sel = parts.filter((p) => filled.every((s) => String(p[snake(s.key)] ?? "") === val(s.key)));
  let scope = filled.length ? "matching parts" : "registry";
  if (!sel.length && val("productModel")) { sel = parts.filter((p) => String(p.product_model ?? "") === val("productModel")); scope = "same series"; }
  if (!sel.length) { sel = parts; scope = "registry"; }
  return { sel, scope };
}
function freqOf(parts, key) {
  const col = snake(key), m = new Map();
  for (const p of parts) { const v = p[col]; if (v != null && v !== "") m.set(v, (m.get(v) || 0) + 1); }
  return m;
}

// Lenient product-model detector for a free-text message (family name or code).
export function guessModel(byKey, text) {
  const lower = ` ${String(text || "").toLowerCase()} `;
  const models = byKey.get("productModel") || [];
  let best = null;
  for (const m of models) {
    if (new RegExp(`\\b${m.code.toLowerCase()}\\b`).test(lower)) return m.code; // explicit code wins
    const desc = String(m.description || "").toLowerCase();
    const words = desc.split(/[^a-z0-9]+/).filter((w) => w.length >= 4);
    const hits = words.filter((w) => lower.includes(w)).length;
    if (hits && (!best || hits > best.hits)) best = { code: m.code, hits };
  }
  return best?.code;
}

// ─── End-to-end validation (warn-but-allow) ──────────────────────────────────
export function validate(draft, knowledge) {
  const { byKey, parts } = knowledge;
  const model = String(draft.productModel || "");
  const issues = [];
  const { sel, scope } = narrow(parts, draft);
  const basis = sel.length;

  for (const s of CORE_NO_CO) {
    if (s.key === "productModel") continue;
    const code = String(draft[s.key] ?? "").trim();
    if (!code) continue;
    if (model) {
      const known = (byKey.get(s.key) || []).some((v) => v.code === code);
      const inList = optionsFor(byKey, s.key, model, code).some((o) => o.code === code);
      if (!known) issues.push({ level: "warn", key: s.key, message: `${s.label} “${code}” isn’t a known code.` });
      else if (!inList) issues.push({ level: "warn", key: s.key, message: `${s.label} “${code}” isn’t listed for ${familyName(byKey, model)} — unusual, but you can keep it.` });
    }
    if (basis >= 5) {
      const cnt = freqOf(sel, s.key).get(code) || 0;
      if (cnt === 0) issues.push({ level: "warn", key: s.key, message: `No existing ${familyName(byKey, model)} part uses ${s.label} “${code}”.` });
    }
  }
  return { issues, basis, scope };
}

// ─── Next-best-step guide ─────────────────────────────────────────────────────
export function guide(draft, knowledge) {
  const { byKey, parts } = knowledge;
  const model = String(draft.productModel || "");
  const { sel } = narrow(parts, draft);
  const basis = sel.length;

  let nextField = null;
  for (const s of CORE_NO_CO) { if (!String(draft[s.key] ?? "").trim()) { nextField = s.key; break; } }
  if (!nextField) return { nextField: null, label: null, options: [], basis };

  const seg = ALL.find((s) => s.key === nextField);
  const freq = freqOf(sel, nextField);
  const all = optionsFor(byKey, nextField, model, "")
    .map((o) => ({ ...o, count: freq.get(o.code) || 0 }))
    .sort((a, b) => b.count - a.count || String(a.code).localeCompare(String(b.code)));
  // Prefer family-appropriate codes; fall back to the full list if none qualify.
  const appropriate = all.filter((o) => familyAppropriate(knowledge, nextField, model, o.code));
  const options = (appropriate.length ? appropriate : all).slice(0, 12);
  return { nextField, label: seg?.label, options, basis };
}

// ─── Grounding context for the LLM (compact, code-accurate) ──────────────────
function groundingContext(draft, knowledge, g, v) {
  const { byKey } = knowledge;
  const model = String(draft.productModel || "");
  const lines = [];
  lines.push(`Family: ${model ? `${familyName(byKey, model)} (model code ${model})` : "not chosen yet"}`);
  lines.push(`Assembled so far: ${buildPartNumber(draft)}`);

  const chosen = CORE_NO_CO.filter((s) => String(draft[s.key] ?? "").trim());
  if (chosen.length) {
    lines.push("Chosen:");
    for (const s of chosen) {
      const code = draft[s.key];
      const val = (byKey.get(s.key) || []).find((x) => x.code === code);
      lines.push(`  - ${s.label}: ${code} — ${val ? meaningOf(val, model) : code}`);
    }
  }
  if (!model) {
    const models = optionsFor(byKey, "productModel", "", "").slice(0, 40);
    lines.push("Choose a Product Model (code — meaning):");
    for (const o of models) lines.push(`  - ${o.code} — ${o.meaning}`);
  } else {
    // Options for the next 3 empty core segments, typical pick first.
    let shown = 0;
    for (const s of CORE_NO_CO) {
      if (String(draft[s.key] ?? "").trim()) continue;
      const opts = guideOptionsFor(draft, knowledge, s.key);
      lines.push(`Options for ${s.label} (code — meaning [n parts]):`);
      for (const o of opts.slice(0, 10)) lines.push(`  - ${o.code} — ${o.meaning}${o.count ? ` [${o.count}]` : ""}`);
      if (++shown >= 3) break;
    }
  }
  if (v.issues.length) {
    lines.push("Warnings on current choices:");
    for (const i of v.issues) lines.push(`  - ${i.message}`);
  }
  return lines.join("\n");
}
function guideOptionsFor(draft, knowledge, key) {
  const { byKey, parts } = knowledge;
  const model = String(draft.productModel || "");
  const { sel } = narrow(parts, draft);
  const freq = freqOf(sel, key);
  return optionsFor(byKey, key, model, "")
    .map((o) => ({ ...o, count: freq.get(o.code) || 0 }))
    .sort((a, b) => b.count - a.count || String(a.code).localeCompare(String(b.code)));
}

const AGENT_SYSTEM =
  "You are PartPilot's part-number building agent for IKIO LED Lighting. You help the user assemble ONE valid IKIO part number by choosing a code for each segment, in order. " +
  "IKIO format: IK-{Model}{Version/Variant}-{Size}-{PowerType}{MaxPower}-{Voltage}-{Dimming}-{CCT}-{Distribution}-{Driver}-{Finish}-{Manufacturer}, then optional add-ons. " +
  "STRICT RULES: (1) Use ONLY codes present in the provided option lists — never invent a code or a spec. (2) Recommend the most common/typical option for the chosen product family (higher [n] = more common). (3) If the user's choice is unusual for the family, WARN briefly but allow it — never refuse. (4) Ask for the next needed field, one step at a time; if the user described the whole fixture, fill the empty required segments you can. (5) NEVER change a field the user already chose unless they explicitly ask. (6) NEVER add optional add-ons (lens, emergency, sensor, surge, mounting, etc.) unless the user explicitly asks for them. (7) Keep prose to 2–3 short sentences. " +
  "After your reply, output on a NEW LINE a single JSON object of segment codes to set now, e.g. {\"set\":{\"sizeVariant\":\"06\",\"cct\":\"CCT\"}}. Include only codes from the lists above and only for currently-empty required segments. If nothing to set, output {\"set\":{}}.";

function extractSetJson(raw) {
  const text0 = String(raw || "");
  // Scan for balanced top-level { } spans (handles the nested {"set":{...}}).
  const spans = [];
  let depth = 0, start = -1;
  for (let i = 0; i < text0.length; i++) {
    const c = text0[i];
    if (c === "{") { if (depth === 0) start = i; depth++; }
    else if (c === "}") { depth--; if (depth === 0 && start >= 0) { spans.push([start, i + 1]); start = -1; } }
  }
  let set = {}, jsonStr = "";
  for (let i = spans.length - 1; i >= 0; i--) {              // last span wins
    const cand = text0.slice(spans[i][0], spans[i][1]);
    if (!/["']?set["']?\s*:/.test(cand)) continue;
    try {
      const parsed = JSON.parse(cand.replace(/```json|```/g, ""));
      if (parsed && parsed.set && typeof parsed.set === "object") { set = parsed.set; jsonStr = cand; break; }
    } catch { /* try the previous span */ }
  }
  const text = (jsonStr ? text0.replace(jsonStr, "") : text0).replace(/```json|```/g, "").trim();
  return { text, set };
}

const OPTIONAL_KEYSET = new Set(OPTIONAL_SEGMENTS.map((s) => s.key));

// Apply proposed { key: code } onto a draft, keeping only real catalog codes
// (case-insensitively resolved to the canonical code). Records what changed.
// Guards: never overwrite a field the user already set (`protect`), and — for
// LLM proposals — never auto-add optional add-ons the user didn't ask for
// (`coreOnly`). Text-grounded parses may set optionals, because the user's words
// actually named them.
function applyProposed(working, proposed, knowledge, { protect = new Set(), coreOnly = false, familyModel = null } = {}) {
  const { byKey } = knowledge;
  const changed = {};
  for (const [k, val] of Object.entries(proposed || {})) {
    const seg = ALL.find((s) => s.key === k);
    if (!seg || val == null || val === "") continue;
    if (protect.has(k)) continue;               // keep the user's explicit choice
    if (coreOnly && OPTIONAL_KEYSET.has(k)) continue; // don't invent add-ons
    const hit = (byKey.get(k) || []).find((x) => x.code.toUpperCase() === String(val).toUpperCase());
    if (!hit) continue;                         // not a real catalog code
    // When the agent (not the user's own words) is picking, keep it in-family:
    // reject codes not genuinely appropriate for the chosen product model.
    if (familyModel && !familyAppropriate(knowledge, k, familyModel, hit.code)) continue;
    if (working[k] !== hit.code) { working[k] = hit.code; changed[k] = hit.code; }
  }
  return changed;
}

function labelFor(key) { return ALL.find((s) => s.key === key)?.label || key; }

// Deterministic, data-only reply (used when no LLM is configured, or as fallback).
function deterministicReply(working, knowledge, g, v, changed) {
  const { byKey } = knowledge;
  const model = String(working.productModel || "");
  const parts = [];
  const changedKeys = Object.keys(changed);
  if (changedKeys.length) {
    parts.push("Set " + changedKeys.map((k) => {
      const val = (byKey.get(k) || []).find((x) => x.code === changed[k]);
      return `${labelFor(k)} → ${val ? meaningOf(val, model) : changed[k]}`;
    }).join(", ") + ".");
  }
  if (!model) {
    parts.push("Which product is this? Tell me the fixture type (e.g. “6\" commercial downlight”, “UFO high bay”, “full-cutoff wallpack”) and I’ll pick the model.");
    return parts.join(" ");
  }
  if (g.nextField) {
    const top = g.options.slice(0, 4).map((o) => `${o.meaning}${o.count ? ` (${o.count})` : ""}`).join(", ");
    parts.push(`Next: pick a ${g.label}. Common for ${familyName(byKey, model)}: ${top || "—"}.`);
  } else {
    parts.push(`All required segments are set. Part number: ${buildPartNumber(working)}. Add optional add-ons or save it.`);
  }
  if (v.issues.length) parts.push("⚠ " + v.issues[0].message);
  return parts.join(" ");
}

/**
 * Main entry: one conversational turn.
 * Input:  { messages:[{role,content}], draft:{...form} }
 * Output: { reply, fields:{changed}, nextField, options, warnings, partNumber, source }
 * `fields` is what the client should merge into the builder form.
 */
export async function agentChat({ messages = [], draft = {} }) {
  const knowledge = await loadKnowledge();
  const { byKey } = knowledge;
  const working = { ...draft };
  const changed = {};
  const lastUser = [...messages].reverse().find((m) => m.role === "user")?.content || "";
  // Fields the user already set — never silently overwritten by the agent.
  const protect = new Set(Object.keys(draft).filter((k) => String(draft[k] ?? "").trim() !== ""));

  // 1) Ground the latest message: detect the model + any codes it mentions.
  if (!String(working.productModel || "").trim() && lastUser) {
    const gm = guessModel(byKey, lastUser);
    if (gm) { working.productModel = gm; changed.productModel = gm; protect.add("productModel"); }
  }
  if (lastUser) {
    // Text-grounded parse (deterministic only — the agent's own LLM turn below
    // handles interpretation). Extracts only codes literally present in the text,
    // so "fill the rest with typical values" invents nothing.
    const parsed = await parseDescription(lastUser, { useAi: false }).catch(() => ({ fields: {} }));
    const fromText = applyProposed(working, parsed.fields || {}, knowledge, { protect });
    Object.assign(changed, fromText);
    // The user's own words outrank the agent's guesses — lock them so the LLM
    // step below can't overwrite them.
    for (const k of Object.keys(fromText)) protect.add(k);
  }

  let g = guide(working, knowledge);
  let v = validate(working, knowledge);

  if (!aiEnabled()) {
    return {
      reply: deterministicReply(working, knowledge, g, v, changed),
      fields: changed, nextField: g.nextField, nextLabel: g.label, options: g.options,
      warnings: v.issues, partNumber: buildPartNumber(working), source: "data",
    };
  }

  // 2) Let the LLM converse over the grounded facts and propose codes.
  try {
    const ctx = groundingContext(working, knowledge, g, v);
    const raw = await chat([
      { role: "system", content: AGENT_SYSTEM },
      ...messages.slice(-8).map((m) => ({ role: m.role === "assistant" ? "assistant" : "user", content: String(m.content || "") })),
      { role: "user", content: `CURRENT STATE (grounded — use ONLY these codes):\n${ctx}` },
    ], { temperature: 0.2, maxTokens: 800 });
    const { text, set } = extractSetJson(raw);
    // LLM proposals: fill empty CORE segments only — never clobber the user's
    // choices, never invent optional add-ons, and stay in-family (reject any
    // code that isn't valid for the chosen product model).
    Object.assign(changed, applyProposed(working, set, knowledge, { protect, coreOnly: true, familyModel: String(working.productModel || "") || null }));
    g = guide(working, knowledge);
    v = validate(working, knowledge);
    return {
      reply: text || deterministicReply(working, knowledge, g, v, changed),
      fields: changed, nextField: g.nextField, nextLabel: g.label, options: g.options,
      warnings: v.issues, partNumber: buildPartNumber(working), source: "ai",
    };
  } catch (err) {
    return {
      reply: deterministicReply(working, knowledge, g, v, changed),
      fields: changed, nextField: g.nextField, nextLabel: g.label, options: g.options,
      warnings: v.issues, partNumber: buildPartNumber(working), source: "data", note: err.message,
    };
  }
}
