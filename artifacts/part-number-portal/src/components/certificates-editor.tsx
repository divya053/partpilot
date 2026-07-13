import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export type Certificate = { name: string; status: string };

export const CERT_STATUS_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "pending", label: "Pending" },
  { value: "in_process", label: "In process" },
  { value: "done", label: "Done" },
];

export function certStatusLabel(status: string | null | undefined): string {
  return CERT_STATUS_OPTIONS.find((o) => o.value === status)?.label ?? (status || "—");
}

/** Colour classes for a certificate status badge. */
export function certStatusClasses(status: string | null | undefined): string {
  switch (status) {
    case "done":
      return "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border border-emerald-500/30";
    case "in_process":
      return "bg-amber-500/15 text-amber-700 dark:text-amber-400 border border-amber-500/30";
    default:
      return "bg-muted text-muted-foreground border border-border";
  }
}

/** Add/remove rows, each a certificate name + its own status. Used by builder + part detail. */
export function CertificatesEditor({
  value,
  onChange,
}: {
  value: Certificate[];
  onChange: (next: Certificate[]) => void;
}) {
  const items = value ?? [];
  const update = (index: number, patch: Partial<Certificate>) =>
    onChange(items.map((c, i) => (i === index ? { ...c, ...patch } : c)));
  const remove = (index: number) => onChange(items.filter((_, i) => i !== index));
  const add = () => onChange([...items, { name: "", status: "pending" }]);

  return (
    <div className="space-y-2">
      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">No certificates yet — add one below.</p>
      ) : (
        items.map((cert, i) => (
          <div key={i} className="flex items-center gap-2">
            <Input
              value={cert.name}
              onChange={(e) => update(i, { name: e.target.value })}
              placeholder="Certificate name (e.g. UL, DLC, CE)"
              className="flex-1"
            />
            <Select value={cert.status || "pending"} onValueChange={(v) => update(i, { status: v })}>
              <SelectTrigger className="w-[150px] shrink-0">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CERT_STATUS_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => remove(i)}
              className="shrink-0 text-muted-foreground hover:text-destructive"
              aria-label="Remove certificate"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        ))
      )}
      <Button type="button" variant="outline" size="sm" onClick={add} className="gap-1">
        <Plus className="h-3.5 w-3.5" /> Add certificate
      </Button>
    </div>
  );
}
