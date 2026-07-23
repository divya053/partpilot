import express from "express";
import { q } from "../db.js";
import { aiEnabled, chat, computeInsights } from "../ai.js";
import { buildAskContext, computeSuggestions, parseDescription, decodePartNumber } from "../assistant.js";
import { buildPartNumber, ALL_SEGMENTS } from "../segments.js";

const router = express.Router();

router.get("/status", (_req, res) => {
  res.json({ enabled: aiEnabled() });
});

// Data-grounded insights (deterministic + optional LLM narrative)
router.get("/insights", async (_req, res) => {
  const base = await computeInsights();
  res.json(base);
});

// Smart defaults + unusual-combination warnings, learned from existing parts.
router.post("/suggest", async (req, res) => {
  res.json(await computeSuggestions(req.body || {}));
});

// Plain-English description → segment codes (validated against the catalog).
router.post("/parse", async (req, res) => {
  const { text } = req.body || {};
  if (!text || !String(text).trim()) return res.status(400).json({ error: "text required" });
  res.json(await parseDescription(String(text)));
});

// Decode any part number — known (from the registry) or unknown (positional).
router.post("/decode", async (req, res) => {
  const { partNumber } = req.body || {};
  if (!partNumber || !String(partNumber).trim()) return res.status(400).json({ error: "partNumber required" });
  res.json(await decodePartNumber(String(partNumber)));
});

// Explain a part number in plain English
router.post("/explain", async (req, res) => {
  const fields = req.body || {};
  const pn = buildPartNumber(fields);
  // Resolve descriptions from segment_values for a grounded explanation.
  const values = await q("SELECT segment_key, code, description FROM segment_values");
  const lookup = new Map(values.map((v) => [`${camel(v.segment_key)}:${v.code}`, v.description]));
  const lines = [];
  for (const s of ALL_SEGMENTS) {
    const code = fields[s.key];
    if (!code) continue;
    const desc = lookup.get(`${s.key}:${code}`) || code;
    lines.push(`- ${s.label}: ${code} — ${desc}`);
  }
  const grounded = `Part number ${pn}\n${lines.join("\n")}`;

  if (!aiEnabled()) {
    return res.json({ partNumber: pn, explanation: grounded, source: "deterministic" });
  }
  try {
    const text = await chat([
      { role: "system", content: "You are PartPilot's assistant for IKIO LED Lighting. Explain part numbers clearly and concisely for a sales or procurement audience. Use the provided segment descriptions; do not invent specs." },
      { role: "user", content: `Explain this fixture in 2-3 short sentences:\n${grounded}` },
    ]);
    res.json({ partNumber: pn, explanation: text || grounded, source: "ai" });
  } catch (err) {
    res.json({ partNumber: pn, explanation: grounded, source: "deterministic", note: err.message });
  }
});

// Freeform assistant (advisory only). Retrieval-first: pull the real rows the
// question is about (decode part numbers, format guide, summary, code meanings,
// series/company lookups), then answer from THAT — with the LLM narrating when
// configured, or the grounded sections directly when it isn't.
router.post("/ask", async (req, res) => {
  const { question } = req.body || {};
  if (!question) return res.status(400).json({ error: "question required" });

  let sections = [];
  try {
    sections = await buildAskContext(question);
  } catch { /* retrieval is best-effort */ }

  // Nothing matched → fall back to registry health insights.
  if (!sections.length) {
    const { insights, stats } = await computeInsights();
    sections = [
      `Registry: ${stats?.total ?? "?"} part numbers.`,
      ...insights.slice(0, 5).map((i) => `• ${i.title} — ${i.detail}`),
    ];
  }
  const grounded = sections.join("\n\n");

  if (!aiEnabled()) {
    return res.json({ answer: grounded, source: "data" });
  }
  try {
    const text = await chat([
      {
        role: "system",
        content:
          "You are PartPilot's advisory assistant for IKIO LED Lighting part numbers. " +
          "Answer ONLY from the registry data provided — never invent part numbers, codes, or specs. " +
          "If the data doesn't cover the question, say so and suggest where to look in the app " +
          "(Builder, Library, Units & Values, Reports). Be concise and friendly; use short bullet lists. " +
          "You never modify data — only advise.",
      },
      { role: "user", content: `Registry data:\n${grounded}\n\nQuestion: ${question}` },
    ]);
    res.json({ answer: text || grounded, source: "ai" });
  } catch (err) {
    // LLM down → still answer with the grounded data.
    res.json({ answer: grounded, source: "data", note: err.message });
  }
});

function camel(s) { return s.replace(/_([a-z])/g, (_, c) => c.toUpperCase()); }

export default router;
