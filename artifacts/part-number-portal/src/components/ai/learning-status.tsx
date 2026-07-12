import { useGetLearningStatus } from "@workspace/api-client-react";
import { BrainCircuit, Boxes, Layers, Lightbulb, Gauge } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils";

function Stat({ icon: Icon, value, label }: { icon: typeof Boxes; value: number | string; label: string }) {
  return (
    <div className="flex items-center gap-2">
      <Icon className="h-4 w-4 text-sidebar-foreground/50" />
      <div>
        <p className="text-sm font-bold leading-none text-sidebar-foreground">{value}</p>
        <p className="text-[10px] uppercase tracking-wide text-sidebar-foreground/50">{label}</p>
      </div>
    </div>
  );
}

export function LearningStatus({ className }: { className?: string }) {
  const { data, isLoading } = useGetLearningStatus();

  const updated =
    data?.lastLearnedAt != null
      ? (() => {
          try {
            return `${formatDistanceToNow(new Date(data.lastLearnedAt))} ago`;
          } catch {
            return "recently";
          }
        })()
      : "no data yet";

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-xl border border-sidebar-border bg-sidebar px-5 py-4 text-sidebar-foreground shadow-sm",
        className,
      )}
    >
      <div className="pointer-events-none absolute -right-8 -top-8 h-32 w-32 rounded-full bg-primary/20 blur-3xl" />
      <div className="relative flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-3">
          <div className="relative grid h-11 w-11 place-items-center rounded-xl bg-gradient-to-br from-primary to-violet-500 text-white shadow-md shadow-primary/30">
            <BrainCircuit className="h-6 w-6" />
            <span className="absolute -right-0.5 -top-0.5 flex h-2.5 w-2.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500 ring-2 ring-sidebar" />
            </span>
          </div>
          <div>
            <p className="text-sm font-semibold">Self-Learning Model</p>
            <p className="text-xs text-sidebar-foreground/60">
              {isLoading ? "Reading your registry…" : (
                <>Trained on <span className="font-bold text-sidebar-foreground">{data?.partsLearned ?? 0}</span> parts · updated {updated}</>
              )}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-5 border-t border-sidebar-border/60 pt-3 lg:border-0 lg:pt-0">
          <Stat icon={Boxes} value={data?.models ?? 0} label="Models" />
          <Stat icon={Layers} value={data?.categories ?? 0} label="Categories" />
          <Stat icon={Lightbulb} value={data?.conventions ?? 0} label="Patterns" />
          <Stat icon={Gauge} value={`${data?.segmentCoverage ?? 0}%`} label="Coverage" />
        </div>
      </div>
    </div>
  );
}
