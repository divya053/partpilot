import { db, partNumbersTable, segmentValuesTable } from "@workspace/db";
import {
  SEGMENT_KEYS,
  SEGMENT_FIELD_LABELS,
  parseApplicableProducts,
  type PartNumberRow,
  type SegmentKey,
} from "./partNumberBuilder";

/**
 * The self-training data layer.
 *
 * Everything here is derived *live* from the portal's own database — no model
 * training, no external calls. As engineers create more part numbers the mined
 * conventions, usage stats, and anomaly detection automatically get sharper.
 * The LLM features sit on top of this context; the deterministic insights below
 * work even when no AI provider is configured.
 */

export type InsightScope =
  | "dashboard"
  | "builder"
  | "library"
  | "part"
  | "segments"
  | "global";

export type InsightSeverity = "info" | "suggestion" | "warning" | "critical";

export interface Insight {
  id: string;
  scope: InsightScope;
  severity: InsightSeverity;
  title: string;
  message: string;
  actionLabel: string | null;
  actionHref: string | null;
  field: string | null;
  // Optional detail list shown when the insight is expanded (e.g. every
  // duplicate cluster, not just the first).
  items?: Array<{ label: string; href: string | null }> | null;
}

export interface LearnedConvention {
  productModel: string;
  count: number;
  common: Array<{ field: SegmentKey; label: string; code: string; share: number }>;
}

export interface DataContext {
  totals: {
    parts: number;
    active: number;
    draft: number;
    deprecated: number;
    categories: number;
    models: number;
    createdThisWeek: number;
    createdThisMonth: number;
  };
  topCategories: Array<{ name: string; count: number }>;
  topModels: Array<{ model: string; count: number }>;
  learnedConventions: LearnedConvention[];
  segmentUsage: Array<{
    key: SegmentKey;
    label: string;
    definedCodes: number;
    usedCodes: number;
    unusedCodes: string[];
    topCodes: Array<{ code: string; count: number }>;
  }>;
  copyArtifacts: Array<{ id: number; partNumber: string }>;
  staleDrafts: Array<{ id: number; partNumber: string; ageDays: number }>;
  duplicateNames: Array<{ name: string; count: number }>;
  unknownSegmentCodes: Array<{ id: number; partNumber: string; field: SegmentKey; code: string }>;
  duplicateClusters: Array<{
    signature: string;
    count: number;
    parts: Array<{ id: number; partNumber: string; status: string }>;
  }>;
  parts: PartNumberRow[];
}

// Core fields (minus company) that define a part's electrical/optical configuration.
// Two parts sharing these are effectively the same product configuration.
const SIGNATURE_FIELDS: SegmentKey[] = [
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
];

const MS_PER_DAY = 1000 * 60 * 60 * 24;
const STALE_DRAFT_DAYS = 21;

function ageInDays(date: Date, now: number): number {
  return Math.floor((now - new Date(date).getTime()) / MS_PER_DAY);
}

function topN<T extends string>(counts: Map<T, number>, n: number): Array<{ key: T; count: number }> {
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([key, count]) => ({ key, count }));
}

/**
 * Build the full data context by reading the whole registry once. `nowMs` is
 * injected so callers/tests can control "today".
 */
export async function buildDataContext(nowMs: number = Date.now()): Promise<DataContext> {
  const [parts, segmentRows] = await Promise.all([
    db.select().from(partNumbersTable),
    db.select().from(segmentValuesTable),
  ]);

  const startOfWeek = (() => {
    const d = new Date(nowMs);
    d.setDate(d.getDate() - d.getDay());
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  })();
  const startOfMonth = (() => {
    const d = new Date(nowMs);
    return new Date(d.getFullYear(), d.getMonth(), 1).getTime();
  })();

  // ── Status + basic rollups ────────────────────────────────────────────────
  let active = 0;
  let draft = 0;
  let deprecated = 0;
  let createdThisWeek = 0;
  let createdThisMonth = 0;
  const categoryCounts = new Map<string, number>();
  const modelCounts = new Map<string, number>();

  for (const part of parts) {
    if (part.status === "active") active += 1;
    else if (part.status === "draft") draft += 1;
    else if (part.status === "deprecated") deprecated += 1;

    const created = new Date(part.createdAt).getTime();
    if (created >= startOfWeek) createdThisWeek += 1;
    if (created >= startOfMonth) createdThisMonth += 1;

    if (part.productCategory) categoryCounts.set(part.productCategory, (categoryCounts.get(part.productCategory) ?? 0) + 1);
    if (part.productModel) modelCounts.set(part.productModel, (modelCounts.get(part.productModel) ?? 0) + 1);
  }

  // ── Segment usage (which defined codes are actually used) ─────────────────
  const definedByKey = new Map<SegmentKey, Set<string>>();
  const inactiveByKeyCode = new Map<string, boolean>();
  for (const row of segmentRows) {
    const key = row.segmentKey as SegmentKey;
    const set = definedByKey.get(key) ?? new Set<string>();
    set.add(row.code);
    definedByKey.set(key, set);
    inactiveByKeyCode.set(`${key}:${row.code}`, !row.isActive);
  }

  const usageByKey = new Map<SegmentKey, Map<string, number>>();
  const unknownSegmentCodes: DataContext["unknownSegmentCodes"] = [];
  for (const part of parts) {
    for (const key of SEGMENT_KEYS) {
      const value = (part as Record<string, unknown>)[key];
      if (typeof value !== "string" || value.trim() === "") continue;
      const map = usageByKey.get(key) ?? new Map<string, number>();
      map.set(value, (map.get(value) ?? 0) + 1);
      usageByKey.set(key, map);

      const defined = definedByKey.get(key);
      if (defined && !defined.has(value) && unknownSegmentCodes.length < 50) {
        unknownSegmentCodes.push({ id: part.id, partNumber: part.partNumber, field: key, code: value });
      }
    }
  }

  const segmentUsage: DataContext["segmentUsage"] = SEGMENT_KEYS.map((key) => {
    const defined = definedByKey.get(key) ?? new Set<string>();
    const usage = usageByKey.get(key) ?? new Map<string, number>();
    const usedCodes = new Set([...usage.keys()].filter((c) => defined.has(c)));
    const unusedCodes = [...defined].filter((c) => !usage.has(c));
    return {
      key,
      label: SEGMENT_FIELD_LABELS[key],
      definedCodes: defined.size,
      usedCodes: usedCodes.size,
      unusedCodes,
      topCodes: topN(usage, 5).map(({ key: code, count }) => ({ code, count })),
    };
  });

  // ── Learned conventions per product model ─────────────────────────────────
  const CONVENTION_FIELDS: SegmentKey[] = ["finish", "cct", "voltageRange", "driver", "dimming", "lightDistribution"];
  const learnedConventions: LearnedConvention[] = topN(modelCounts, 6).map(({ key: model, count }) => {
    const modelParts = parts.filter((p) => p.productModel === model);
    const common = CONVENTION_FIELDS.map((field) => {
      const counts = new Map<string, number>();
      for (const p of modelParts) {
        const v = (p as Record<string, unknown>)[field];
        if (typeof v === "string" && v.trim() !== "") counts.set(v, (counts.get(v) ?? 0) + 1);
      }
      const best = topN(counts, 1)[0];
      if (!best) return null;
      return {
        field,
        label: SEGMENT_FIELD_LABELS[field],
        code: best.key,
        share: Math.round((best.count / modelParts.length) * 100),
      };
    }).filter((x): x is NonNullable<typeof x> => x !== null && x.share >= 50);
    return { productModel: model, count, common };
  });

  // ── Data-hygiene signals ──────────────────────────────────────────────────
  const copyArtifacts = parts
    .filter((p) => /_COPY_/i.test(p.partNumber) || /\(copy\)/i.test(p.productName ?? ""))
    .slice(0, 25)
    .map((p) => ({ id: p.id, partNumber: p.partNumber }));

  const staleDrafts = parts
    .filter((p) => p.status === "draft" && ageInDays(p.updatedAt, nowMs) >= STALE_DRAFT_DAYS)
    .map((p) => ({ id: p.id, partNumber: p.partNumber, ageDays: ageInDays(p.updatedAt, nowMs) }))
    .sort((a, b) => b.ageDays - a.ageDays)
    .slice(0, 25);

  const nameCounts = new Map<string, number>();
  for (const p of parts) {
    const name = (p.productName ?? "").trim().toLowerCase();
    if (name) nameCounts.set(name, (nameCounts.get(name) ?? 0) + 1);
  }
  const duplicateNames = [...nameCounts.entries()]
    .filter(([, count]) => count > 1)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([name, count]) => ({ name, count }));

  // Configuration duplicates: parts that share the same core segment signature.
  const bySignature = new Map<string, PartNumberRow[]>();
  for (const p of parts) {
    const signature = SIGNATURE_FIELDS.map((k) => String((p as Record<string, unknown>)[k] ?? "")).join("|");
    const list = bySignature.get(signature) ?? [];
    list.push(p);
    bySignature.set(signature, list);
  }
  const duplicateClusters = [...bySignature.entries()]
    .filter(([, list]) => list.length > 1)
    .sort((a, b) => b[1].length - a[1].length)
    .slice(0, 20)
    .map(([signature, list]) => ({
      signature,
      count: list.length,
      parts: list.slice(0, 6).map((p) => ({ id: p.id, partNumber: p.partNumber, status: p.status })),
    }));

  return {
    totals: {
      parts: parts.length,
      active,
      draft,
      deprecated,
      categories: categoryCounts.size,
      models: modelCounts.size,
      createdThisWeek,
      createdThisMonth,
    },
    topCategories: topN(categoryCounts, 6).map(({ key, count }) => ({ name: key, count })),
    topModels: topN(modelCounts, 8).map(({ key, count }) => ({ model: key, count })),
    learnedConventions,
    segmentUsage,
    copyArtifacts,
    staleDrafts,
    duplicateNames,
    unknownSegmentCodes,
    duplicateClusters,
    parts,
  };
}

// ───────────────────────────────────────────────────────────────────────────
// Deterministic insight generation — pure function of the mined context.
// ───────────────────────────────────────────────────────────────────────────

function pct(part: number, whole: number): number {
  return whole === 0 ? 0 : Math.round((part / whole) * 100);
}

function registryInsights(ctx: DataContext, scope: InsightScope): Insight[] {
  const out: Insight[] = [];
  const t = ctx.totals;

  if (t.parts === 0) {
    out.push({
      id: "empty-registry",
      scope,
      severity: "info",
      title: "Your registry is empty",
      message: "Create your first part number in the Builder — the AI starts learning your conventions from the very first record.",
      actionLabel: "Open Builder",
      actionHref: "/builder",
      field: null,
    });
    return out;
  }

  const draftPct = pct(t.draft, t.parts);
  if (t.draft > 0 && draftPct >= 30) {
    out.push({
      id: "high-draft-ratio",
      scope,
      severity: "suggestion",
      title: `${t.draft} parts still in draft (${draftPct}%)`,
      message: "A large share of the registry is unreviewed. Promote finished drafts to Active so downstream teams can rely on them.",
      actionLabel: "Review drafts",
      actionHref: "/library",
      field: null,
    });
  }

  if (ctx.staleDrafts.length > 0) {
    const oldest = ctx.staleDrafts[0];
    out.push({
      id: "stale-drafts",
      scope,
      severity: "warning",
      title: `${ctx.staleDrafts.length} stale draft${ctx.staleDrafts.length > 1 ? "s" : ""}`,
      message: `${oldest.partNumber} has sat in draft for ${oldest.ageDays} days. Stale drafts usually mean abandoned or forgotten work.`,
      actionLabel: "View oldest",
      actionHref: `/library/${oldest.id}`,
      field: null,
      items: ctx.staleDrafts.map((d) => ({ label: `${d.partNumber} — ${d.ageDays} days`, href: `/library/${d.id}` })),
    });
  }

  if (ctx.copyArtifacts.length > 0) {
    out.push({
      id: "copy-artifacts",
      scope,
      severity: "warning",
      title: `${ctx.copyArtifacts.length} un-finalized clone${ctx.copyArtifacts.length > 1 ? "s" : ""}`,
      message: `Records like ${ctx.copyArtifacts[0].partNumber} still carry the "_COPY_" placeholder. Finish their segments or delete them to keep the registry clean.`,
      actionLabel: "Fix first clone",
      actionHref: `/library/${ctx.copyArtifacts[0].id}`,
      field: null,
      items: ctx.copyArtifacts.map((c) => ({ label: c.partNumber, href: `/library/${c.id}` })),
    });
  }

  if (ctx.duplicateClusters.length > 0) {
    const c = ctx.duplicateClusters[0];
    out.push({
      id: "duplicate-configs",
      scope,
      severity: "warning",
      title: `${ctx.duplicateClusters.length} duplicate configuration${ctx.duplicateClusters.length > 1 ? "s" : ""}`,
      message: `${c.count} parts share identical core segments (${c.parts.map((p) => p.partNumber).slice(0, 3).join(", ")}${c.count > 3 ? "…" : ""}). These are effectively the same product — consolidate or deprecate the extras. Expand to see all ${ctx.duplicateClusters.length} groups.`,
      actionLabel: c.parts[0] ? "Open first" : null,
      actionHref: c.parts[0] ? `/library/${c.parts[0].id}` : null,
      field: null,
      // Every duplicate group, so expanding shows the full list (not just the first).
      items: ctx.duplicateClusters.map((cluster) => ({
        label: cluster.parts.map((p) => p.partNumber).join("  ·  "),
        href: cluster.parts[0] ? `/library/${cluster.parts[0].id}` : null,
      })),
    });
  }

  if (ctx.duplicateNames.length > 0) {
    const d = ctx.duplicateNames[0];
    const sharedParts = ctx.parts.filter(
      (p) => (p.productName ?? "").trim().toLowerCase() === d.name.trim().toLowerCase(),
    );
    out.push({
      id: "duplicate-names",
      scope,
      severity: "suggestion",
      title: `Repeated product name: "${d.name}"`,
      message: `${d.count} parts share this product name. Distinct names make search and reporting far easier.`,
      actionLabel: "Search library",
      actionHref: `/library`,
      field: null,
      items: sharedParts.map((p) => ({ label: p.partNumber, href: `/library/${p.id}` })),
    });
  }

  const nonStandardCompany = ctx.parts.filter((p) => p.company && p.company !== "IK").length;
  if (nonStandardCompany > 0) {
    out.push({
      id: "non-standard-company",
      scope,
      severity: "warning",
      title: `${nonStandardCompany} part${nonStandardCompany > 1 ? "s" : ""} not using company code "IK"`,
      message: "Company should normally be IK. Review these records for data-entry mistakes.",
      actionLabel: null,
      actionHref: null,
      field: "company",
    });
  }

  if (t.parts > 0 && ctx.topCategories.length > 0) {
    const dominant = ctx.topCategories[0];
    const share = pct(dominant.count, t.parts);
    if (share >= 60 && t.categories > 1) {
      out.push({
        id: "category-concentration",
        scope,
        severity: "info",
        title: `${dominant.name} dominates the catalog (${share}%)`,
        message: "Most parts fall into a single category. Worth confirming other product lines are being logged here too.",
        actionLabel: null,
        actionHref: null,
        field: null,
      });
    }
  }

  if (t.createdThisWeek > 0) {
    out.push({
      id: "recent-activity",
      scope,
      severity: "info",
      title: `${t.createdThisWeek} new part${t.createdThisWeek > 1 ? "s" : ""} this week`,
      message: `${t.createdThisMonth} created this month across ${t.models} models. Momentum is healthy.`,
      actionLabel: null,
      actionHref: null,
      field: null,
    });
  }

  return out;
}

function segmentInsights(ctx: DataContext, scope: InsightScope): Insight[] {
  const out: Insight[] = [];

  const unusedRich = ctx.segmentUsage
    .filter((s) => s.definedCodes > 0 && s.unusedCodes.length > 0)
    .sort((a, b) => b.unusedCodes.length - a.unusedCodes.length);

  if (unusedRich.length > 0) {
    const worst = unusedRich[0];
    out.push({
      id: "unused-codes",
      scope,
      severity: "suggestion",
      title: `${worst.unusedCodes.length} unused ${worst.label} code${worst.unusedCodes.length > 1 ? "s" : ""}`,
      message: `Codes never used by any part: ${worst.unusedCodes.slice(0, 8).join(", ")}${worst.unusedCodes.length > 8 ? "…" : ""}. Prune obsolete options or promote them if they're valid.`,
      actionLabel: "Manage segments",
      actionHref: "/segments",
      field: worst.key,
      items: worst.unusedCodes.map((code) => ({ label: code, href: null })),
    });
  }

  if (ctx.unknownSegmentCodes.length > 0) {
    const u = ctx.unknownSegmentCodes[0];
    out.push({
      id: "unknown-codes",
      scope,
      severity: "critical",
      title: `${ctx.unknownSegmentCodes.length} part${ctx.unknownSegmentCodes.length > 1 ? "s use" : " uses"} an undefined code`,
      message: `${u.partNumber} contains "${u.code}", which isn't in the ${SEGMENT_FIELD_LABELS[u.field]} segment catalog. Add the code or correct the part.`,
      actionLabel: "Open part",
      actionHref: `/library/${u.id}`,
      field: u.field,
      items: ctx.unknownSegmentCodes.map((c) => ({
        label: `${c.partNumber} — ${SEGMENT_FIELD_LABELS[c.field]} "${c.code}"`,
        href: `/library/${c.id}`,
      })),
    });
  }

  const thin = ctx.segmentUsage.filter((s) => s.definedCodes > 0 && s.definedCodes <= 1);
  if (thin.length > 0) {
    out.push({
      id: "thin-segments",
      scope,
      severity: "info",
      title: `${thin.length} segment${thin.length > 1 ? "s have" : " has"} only one option`,
      message: `${thin.map((s) => s.label).slice(0, 5).join(", ")} offer a single code. That's fine for fixed fields, but confirm no options are missing.`,
      actionLabel: "Manage segments",
      actionHref: "/segments",
      field: null,
      items: thin.map((s) => ({ label: `${s.label} — ${s.definedCodes} code`, href: "/segments" })),
    });
  }

  return out;
}

/** Insights for a single part detail page. */
function partInsights(ctx: DataContext, part: PartNumberRow): Insight[] {
  const out: Insight[] = [];
  const now = Date.now();

  if (/_COPY_/i.test(part.partNumber)) {
    out.push({
      id: "part-is-clone",
      scope: "part",
      severity: "warning",
      title: "Unfinished clone",
      message: "This part still carries the \"_COPY_\" placeholder in its number. Update its segments in the Builder or delete it.",
      actionLabel: null,
      actionHref: null,
      field: null,
    });
  }

  if (part.status === "draft") {
    const age = ageInDays(part.updatedAt, now);
    out.push({
      id: "part-draft",
      scope: "part",
      severity: age >= STALE_DRAFT_DAYS ? "warning" : "info",
      title: age >= STALE_DRAFT_DAYS ? `Draft untouched for ${age} days` : "Still a draft",
      message: "Promote to Active once the configuration is confirmed so other teams can use it.",
      actionLabel: null,
      actionHref: null,
      field: "status",
    });
  }

  if (!part.sku || part.sku.trim() === "") {
    out.push({
      id: "part-missing-sku",
      scope: "part",
      severity: "suggestion",
      title: "No SKU assigned",
      message: "Adding a SKU / item code links this part number to your ERP and ordering systems.",
      actionLabel: null,
      actionHref: null,
      field: "sku",
    });
  }

  // Undefined codes on this specific part.
  const unknownHere = ctx.unknownSegmentCodes.filter((u) => u.id === part.id);
  for (const u of unknownHere.slice(0, 3)) {
    out.push({
      id: `part-unknown-${u.field}`,
      scope: "part",
      severity: "critical",
      title: `Undefined ${SEGMENT_FIELD_LABELS[u.field]} code "${u.code}"`,
      message: `"${u.code}" isn't in the segment catalog. Add it under Segments or correct this part.`,
      actionLabel: "Manage segments",
      actionHref: "/segments",
      field: u.field,
    });
  }

  // Learned-convention deviation.
  const convention = ctx.learnedConventions.find((c) => c.productModel === part.productModel);
  if (convention) {
    for (const c of convention.common) {
      const value = (part as Record<string, unknown>)[c.field];
      if (typeof value === "string" && value && value !== c.code) {
        out.push({
          id: `part-deviation-${c.field}`,
          scope: "part",
          severity: "info",
          title: `Unusual ${c.label} for a ${part.productModel}`,
          message: `${c.share}% of ${part.productModel} parts use ${c.label} "${c.code}", but this one uses "${value}". Not wrong — just uncommon.`,
          actionLabel: null,
          actionHref: null,
          field: c.field,
        });
      }
    }
  }

  // Similar existing parts (same model + size + power).
  const similar = ctx.parts.filter(
    (p) =>
      p.id !== part.id &&
      p.productModel === part.productModel &&
      p.sizeVariant === part.sizeVariant &&
      p.maxPower === part.maxPower,
  );
  if (similar.length > 0) {
    out.push({
      id: "part-similar",
      scope: "part",
      severity: "info",
      title: `${similar.length} closely related part${similar.length > 1 ? "s" : ""}`,
      message: `Same model, size, and power as ${similar.slice(0, 3).map((p) => p.partNumber).join(", ")}${similar.length > 3 ? "…" : ""}.`,
      actionLabel: "First match",
      actionHref: `/library/${similar[0].id}`,
      field: null,
    });
  }

  if (out.length === 0) {
    out.push({
      id: "part-clean",
      scope: "part",
      severity: "info",
      title: "No issues detected",
      message: "This part follows your registry's conventions and has no data-quality flags.",
      actionLabel: null,
      actionHref: null,
      field: null,
    });
  }

  return out;
}

function builderInsights(ctx: DataContext, scope: InsightScope): Insight[] {
  const out: Insight[] = [];

  if (ctx.learnedConventions.length > 0) {
    const top = ctx.learnedConventions[0];
    if (top.common.length > 0) {
      out.push({
        id: "builder-conventions",
        scope,
        severity: "suggestion",
        title: `Learned defaults for ${top.productModel}`,
        message: `Across ${top.count} existing ${top.productModel} parts: ${top.common
          .map((c) => `${c.label} ${c.code} (${c.share}%)`)
          .join(", ")}. Match these unless this build is intentionally different.`,
        actionLabel: null,
        actionHref: null,
        field: null,
      });
    }
  }

  if (ctx.totals.parts > 0) {
    out.push({
      id: "builder-duplicate-guard",
      scope,
      severity: "info",
      title: "Duplicate protection is on",
      message: `The builder checks every new code against all ${ctx.totals.parts} existing parts and warns before you create a collision.`,
      actionLabel: null,
      actionHref: null,
      field: null,
    });
  } else {
    out.push({
      id: "builder-first",
      scope,
      severity: "info",
      title: "Describe it in plain English",
      message: "Use the AI Assistant box above to turn a product description into segment selections, then refine the fields.",
      actionLabel: null,
      actionHref: null,
      field: null,
    });
  }

  return out;
}

export function computeInsights(
  ctx: DataContext,
  scope: InsightScope,
  part?: PartNumberRow | null,
): Insight[] {
  switch (scope) {
    case "part":
      return part ? partInsights(ctx, part) : [];
    case "segments":
      return segmentInsights(ctx, scope);
    case "builder":
      return [...builderInsights(ctx, scope), ...registryInsights(ctx, scope).slice(0, 2)];
    case "library":
    case "dashboard":
    case "global":
    default:
      return [...registryInsights(ctx, scope), ...segmentInsights(ctx, scope).slice(0, 1)];
  }
}

/**
 * Compact, token-efficient snapshot of the registry for grounding the LLM
 * assistant and narratives. Kept small on purpose.
 */
export function summarizeForLLM(ctx: DataContext): string {
  const t = ctx.totals;
  const lines: string[] = [];
  lines.push(
    `Registry: ${t.parts} parts (${t.active} active, ${t.draft} draft, ${t.deprecated} deprecated) across ${t.categories} categories and ${t.models} models. ${t.createdThisWeek} created this week, ${t.createdThisMonth} this month.`,
  );
  if (ctx.topCategories.length) {
    lines.push(`Top categories: ${ctx.topCategories.map((c) => `${c.name} (${c.count})`).join(", ")}.`);
  }
  if (ctx.topModels.length) {
    lines.push(`Top models: ${ctx.topModels.map((m) => `${m.model} (${m.count})`).join(", ")}.`);
  }
  for (const conv of ctx.learnedConventions.slice(0, 4)) {
    if (conv.common.length) {
      lines.push(
        `Convention — ${conv.productModel} (${conv.count} parts): ${conv.common
          .map((c) => `${c.label}=${c.code} ${c.share}%`)
          .join(", ")}.`,
      );
    }
  }
  const flags: string[] = [];
  if (ctx.copyArtifacts.length) flags.push(`${ctx.copyArtifacts.length} unfinished clones`);
  if (ctx.staleDrafts.length) flags.push(`${ctx.staleDrafts.length} stale drafts`);
  if (ctx.unknownSegmentCodes.length) flags.push(`${ctx.unknownSegmentCodes.length} parts with undefined segment codes`);
  if (ctx.duplicateNames.length) flags.push(`${ctx.duplicateNames.length} duplicated product names`);
  if (flags.length) lines.push(`Data-quality flags: ${flags.join("; ")}.`);

  const unused = ctx.segmentUsage.filter((s) => s.unusedCodes.length > 0);
  if (unused.length) {
    lines.push(
      `Unused segment codes: ${unused
        .slice(0, 5)
        .map((s) => `${s.label} [${s.unusedCodes.slice(0, 4).join(", ")}]`)
        .join("; ")}.`,
    );
  }
  return lines.join("\n");
}

/**
 * Deep, itemized context for the "know-everything" chat assistant. Larger than
 * summarizeForLLM: it enumerates the actual duplicate clusters, unfinished
 * clones, stale drafts, and undefined-code parts so the assistant can answer
 * precisely ("which parts are duplicated?", "what's wrong in the registry?").
 */
export function assistantContext(ctx: DataContext): string {
  const lines: string[] = [summarizeForLLM(ctx)];

  if (ctx.duplicateClusters.length) {
    lines.push("");
    lines.push(`DUPLICATE CONFIGURATIONS (${ctx.duplicateClusters.length} groups of parts with identical core segments):`);
    for (const c of ctx.duplicateClusters.slice(0, 12)) {
      lines.push(`- ${c.count}× ${c.parts.map((p) => `${p.partNumber} (${p.status})`).join(", ")}`);
    }
  }

  if (ctx.copyArtifacts.length) {
    lines.push("");
    lines.push(`UNFINISHED CLONES (still carry _COPY_): ${ctx.copyArtifacts.map((c) => c.partNumber).slice(0, 12).join(", ")}.`);
  }

  if (ctx.staleDrafts.length) {
    lines.push("");
    lines.push(
      `STALE DRAFTS: ${ctx.staleDrafts
        .slice(0, 12)
        .map((d) => `${d.partNumber} (${d.ageDays}d)`)
        .join(", ")}.`,
    );
  }

  if (ctx.unknownSegmentCodes.length) {
    lines.push("");
    lines.push(
      `INVALID/UNDEFINED SEGMENT CODES: ${ctx.unknownSegmentCodes
        .slice(0, 12)
        .map((u) => `${u.partNumber} uses ${SEGMENT_FIELD_LABELS[u.field]}="${u.code}"`)
        .join("; ")}.`,
    );
  }

  return lines.join("\n");
}
