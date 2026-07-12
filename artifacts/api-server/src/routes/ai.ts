import { Router } from "express";
import { eq } from "drizzle-orm";
import { db, partNumbersTable, segmentValuesTable } from "@workspace/db";
import {
  AskAiAssistantBody,
  GetAiInsightsQueryParams,
  GetModelDefaultsQueryParams,
  ExplainPartNumberBody,
  PredictNextFieldsBody,
  type AiInsightsResponse,
  type AiAssistantResponse,
  type AiExplainResponse,
  type AiSegmentExplanation,
  type AiModelDefaults,
  type AiModelDefaultField,
  type AiLearningStatus,
  type AiPredictResponse,
  type AiFieldPrediction,
} from "@workspace/api-zod";
import {
  chatText,
  isAiConfigured,
  getAiConfig,
  AI_SETUP_HINT,
  type ChatMessage,
} from "../lib/llm";
import {
  buildDataContext,
  computeInsights,
  summarizeForLLM,
  assistantContext,
  type InsightScope,
} from "../lib/aiContext";
import {
  SEGMENT_KEYS,
  SEGMENT_FIELD_LABELS,
  createSegmentIndex,
  normalizeDraftValue,
  type SegmentKey,
  type BuilderDraft,
} from "../lib/partNumberBuilder";

const router = Router();

/** Shared reference the LLM uses to reason about codes it hasn't otherwise seen. */
const PART_NUMBER_FORMAT_REFERENCE = [
  "IK part number format:",
  "{Company}-{ProductModel}{Version}-{SizeVariant}-{PowerType}{MaxPower}-{VoltageRange}-{Dimming}-{CCT}-{LightDist}-{Driver}-{Finish}-{Manufacturer}[-optionals...]",
  "Example: IK-UHB3-02-S0240-MV-D-CCT-WD-01-BK-BFU",
  "Optional add-ons appended with dashes: Lens (L), Emergency (X), Sensor (Y), Surge (S), Reflector (R), Mounting (M), Photocontrol (P), Connectable (C), Base (B).",
  "Status lifecycle: draft -> active -> deprecated.",
].join(" ");

// ───────────────────────────────────────────────────────────────────────────
// Model defaults — DETERMINISTIC prefill learned from existing parts.
// No LLM, no guessing: for a given product model we report the most-common
// value each segment actually takes across the registry, with its % share.
// ───────────────────────────────────────────────────────────────────────────

router.get("/model-defaults", async (req, res) => {
  const parsed = GetModelDefaultsQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const productModel = parsed.data.productModel.trim();
  const [parts, segmentRows] = await Promise.all([
    db.select().from(partNumbersTable).where(eq(partNumbersTable.productModel, productModel)),
    db.select().from(segmentValuesTable),
  ]);

  const { byKeyAndCode } = createSegmentIndex(segmentRows);
  const sampleSize = parts.length;

  const fields: AiModelDefaultField[] = [];
  if (sampleSize > 0) {
    // Every fillable segment except the model key itself.
    const fillable = SEGMENT_KEYS.filter((k) => k !== "productModel");
    for (const key of fillable) {
      const counts = new Map<string, number>();
      for (const p of parts) {
        const v = (p as Record<string, unknown>)[key];
        if (typeof v === "string" && v.trim() !== "") counts.set(v, (counts.get(v) ?? 0) + 1);
      }
      const top = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
      if (!top) continue;
      const [code, count] = top;
      fields.push({
        field: key,
        label: SEGMENT_FIELD_LABELS[key as SegmentKey],
        code,
        description: byKeyAndCode.get(`${key}:${code}`)?.description ?? "",
        share: Math.round((count / sampleSize) * 100),
        count,
      });
    }
    fields.sort((a, b) => b.share - a.share);
  }

  const payload: AiModelDefaults = { productModel, sampleSize, fields };
  res.json(payload);
});

// ───────────────────────────────────────────────────────────────────────────
// Learning status — makes the "self-training" tangible: what the AI has
// learned so far and when it last updated (advances every time a part changes).
// ───────────────────────────────────────────────────────────────────────────

router.get("/learning-status", async (_req, res) => {
  const ctx = await buildDataContext();

  const conventions = ctx.learnedConventions.reduce((sum, c) => sum + c.common.length, 0);
  const totalDefined = ctx.segmentUsage.reduce((s, u) => s + u.definedCodes, 0);
  const totalUsed = ctx.segmentUsage.reduce((s, u) => s + u.usedCodes, 0);
  const segmentCoverage = totalDefined === 0 ? 0 : Math.round((totalUsed / totalDefined) * 100);

  let lastLearnedAt: string | null = null;
  for (const p of ctx.parts) {
    const t = new Date(p.updatedAt).getTime();
    if (!lastLearnedAt || t > new Date(lastLearnedAt).getTime()) {
      lastLearnedAt = new Date(p.updatedAt).toISOString();
    }
  }

  const payload: AiLearningStatus = {
    partsLearned: ctx.totals.parts,
    models: ctx.totals.models,
    categories: ctx.totals.categories,
    conventions,
    segmentCoverage,
    lastLearnedAt,
  };
  res.json(payload);
});

// ───────────────────────────────────────────────────────────────────────────
// Predict-next — per-step accuracy. For the current partial draft, predict the
// most likely value for each still-empty segment, learned from the parts that
// match everything filled so far. Narrows and sharpens as more is selected.
// ───────────────────────────────────────────────────────────────────────────

router.post("/predict-next", async (req, res) => {
  const parsed = PredictNextFieldsBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const draft = parsed.data.draft as BuilderDraft;
  const [parts, segmentRows] = await Promise.all([
    db.select().from(partNumbersTable),
    db.select().from(segmentValuesTable),
  ]);
  const { byKeyAndCode } = createSegmentIndex(segmentRows);

  const filled = SEGMENT_KEYS.filter((k) => normalizeDraftValue(draft[k]));
  const matches = parts.filter((p) =>
    filled.every((k) => String((p as Record<string, unknown>)[k] ?? "") === normalizeDraftValue(draft[k])),
  );
  const basisCount = matches.length;

  const predictions: AiFieldPrediction[] = [];
  if (basisCount > 0) {
    for (const key of SEGMENT_KEYS) {
      if (filled.includes(key)) continue;
      const counts = new Map<string, number>();
      for (const p of matches) {
        const v = (p as Record<string, unknown>)[key];
        if (typeof v === "string" && v.trim() !== "") counts.set(v, (counts.get(v) ?? 0) + 1);
      }
      if (counts.size === 0) continue;
      const candidates = [...counts.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([code, count]) => ({
          code,
          description: byKeyAndCode.get(`${key}:${code}`)?.description ?? "",
          confidence: Math.round((count / basisCount) * 100),
          count,
        }));
      predictions.push({ field: key, label: SEGMENT_FIELD_LABELS[key], basisCount, candidates });
    }
    // Most confident predictions first.
    predictions.sort((a, b) => (b.candidates[0]?.confidence ?? 0) - (a.candidates[0]?.confidence ?? 0));
  }

  const payload: AiPredictResponse = { basisCount, filledCount: filled.length, predictions };
  res.json(payload);
});

// ───────────────────────────────────────────────────────────────────────────
// Insights — data-driven suggestions + alerts per page scope.
// Deterministic (works without AI); optional short AI narrative on top.
// ───────────────────────────────────────────────────────────────────────────

const VALID_SCOPES: InsightScope[] = ["dashboard", "builder", "library", "part", "segments", "global"];

// Small TTL cache so the optional narrative isn't regenerated on every mount.
const narrativeCache = new Map<string, { text: string | null; expires: number }>();
const NARRATIVE_TTL_MS = 90_000;

async function maybeNarrative(
  cacheKey: string,
  buildMessages: () => ChatMessage[],
): Promise<string | null> {
  if (!isAiConfigured()) return null;
  const cached = narrativeCache.get(cacheKey);
  if (cached && cached.expires > Date.now()) return cached.text;
  try {
    const text = await chatText(buildMessages(), { temperature: 0.3, maxTokens: 160 });
    const value = text.trim() || null;
    narrativeCache.set(cacheKey, { text: value, expires: Date.now() + NARRATIVE_TTL_MS });
    return value;
  } catch {
    narrativeCache.set(cacheKey, { text: null, expires: Date.now() + NARRATIVE_TTL_MS });
    return null;
  }
}

router.get("/insights", async (req, res) => {
  const parsed = GetAiInsightsQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const scope = parsed.data.scope as InsightScope;
  if (!VALID_SCOPES.includes(scope)) {
    res.status(400).json({ error: `Unknown scope: ${scope}` });
    return;
  }
  const partId = parsed.data.partId ?? null;

  const ctx = await buildDataContext();
  const part =
    scope === "part" && partId != null
      ? ctx.parts.find((p) => p.id === partId) ?? null
      : null;

  const insights = computeInsights(ctx, scope, part);

  const config = getAiConfig();
  const cacheKey = `${scope}:${partId ?? ""}:${ctx.totals.parts}:${insights.length}`;
  const narrative = await maybeNarrative(cacheKey, () => [
    {
      role: "system",
      content:
        "You are the IK Part Number Portal's data analyst. In 1-2 short sentences, summarize what the engineer should focus on right now. Be specific and reference numbers. No preamble, no bullet lists.",
    },
    {
      role: "user",
      content: `Page: ${scope}.\nRegistry snapshot:\n${summarizeForLLM(ctx)}\n\nDetected items:\n${insights
        .map((i) => `- [${i.severity}] ${i.title}: ${i.message}`)
        .join("\n")}`,
    },
  ]);

  const payload: AiInsightsResponse = {
    scope,
    aiConfigured: config.provider !== "none",
    provider: config.provider,
    narrative,
    insights,
  };
  res.json(payload);
});

// ───────────────────────────────────────────────────────────────────────────
// Assistant — data-aware chat available on every page.
// ───────────────────────────────────────────────────────────────────────────

function scopeSuggestions(scope: string | null | undefined): string[] {
  switch (scope) {
    case "builder":
      return [
        "How is an IK part number structured?",
        "What are the required segments?",
        "What finish is most common for UHB?",
      ];
    case "segments":
      return [
        "Which segment codes are never used?",
        "What does the CCT segment mean?",
        "How do applicable products work?",
      ];
    case "part":
      return [
        "Explain this part number",
        "Are there similar parts?",
        "Is anything wrong with this record?",
      ];
    case "library":
      return [
        "What should I clean up?",
        "How many drafts are pending?",
        "Which category has the most parts?",
      ];
    default:
      return [
        "What needs my attention today?",
        "How is a part number structured?",
        "Show my registry summary",
      ];
  }
}

router.post("/assistant", async (req, res) => {
  const parsed = AskAiAssistantBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { message, scope, history } = parsed.data;
  const ctx = await buildDataContext();
  const deepContext = assistantContext(ctx);
  const suggestions = scopeSuggestions(scope);
  const role = req.user?.role ?? "viewer";
  const roleAbilities: Record<string, string> = {
    master: "full control: create, edit, delete, manage segments, import, and manage users",
    creator: "create, edit, and duplicate parts (but NOT delete, manage segments, or manage users)",
    viewer: "read-only: browse and search, but cannot create, edit, or delete anything",
  };

  if (!isAiConfigured()) {
    const reply = [
      "AI chat isn't switched on yet, but here's a live snapshot of your registry:",
      "",
      summarizeForLLM(ctx),
      "",
      AI_SETUP_HINT,
    ].join("\n");
    const payload: AiAssistantResponse = { reply, suggestions, aiConfigured: false };
    res.json(payload);
    return;
  }

  const messages: ChatMessage[] = [
    {
      role: "system",
      content: [
        "You are the AI assistant embedded in the IK Part Number Portal, an internal tool where engineers build and manage structured lighting part numbers.",
        "You know the WHOLE registry: every part, all duplicate configurations, unfinished clones, stale drafts, and invalid segment codes are listed below. Answer precisely from this data.",
        "Be concise, concrete, and proactive — if the user's question touches a data-quality problem, point it out. Use exact part numbers and counts. Never invent segment codes or parts; if something isn't in the data, say so.",
        "You are advisory only: you cannot change data. When a fix requires an action, tell the user exactly what to click.",
        PART_NUMBER_FORMAT_REFERENCE,
        `The current user's role is "${role}" — they can ${roleAbilities[role] ?? roleAbilities.viewer}. Tailor your guidance to what they're allowed to do.`,
        `Current page scope: ${scope ?? "unknown"}.`,
        `Live registry knowledge:\n${deepContext}`,
      ].join("\n"),
    },
  ];
  for (const turn of history ?? []) {
    messages.push({ role: turn.role, content: turn.content });
  }
  messages.push({ role: "user", content: message });

  try {
    const reply = await chatText(messages, { temperature: 0.4, maxTokens: 600 });
    const payload: AiAssistantResponse = {
      reply: reply || "I couldn't generate a response. Please try rephrasing.",
      suggestions,
      aiConfigured: true,
    };
    res.json(payload);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    res.status(502).json({ error: `Assistant request failed: ${detail}` });
  }
});

// ───────────────────────────────────────────────────────────────────────────
// Explain — plain-English, segment-by-segment breakdown of a part number.
// ───────────────────────────────────────────────────────────────────────────

router.post("/explain", async (req, res) => {
  const parsed = ExplainPartNumberBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { partId, partNumber } = parsed.data;
  if (partId == null && !partNumber) {
    res.status(400).json({ error: "Provide partId or partNumber." });
    return;
  }

  const [part] = await db
    .select()
    .from(partNumbersTable)
    .where(partId != null ? eq(partNumbersTable.id, partId) : eq(partNumbersTable.partNumber, partNumber!))
    .limit(1);

  if (!part) {
    res.status(404).json({ error: "Part number not found." });
    return;
  }

  const segmentRows = await db.select().from(segmentValuesTable);
  const { byKeyAndCode } = createSegmentIndex(segmentRows);

  const segments: AiSegmentExplanation[] = [];
  for (const key of SEGMENT_KEYS) {
    const code = (part as Record<string, unknown>)[key];
    if (typeof code !== "string" || code.trim() === "") continue;
    const match = byKeyAndCode.get(`${key}:${code}`);
    segments.push({
      key,
      label: SEGMENT_FIELD_LABELS[key],
      code,
      meaning: match?.description ?? "Custom value not found in the segment catalog.",
    });
  }

  const deterministicSummary =
    `${part.partNumber} is a ${part.productCategory || "lighting"} product` +
    (part.productName ? ` ("${part.productName}")` : "") +
    ` — model ${part.productModel}${part.versionVariant}, ${segments.length} defined segments, status ${part.status}.`;

  let summary = deterministicSummary;
  if (isAiConfigured()) {
    try {
      const aiSummary = await chatText(
        [
          {
            role: "system",
            content:
              "You explain lighting part numbers to engineers in 2-3 plain-English sentences. No jargon, no bullet points. Only use the segment facts provided — do not invent details.",
          },
          {
            role: "user",
            content: [
              PART_NUMBER_FORMAT_REFERENCE,
              `Part number: ${part.partNumber}`,
              `Category: ${part.productCategory}; Name: ${part.productName}; Status: ${part.status}.`,
              "Segments:",
              ...segments.map((s) => `- ${s.label}: ${s.code} (${s.meaning})`),
            ].join("\n"),
          },
        ],
        { temperature: 0.3, maxTokens: 220 },
      );
      if (aiSummary.trim()) summary = aiSummary.trim();
    } catch {
      // Keep the deterministic summary on failure.
    }
  }

  const payload: AiExplainResponse = {
    partNumber: part.partNumber,
    summary,
    aiConfigured: isAiConfigured(),
    segments,
  };
  res.json(payload);
});

export default router;
