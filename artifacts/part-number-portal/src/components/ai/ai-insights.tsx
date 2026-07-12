import { useState } from "react";
import {
  useGetAiInsights,
  type AiInsight,
  type AiInsightSeverity,
  type GetAiInsightsScope,
} from "@workspace/api-client-react";
import { Link } from "wouter";
import {
  Sparkles,
  Info,
  Lightbulb,
  AlertTriangle,
  AlertOctagon,
  ArrowRight,
  ShieldCheck,
  ChevronDown,
  Bot,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type SeverityMeta = {
  icon: typeof Info;
  order: number;
  pill: string; // short human label
  text: string; // text color
  tile: string; // icon tile bg + text
  accent: string; // left accent bar
  badge: string; // pill bg
  glow: string; // subtle card glow
};

const SEVERITY: Record<AiInsightSeverity, SeverityMeta> = {
  critical: {
    icon: AlertOctagon,
    order: 0,
    pill: "Fix now",
    text: "text-rose-600 dark:text-rose-400",
    tile: "bg-rose-500/15 text-rose-500",
    accent: "bg-rose-500",
    badge: "bg-rose-500/15 text-rose-600 dark:text-rose-400",
    glow: "hover:shadow-rose-500/10",
  },
  warning: {
    icon: AlertTriangle,
    order: 1,
    pill: "Review",
    text: "text-amber-600 dark:text-amber-400",
    tile: "bg-amber-500/15 text-amber-500",
    accent: "bg-amber-500",
    badge: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
    glow: "hover:shadow-amber-500/10",
  },
  suggestion: {
    icon: Lightbulb,
    order: 2,
    pill: "Tip",
    text: "text-violet-600 dark:text-violet-400",
    tile: "bg-violet-500/15 text-violet-500",
    accent: "bg-violet-500",
    badge: "bg-violet-500/15 text-violet-600 dark:text-violet-400",
    glow: "hover:shadow-violet-500/10",
  },
  info: {
    icon: Info,
    order: 3,
    pill: "FYI",
    text: "text-sky-600 dark:text-sky-400",
    tile: "bg-sky-500/15 text-sky-500",
    accent: "bg-sky-500",
    badge: "bg-sky-500/15 text-sky-600 dark:text-sky-400",
    glow: "hover:shadow-sky-500/10",
  },
};

function InsightCard({ insight, index }: { insight: AiInsight; index: number }) {
  const [open, setOpen] = useState(false);
  const meta = SEVERITY[insight.severity] ?? SEVERITY.info;
  const Icon = meta.icon;
  const isInternal = insight.actionHref?.startsWith("/");

  const ActionButton = insight.actionLabel && insight.actionHref ? (
    <Button
      size="sm"
      variant="ghost"
      className={cn("h-7 gap-1 px-2.5 text-xs font-semibold", meta.text)}
    >
      {insight.actionLabel}
      <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover/card:translate-x-0.5" />
    </Button>
  ) : null;

  return (
    <div
      className={cn(
        "group/card relative overflow-hidden rounded-xl border border-border/70 bg-card shadow-sm transition-all",
        "hover:-translate-y-0.5 hover:shadow-md",
        meta.glow,
        "animate-in fade-in slide-in-from-bottom-1",
      )}
      style={{ animationDelay: `${index * 45}ms`, animationFillMode: "backwards" }}
    >
      {/* severity accent bar */}
      <div className={cn("absolute inset-y-0 left-0 w-1", meta.accent)} />

      <div className="flex items-start gap-3 py-3 pl-4 pr-3">
        <div className={cn("mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-lg", meta.tile)}>
          <Icon className="h-[18px] w-[18px]" />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <p className="text-sm font-semibold leading-snug text-foreground">{insight.title}</p>
            <span
              className={cn(
                "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide",
                meta.badge,
              )}
            >
              {meta.pill}
            </span>
          </div>

          {/* One-line takeaway; full text on expand — no wall of text by default */}
          <p className={cn("mt-1 text-[13px] leading-6 text-muted-foreground", open ? "" : "line-clamp-1")}>
            {insight.message}
          </p>

          <div className="mt-1.5 flex items-center gap-1">
            {insight.message.length > 60 ? (
              <button
                onClick={() => setOpen((v) => !v)}
                className="flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground/80 transition-colors hover:bg-muted hover:text-foreground"
              >
                {open ? "Less" : "Why?"}
                <ChevronDown className={cn("h-3 w-3 transition-transform", open && "rotate-180")} />
              </button>
            ) : null}
            {insight.field ? (
              <span className="rounded-md bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
                {insight.field}
              </span>
            ) : null}
            <div className="ml-auto">
              {insight.actionHref ? (
                isInternal ? (
                  <Link href={insight.actionHref}>{ActionButton}</Link>
                ) : (
                  <a href={insight.actionHref} target="_blank" rel="noreferrer">
                    {ActionButton}
                  </a>
                )
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function SeveritySummary({ insights }: { insights: AiInsight[] }) {
  const counts = insights.reduce<Record<string, number>>((acc, i) => {
    acc[i.severity] = (acc[i.severity] ?? 0) + 1;
    return acc;
  }, {});
  const order: AiInsightSeverity[] = ["critical", "warning", "suggestion", "info"];
  const present = order.filter((s) => counts[s]);
  if (present.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {present.map((s) => {
        const meta = SEVERITY[s];
        return (
          <span
            key={s}
            className={cn(
              "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold",
              meta.badge,
            )}
          >
            <span className={cn("h-1.5 w-1.5 rounded-full", meta.accent)} />
            {counts[s]} {meta.pill}
          </span>
        );
      })}
    </div>
  );
}

export interface AiInsightsProps {
  scope: GetAiInsightsScope;
  partId?: number;
  title?: string;
  description?: string;
  className?: string;
}

/**
 * Scannable AI "feed": severity-ranked cards, each leading with a punchy
 * headline + a clear action, with the explanation tucked behind "Why?".
 * Deterministic insights render even without an AI key; a short AI narrative
 * shows on top when a provider is configured.
 */
export function AiInsights({ scope, partId, title, description, className }: AiInsightsProps) {
  const { data, isLoading, isError } = useGetAiInsights(
    typeof partId === "number" ? { scope, partId } : { scope },
  );

  const insights = [...(data?.insights ?? [])].sort(
    (a, b) => (SEVERITY[a.severity]?.order ?? 9) - (SEVERITY[b.severity]?.order ?? 9),
  );

  return (
    <Card
      className={cn(
        "overflow-hidden border-border/70 shadow-sm",
        className,
      )}
    >
      {/* Gradient AI header */}
      <CardHeader className="relative border-b border-border/60 bg-gradient-to-r from-primary/[0.07] via-violet-500/[0.05] to-transparent pb-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="relative grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-primary to-violet-500 text-white shadow-md shadow-primary/30">
              <Sparkles className="h-[18px] w-[18px]" />
              <span className="absolute -right-0.5 -top-0.5 flex h-2.5 w-2.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500 ring-2 ring-card" />
              </span>
            </div>
            <div>
              <CardTitle className="text-base leading-tight">{title ?? "AI Insights"}</CardTitle>
              {description ? (
                <CardDescription className="text-xs">{description}</CardDescription>
              ) : null}
            </div>
          </div>
          {data ? (
            data.aiConfigured ? (
              <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium capitalize text-emerald-600 dark:text-emerald-400">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                {data.provider}
              </span>
            ) : (
              <span className="rounded-full border px-2 py-0.5 text-[10px] text-muted-foreground">
                Rules only
              </span>
            )
          ) : null}
        </div>

        {!isLoading && insights.length > 0 ? (
          <div className="mt-3">
            <SeveritySummary insights={insights} />
          </div>
        ) : null}
      </CardHeader>

      <CardContent className="space-y-3 p-4">
        {/* AI narrative — reads like the assistant speaking, not a note */}
        {data?.narrative ? (
          <div className="flex gap-2.5 rounded-xl border border-primary/15 bg-gradient-to-br from-primary/[0.06] to-violet-500/[0.04] p-3.5">
            <div className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full bg-primary/15 text-primary">
              <Bot className="h-4 w-4" />
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-primary/80">
                AI summary
              </p>
              <p className="mt-0.5 text-sm leading-6 text-foreground">{data.narrative}</p>
            </div>
          </div>
        ) : null}

        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex gap-3 rounded-xl border border-border/60 p-3.5">
                <div className="h-9 w-9 shrink-0 animate-pulse rounded-lg bg-muted" />
                <div className="flex-1 space-y-2">
                  <div className="h-3.5 w-2/3 animate-pulse rounded bg-muted" />
                  <div className="h-3 w-full animate-pulse rounded bg-muted/70" />
                </div>
              </div>
            ))}
          </div>
        ) : isError ? (
          <div className="rounded-xl border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">
            Couldn't load insights. Is the API server running?
          </div>
        ) : insights.length === 0 ? (
          <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-emerald-500/30 bg-emerald-500/[0.04] px-4 py-8 text-center">
            <div className="grid h-11 w-11 place-items-center rounded-full bg-emerald-500/15">
              <ShieldCheck className="h-6 w-6 text-emerald-500" />
            </div>
            <p className="text-sm font-semibold text-foreground">All clear</p>
            <p className="text-xs text-muted-foreground">
              No suggestions or alerts for this view right now.
            </p>
          </div>
        ) : (
          <div className="space-y-2.5">
            {insights.map((insight, i) => (
              <InsightCard key={insight.id} insight={insight} index={i} />
            ))}
          </div>
        )}

        {!isLoading && data && !data.aiConfigured && insights.length > 0 ? (
          <p className="pt-1 text-[11px] leading-5 text-muted-foreground">
            Live analysis of your registry. Add a free{" "}
            <span className="font-mono">GROQ_API_KEY</span> for AI summaries and chat.
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
