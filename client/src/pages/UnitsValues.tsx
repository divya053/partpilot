import { useEffect, useMemo, useState } from "react";
import { Layout } from "../components/Layout";
import { Modal } from "../components/Modal";
import { Field, Spinner, Empty, useConfirm } from "../components/ui";
import { api, qs } from "../lib/api";
import { useToast } from "../lib/toast";
import { useAuth } from "../lib/auth";
import { SegmentDef, SegmentValue } from "../lib/types";

type BulkRow = { segmentKey: string; code: string; description: string };
type BulkResult = { updated: number; skipped: number; errors: { row: number; error: string }[] };
type MdEntry = { model: string; text: string };

function pick(obj: Record<string, unknown>, ...aliases: string[]): string {
  for (const alias of aliases) {
    for (const key of Object.keys(obj)) {
      if (key.trim().toLowerCase() === alias.toLowerCase()) return String(obj[key] ?? "");
    }
  }
  return "";
}

export default function UnitsValues() {
  const toast = useToast();
  const { can } = useAuth();
  const { confirm, node } = useConfirm();
  const [defs, setDefs] = useState<SegmentDef[]>([]);
  const [models, setModels] = useState<{ code: string; description: string }[]>([]);
  const [rows, setRows] = useState<SegmentValue[]>([]);
  const [segmentKey, setSegmentKey] = useState("all");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Edit/Add form (+ the per-model "meanings" the dependency needs)
  const [editing, setEditing] = useState<any | null>(null);
  const [mdList, setMdList] = useState<MdEntry[]>([]);

  // Simple description-only bulk (download current → edit → re-upload)
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkRows, setBulkRows] = useState<BulkRow[]>([]);
  const [bulkFile, setBulkFile] = useState("");
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkResult, setBulkResult] = useState<BulkResult | null>(null);

  useEffect(() => {
    api.get<{ all: SegmentDef[] }>("/segments/meta").then((m) => setDefs(m.all)).catch(() => {});
    api.get<SegmentValue[]>("/segments/values" + qs({ segmentKey: "productModel" }))
      .then((r) => setModels(r.map((v) => ({ code: v.code, description: v.description })))).catch(() => {});
  }, []);

  const load = () => {
    setLoading(true);
    api.get<SegmentValue[]>("/segments/values" + qs({ segmentKey, search }))
      .then(setRows).catch((e) => toast(e.message, "error")).finally(() => setLoading(false));
  };
  useEffect(() => { const t = setTimeout(load, 200); return () => clearTimeout(t); }, [segmentKey, search]);

  const label = (k: string) => defs.find((d) => d.key === k)?.label || k;
  const modelLabel = (code: string) => { const m = models.find((x) => x.code === code); return m ? `${m.code} — ${m.description}` : code; };

  // ─── Add / edit a value (with per-model meanings) ─────────────────────────
  const openAdd = () => {
    setEditing({ segmentKey: segmentKey === "all" ? defs[0]?.key : segmentKey, code: "", description: "", isActive: true, sortOrder: 0 });
    setMdList([]);
  };
  const openEdit = (r: SegmentValue) => {
    setEditing({ ...r, isActive: !!r.is_active, sortOrder: r.sort_order });
    setMdList(Object.entries(r.model_descriptions || {}).map(([model, text]) => ({ model, text: String(text) })));
  };
  const save = async () => {
    if (!editing.code?.trim()) { toast("Code is required", "error"); return; }
    const modelDescriptions: Record<string, string> = {};
    for (const e of mdList) { const m = e.model.trim(); const t = e.text.trim(); if (m && t) modelDescriptions[m] = t; }
    const payload = {
      segmentKey: editing.segmentKey, code: editing.code.trim(), description: editing.description,
      sortOrder: editing.sortOrder, isActive: editing.isActive, modelDescriptions,
    };
    setSaving(true);
    try {
      if (editing.id) { await api.patch(`/segments/values/${editing.id}`, payload); toast("Value updated", "success"); }
      else { await api.post("/segments/values", payload); toast("Value added", "success"); }
      setEditing(null); load();
    } catch (e) { toast((e as Error).message, "error"); } finally { setSaving(false); }
  };
  const remove = async (r: SegmentValue) => {
    if (!(await confirm(`Delete value "${r.code}"?`))) return;
    try { await api.del(`/segments/values/${r.id}`); toast("Deleted", "success"); load(); }
    catch (e) { toast((e as Error).message, "error"); }
  };

  const addMd = () => setMdList((l) => [...l, { model: "", text: "" }]);
  const setMd = (i: number, patch: Partial<MdEntry>) => setMdList((l) => l.map((e, idx) => (idx === i ? { ...e, ...patch } : e)));
  const delMd = (i: number) => setMdList((l) => l.filter((_, idx) => idx !== i));

  // ─── Description-only bulk ────────────────────────────────────────────────
  const openBulk = () => { setBulkRows([]); setBulkFile(""); setBulkResult(null); setBulkOpen(true); };
  const downloadTemplate = async () => {
    try {
      const all = await api.get<SegmentValue[]>("/segments/values" + qs({ segmentKey: "all" }));
      const data = all.map((r) => ({ "Segment Key": r.segment_key, "Segment": label(r.segment_key), "Code": r.code, "Description": r.description ?? "" }));
      const XLSX = await import("xlsx");
      const ws = XLSX.utils.json_to_sheet(data);
      ws["!cols"] = [{ wch: 18 }, { wch: 22 }, { wch: 12 }, { wch: 52 }];
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Descriptions");
      XLSX.writeFile(wb, "units-values-descriptions.xlsx");
      toast(`Template with ${data.length} rows downloaded`, "success");
    } catch (e) { toast((e as Error).message, "error"); }
  };
  const onBulkFile = async (file?: File | null) => {
    if (!file) return;
    setBulkResult(null);
    try {
      const XLSX = await import("xlsx");
      const isCsv = /\.csv$/i.test(file.name);
      const wb = isCsv ? XLSX.read(await file.text(), { type: "string" }) : XLSX.read(await file.arrayBuffer(), { type: "array" });
      const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[wb.SheetNames[0]], { defval: "" });
      const parsed: BulkRow[] = json.map((o) => ({
        segmentKey: pick(o, "Segment Key", "segmentKey", "segment_key").trim(),
        code: pick(o, "Code", "code").trim(),
        description: pick(o, "Description", "description"),
      })).filter((r) => r.segmentKey && r.code);
      if (!parsed.length) { toast("No valid rows found. Keep the template's header row.", "error"); return; }
      setBulkRows(parsed); setBulkFile(file.name);
    } catch { toast("Could not read that file. Upload the .xlsx (or .csv) template.", "error"); }
  };
  const runBulk = async () => {
    if (!bulkRows.length) return;
    setBulkBusy(true); setBulkResult(null);
    try {
      const res = await api.post<BulkResult>("/segments/values/bulk", { rows: bulkRows });
      setBulkResult(res); toast(`${res.updated} description(s) updated`, "success"); load();
    } catch (e) { toast((e as Error).message, "error"); } finally { setBulkBusy(false); }
  };

  const sectionCount = useMemo(() => rows.length, [rows]);

  return (
    <Layout title="Units & Values" subtitle="Manage each segment's codes, descriptions and per-model meanings."
      actions={can("write") && <>
        <button className="btn" onClick={openBulk}>Bulk Descriptions</button>
        <button className="btn primary" onClick={openAdd}>+ Add Value</button>
      </>}>

      {/* Section tabs — pick a segment to manage its values */}
      <div className="segctl" style={{ marginBottom: 14, maxWidth: "100%", overflowX: "auto", flexWrap: "nowrap" }}>
        <button className={segmentKey === "all" ? "on" : ""} onClick={() => setSegmentKey("all")}>All</button>
        {defs.map((d) => <button key={d.key} className={segmentKey === d.key ? "on" : ""} onClick={() => setSegmentKey(d.key)}>{d.label}</button>)}
      </div>

      <div className="card">
        <div className="card-pad" style={{ paddingBottom: 0 }}>
          <div className="toolbar">
            <div className="search"><span className="ico">⌕</span>
              <input className="input" placeholder="Search codes or descriptions…" value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            <span className="muted" style={{ fontSize: 12.5, marginLeft: "auto" }}>
              {segmentKey === "all" ? "All segments" : label(segmentKey)} · {sectionCount} value(s)
            </span>
          </div>
        </div>
        {loading ? <Spinner /> : rows.length === 0 ? <Empty title="No values found" sub={can("write") ? "Add the first value for this segment." : undefined} /> : (
          <div className="table-wrap">
            <table className="tbl">
              <thead><tr><th>Segment</th><th>Code</th><th>Description</th><th>Per-model meanings</th><th>Active</th><th style={{ textAlign: "right" }}>Actions</th></tr></thead>
              <tbody>
                {rows.map((r) => {
                  const mds = Object.entries(r.model_descriptions || {});
                  return (
                    <tr key={r.id}>
                      <td><span className="badge gray">{label(r.segment_key)}</span></td>
                      <td><span className="mono" style={{ fontWeight: 600 }}>{r.code}</span></td>
                      <td>{r.description}</td>
                      <td>
                        {mds.length === 0 ? <span className="muted">—</span> : (
                          <div className="flex" style={{ flexWrap: "wrap", gap: 5 }}>
                            {mds.slice(0, 3).map(([m, d]) => (
                              <span key={m} className="badge blue" title={String(d)}><b>{m}</b>&nbsp;{String(d).slice(0, 18)}{String(d).length > 18 ? "…" : ""}</span>
                            ))}
                            {mds.length > 3 && <span className="badge gray">+{mds.length - 3} more</span>}
                          </div>
                        )}
                      </td>
                      <td>{r.is_active ? <span className="badge green dot">Active</span> : <span className="badge gray dot">Off</span>}</td>
                      <td>
                        <div className="actions-cell" style={{ justifyContent: "flex-end" }}>
                          {can("write") && <button className="icon-btn" title="Edit" onClick={() => openEdit(r)}>✎</button>}
                          {can("delete") && <button className="icon-btn danger" title="Delete" onClick={() => remove(r)}>🗑</button>}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add / Edit modal with per-model dependency editor */}
      {editing && (
        <Modal title={editing.id ? `Edit ${label(editing.segmentKey)} value` : `New ${label(editing.segmentKey)} value`} onClose={() => setEditing(null)}
          footer={<><button className="btn" onClick={() => setEditing(null)}>Cancel</button><button className="btn primary" onClick={save} disabled={saving}>{saving ? "Saving…" : "Save"}</button></>}>
          <div className="grid" style={{ gap: 14 }}>
            <Field label="Segment" required>
              <select className="select" value={editing.segmentKey} disabled={!!editing.id} onChange={(e) => setEditing({ ...editing, segmentKey: e.target.value })}>
                {defs.map((d) => <option key={d.key} value={d.key}>{d.label}</option>)}
              </select>
            </Field>
            <div className="grid g2" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <Field label="Code" required hint="Appears in the part number">
                <input className="input mono" value={editing.code} disabled={!!editing.id} onChange={(e) => setEditing({ ...editing, code: e.target.value })} />
              </Field>
              <Field label="Sort Order"><input className="input" type="number" value={editing.sortOrder} onChange={(e) => setEditing({ ...editing, sortOrder: Number(e.target.value) })} /></Field>
            </div>
            <Field label="Default description" required hint="Used when no model-specific meaning is set below">
              <input className="input" value={editing.description} onChange={(e) => setEditing({ ...editing, description: e.target.value })} placeholder="e.g. Medium Voltage (120-277V)" />
            </Field>
            <label className="flex" style={{ gap: 8 }}><input type="checkbox" checked={editing.isActive} onChange={(e) => setEditing({ ...editing, isActive: e.target.checked })} /> Active (available in the builder)</label>

            {/* Dependency: what this code means for specific product models */}
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, display: "block", marginBottom: 4 }}>Meaning per product model <span className="muted" style={{ fontWeight: 400 }}>(optional dependency)</span></label>
              <div className="muted" style={{ fontSize: 12, marginBottom: 8 }}>
                Same code, different meaning per model — e.g. for one model it's <b>Version 1</b>, for another it's a size like <b>2 inch</b> or <b>60 LEDs</b>. Leave empty to use the default description for every model.
              </div>
              {mdList.map((e, i) => (
                <div className="flex" key={i} style={{ gap: 8, marginBottom: 6 }}>
                  <select className="select" style={{ width: 190, flexShrink: 0 }} value={e.model} onChange={(ev) => setMd(i, { model: ev.target.value })}>
                    <option value="">Select model…</option>
                    {models.map((m) => <option key={m.code} value={m.code}>{m.code} — {m.description}</option>)}
                  </select>
                  <input className="input" style={{ flex: 1 }} placeholder="Meaning for this model — e.g. Version 1 / 2 inch / 60 LEDs" value={e.text} onChange={(ev) => setMd(i, { text: ev.target.value })} />
                  <button className="icon-btn danger" title="Remove" onClick={() => delMd(i)}>🗑</button>
                </div>
              ))}
              <button className="btn sm" style={{ marginTop: 4 }} onClick={addMd}>+ Add model meaning</button>
            </div>
          </div>
        </Modal>
      )}

      {/* Description-only bulk */}
      {bulkOpen && (
        <Modal title="Bulk Update Descriptions" onClose={() => setBulkOpen(false)}
          footer={<><button className="btn" onClick={() => setBulkOpen(false)}>Close</button>
            <button className="btn primary" onClick={runBulk} disabled={bulkBusy || bulkRows.length === 0}>{bulkBusy ? "Saving…" : `Update ${bulkRows.length || ""} description(s)`}</button></>}>
          <div className="grid" style={{ gap: 12 }}>
            <div className="insight info">
              <div className="t">Description-only, in bulk</div>
              <div className="d">Download the template (current data), edit only the <span className="mono">Description</span> column in Excel, and upload. Matched by Segment&nbsp;+&nbsp;Code. For per-model meanings, edit a value directly.</div>
            </div>
            <div className="flex" style={{ gap: 8 }}>
              <button className="btn" onClick={downloadTemplate}>⬇ Download template</button>
              <label className="btn primary" style={{ cursor: "pointer" }}>⬆ Upload edited sheet
                <input type="file" accept=".xlsx,.xls,.csv" style={{ display: "none" }} onChange={(e) => { void onBulkFile(e.target.files?.[0]); e.currentTarget.value = ""; }} />
              </label>
            </div>
            {bulkFile && <div className="muted" style={{ fontSize: 12.5 }}><b>{bulkFile}</b> — {bulkRows.length} row(s) ready.</div>}
            {bulkResult && (
              <div className="insight success"><div className="t">Done</div>
                <div className="d">{bulkResult.updated} updated · {bulkResult.skipped} unchanged{bulkResult.errors.length ? ` · ${bulkResult.errors.length} error(s)` : ""}</div>
              </div>
            )}
          </div>
        </Modal>
      )}
      {node}
    </Layout>
  );
}
