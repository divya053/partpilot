import { useEffect, useMemo, useState } from "react";

// ─── Multi-select hook ───────────────────────────────────────────────────────
// Tracks a set of selected row ids for a list. `visibleIds` is the ids currently
// on screen (so select-all toggles only what's shown / filtered).
export function useBulkSelect(visibleIds: number[]) {
  const [selected, setSelected] = useState<Set<number>>(new Set());

  // Drop ids that are no longer visible (e.g. after a filter change or reload).
  useEffect(() => {
    setSelected((prev) => {
      const vis = new Set(visibleIds);
      const next = new Set<number>();
      for (const id of prev) if (vis.has(id)) next.add(id);
      return next.size === prev.size ? prev : next;
    });
  }, [visibleIds.join(",")]); // eslint-disable-line react-hooks/exhaustive-deps

  const allOn = visibleIds.length > 0 && visibleIds.every((id) => selected.has(id));
  const someOn = visibleIds.some((id) => selected.has(id)) && !allOn;

  return {
    selected,
    count: selected.size,
    isSel: (id: number) => selected.has(id),
    toggle: (id: number) => setSelected((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; }),
    toggleAll: () => setSelected((s) => {
      const allNow = visibleIds.length > 0 && visibleIds.every((id) => s.has(id));
      return allNow ? new Set() : new Set(visibleIds);
    }),
    clear: () => setSelected(new Set()),
    allOn, someOn,
    ids: () => [...selected],
  };
}

// A tri-state header checkbox (checked / indeterminate / empty).
export function SelectAll({ allOn, someOn, onToggle }: { allOn: boolean; someOn: boolean; onToggle: () => void }) {
  return (
    <input type="checkbox" checked={allOn} ref={(el) => { if (el) el.indeterminate = someOn; }}
      onChange={onToggle} onClick={(e) => e.stopPropagation()} title="Select all" style={{ cursor: "pointer" }} />
  );
}

export type MassField = { key: string; label: string; options: { value: string; label: string }[] };

// ─── Sticky bulk action bar ──────────────────────────────────────────────────
// Shows when ≥1 row is selected: a mass-update control (pick a field → value →
// Apply) and a Delete button. Both are permission-gated by the caller.
export function BulkBar({ count, massFields, onApply, onDelete, onClear, canDelete = true }: {
  count: number;
  massFields: MassField[];
  onApply: (field: string, value: string) => Promise<void> | void;
  onDelete?: () => Promise<void> | void;
  onClear: () => void;
  canDelete?: boolean;
}) {
  const [field, setField] = useState("");
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const active = useMemo(() => massFields.find((m) => m.key === field), [massFields, field]);

  useEffect(() => { setValue(active?.options[0]?.value ?? ""); }, [field]); // eslint-disable-line react-hooks/exhaustive-deps

  const apply = async () => {
    if (!field || value === "") return;
    setBusy(true);
    try { await onApply(field, value); } finally { setBusy(false); }
  };
  const del = async () => { if (!onDelete) return; setBusy(true); try { await onDelete(); } finally { setBusy(false); } };

  return (
    <div className="flex" style={{
      alignItems: "center", gap: 10, flexWrap: "wrap", padding: "10px 14px", marginBottom: 10,
      background: "var(--green-50)", border: "1px solid var(--green)", borderRadius: 10,
    }}>
      <strong style={{ fontSize: 13 }}>{count} selected</strong>
      {massFields.length > 0 && (
        <div className="flex" style={{ gap: 6, alignItems: "center" }}>
          <span className="muted" style={{ fontSize: 12.5 }}>Set</span>
          <select className="select" style={{ width: 150, height: 32 }} value={field} onChange={(e) => setField(e.target.value)} disabled={busy}>
            <option value="">field…</option>
            {massFields.map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}
          </select>
          {active && (
            <select className="select" style={{ width: 160, height: 32 }} value={value} onChange={(e) => setValue(e.target.value)} disabled={busy}>
              {active.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          )}
          <button className="btn sm primary" onClick={apply} disabled={busy || !field}>{busy ? "Applying…" : "Apply"}</button>
        </div>
      )}
      {canDelete && onDelete && <button className="btn sm danger" onClick={del} disabled={busy}>🗑 Delete</button>}
      <button className="btn sm" onClick={onClear} disabled={busy} style={{ marginLeft: "auto" }}>Clear selection</button>
    </div>
  );
}

// ─── Inline (click-to-edit) cell ─────────────────────────────────────────────
// Shows the value; click to edit in place. Enter / blur saves, Escape cancels.
// `onSave` receives the new value and should persist it (e.g. PATCH) — errors
// are surfaced by the caller's toast; the cell reverts on failure.
export function InlineEdit({ value, type = "text", options, onSave, display }: {
  value: string;
  type?: "text" | "select";
  options?: { value: string; label: string }[];
  onSave: (v: string) => Promise<void>;
  display?: (v: string) => React.ReactNode;
}) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(value);
  const [busy, setBusy] = useState(false);
  useEffect(() => setVal(value), [value]);

  const commit = async () => {
    if (busy) return;
    if (val === value) { setEditing(false); return; }
    setBusy(true);
    try { await onSave(val); setEditing(false); }
    catch { setVal(value); setEditing(false); }
    finally { setBusy(false); }
  };

  if (!editing) {
    return (
      <span onClick={() => setEditing(true)} title="Click to edit"
        style={{ cursor: "pointer", borderBottom: "1px dashed var(--border, #ccc)", paddingBottom: 1 }}>
        {display ? display(value) : (value || <span className="muted">—</span>)}
      </span>
    );
  }
  const common = {
    autoFocus: true, disabled: busy,
    onBlur: commit,
    onKeyDown: (e: React.KeyboardEvent) => {
      if (e.key === "Enter") commit();
      if (e.key === "Escape") { setVal(value); setEditing(false); }
    },
  };
  if (type === "select") {
    return (
      <select className="select" style={{ height: 30, minWidth: 120 }} value={val}
        onChange={(e) => setVal(e.target.value)} {...common}>
        {options!.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    );
  }
  return (
    <input className="input" style={{ height: 30, minWidth: 120 }} value={val}
      onChange={(e) => setVal(e.target.value)} {...common} />
  );
}
