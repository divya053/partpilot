import express from "express";
import { q } from "../db.js";
import { aiEnabled, chat, computeInsights } from "../ai.js";
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

// Freeform assistant (advisory only)
router.post("/ask", async (req, res) => {
  const { question } = req.body || {};
  if (!question) return res.status(400).json({ error: "question required" });
  const { insights, stats } = await computeInsights();
  const context = `Registry stats: ${JSON.stringify(stats)}\nKnown insights: ${insights.map((i) => i.title).join("; ")}`;
  if (!aiEnabled()) {
    return res.json({
      answer: `AI provider not configured. Here is what the data shows:\n\n${insights.map((i) => `• ${i.title} — ${i.detail}`).join("\n")}`,
      source: "deterministic",
    });
  }
  try {
    const text = await chat([
      { role: "system", content: "You are PartPilot's advisory assistant for IKIO LED Lighting part numbers. Be concise and helpful. You never modify data — only advise." },
      { role: "user", content: `${context}\n\nQuestion: ${question}` },
    ]);
    res.json({ answer: text, source: "ai" });
  } catch (err) {
    res.status(502).json({ error: "AI request failed", detail: err.message });
  }
});

function camel(s) { return s.replace(/_([a-z])/g, (_, c) => c.toUpperCase()); }

export default router;
