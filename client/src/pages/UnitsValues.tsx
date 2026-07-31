import { useEffect, useMemo, useState } from "react";
import { Layout } from "../components/Layout";
import { Modal } from "../components/Modal";
import { Field, Spinner, Empty, useConfirm } from "../components/ui";
import { api, qs } from "../lib/api";
import { useToast } from "../lib/toast";
import { useAuth } from "../lib/auth";
import { SegmentDef, SegmentValue } from "../lib/types";

type MdEntry = { model: string; text: string };
type Model = { code: string; description: string };

export default function UnitsValues() {
  const toast = useToast();
  const { can } = useAuth();
  const { confirm, node } = useConfirm();
  const [defs, setDefs] = useState<SegmentDef[]>([]);
  const [models, setModels] = useState<Model[]>([]);
  const [rows, setRows] = useState<SegmentValue[]>([]);
  const [segmentKey, setSegmentKey] = useState("all");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [editing, setEditing] = useState<any | null>(null);
  const [mdList, setMdList] = useState<MdEntry[]>([]);

  const [bulkEdit, setBulkEdit] = useState(false);
  const [edits, setEdits] = useState<Record<number, { description?: string; isActive?: boolean }>>({});

  const [matrixMode, setMatrixMode] = useState(false);
  const matrixSection = segmentKey === "all" ? (defs.find((d) => d.key !== "productModel")?.key || defs[0]?.key || "") : segmentKey;
  const openMatrix = () => { if (segmentKey === "all") setSegmentKey(matrixSection); setMatrixMode(true); };

  const [importOpen, setImportOpen] = useState(false);

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

  const openAdd = () => { setEditing({ segmentKey: segmentKey === "all" ? defs[0]?.key : segmentKey, code: "", description: "", isActive: true, sortOrder: 0 }); setMdList([]); };
  const openEdit = (r: SegmentValue) => {
    setEditing({ ...r, isActive: !!r.is_active, sortOrder: r.sort_order });
    setMdList(Object.entries(r.model_descriptions || {}).map(([model, text]) => ({ model, text: String(text) })));
  };
  const save = async () => {
    if (!editing.code?.trim()) { toast("Code is required", "error"); return; }
    const modelDescriptions: Record<string, string> = {};
    for (const e of mdList) { const m = e.model.trim(); const t = e.text.trim(); if (m && t) modelDescriptions[m] = t; }
    const payload = { segmentKey: editing.segmentKey, code: editing.code.trim(), description: editing.description, sortOrder: editing.sortOrder, isActive: editing.isActive, modelDescriptions };
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

  // Inline bulk edit
  const editVal = (id: number, patch: { description?: string; isActive?: boolean }) => setEdits((e) => ({ ...e, [id]: { ...e[id], ...patch } }));
  const dirtyCount = Object.keys(edits).length;
  const toggleBulk = () => { setBulkEdit((v) => !v); setEdits({}); };
  const saveAll = async () => {
    const ids = Object.keys(edits);
    if (!ids.length) return;
    setSaving(true);
    try {
      for (const id of ids) {
        const p = edits[Number(id)];
        const body: Record<string, unknown> = {};
        if (p.description !== undefined) body.description = p.description;
        if (p.isActive !== undefined) body.isActive = p.isActive;
        if (Object.keys(body).length) await api.patch(`/segments/values/${id}`, body);
      }
      toast(`${ids.length} value(s) updated`, "success");
      setEdits({}); setBulkEdit(false); load();
    } catch (e) { toast((e as Error).message, "error"); } finally { setSaving(false); }
  };

  const sectionCount = useMemo(() => rows.length, [rows]);

  return (
    <Layout title="Units & Values" subtitle="Manage each segment's codes, descriptions and per-model meanings."
      actions={can("write") && (matrixMode ? (
        <button className="btn danger" onClick={() => setMatrixMode(false)}>← Back to table</button>
      ) : (<>
        {bulkEdit && dirtyCount > 0 && <button className="btn primary" onClick={saveAll} disabled={saving}>{saving ? "Saving…" : `Save all (${dirtyCount})`}</button>}
        <button className={"btn" + (bulkEdit ? " danger" : "")} onClick={toggleBulk}>{bulkEdit ? "Exit bulk edit" : "✎ Bulk edit"}</button>
        {!bulkEdit && <button className="btn" onClick={() => setImportOpen(true)}>⬆ Import from Excel</button>}
        {!bulkEdit && <button className="btn" onClick={openMatrix}>▦ Per-model matrix</button>}
        {!bulkEdit && <button className="btn primary" onClick={openAdd}>+ Add Value</button>}
      </>))}>

      <div className="segctl" style={{ marginBottom: 14, maxWidth: "100%", overflowX: "auto", flexWrap: "nowrap" }}>
        <button className={segmentKey === "all" ? "on" : ""} onClick={() => setSegmentKey("all")}>All</button>
        {defs.map((d) => <button key={d.key} className={segmentKey === d.key ? "on" : ""} onClick={() => setSegmentKey(d.key)}>{d.label}</button>)}
      </div>

      {matrixMode ? (
        <MatrixEditor key={matrixSection} segmentKey={matrixSection} segLabel={label(matrixSection)} models={models} onSaved={load} />
      ) : (
        <div className="card">
          <div className="card-pad" style={{ paddingBottom: 0 }}>
            <div className="toolbar">
              <div className="search"><span className="ico">⌕</span>
                <input className="input" placeholder="Search codes or descriptions…" value={search} onChange={(e) => setSearch(e.target.value)} />
              </div>
              <span className="muted" style={{ fontSize: 12.5, marginLeft: "auto" }}>{segmentKey === "all" ? "All segments" : label(segmentKey)} · {sectionCount} value(s)</span>
            </div>
          </div>
          {loading ? <Spinner /> : rows.length === 0 ? <Empty title="No values found" sub={can("write") ? "Add or import values for this segment." : undefined} /> : (
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
                        <td>{bulkEdit
                          ? <input className="input" style={{ minWidth: 180 }} value={edits[r.id]?.description ?? r.description} onChange={(e) => editVal(r.id, { description: e.target.value })} />
                          : r.description}</td>
                        <td>
                          <div className="flex" style={{ flexWrap: "wrap", gap: 5, alignItems: "center" }}>
                            {mds.length === 0 ? <span className="muted">—</span> : (<>
                              {mds.slice(0, 3).map(([m, d]) => <span key={m} className="badge blue" title={String(d)}><b>{m}</b>&nbsp;{String(d).slice(0, 18)}{String(d).length > 18 ? "…" : ""}</span>)}
                              {mds.length > 3 && <span className="badge gray">+{mds.length - 3} more</span>}
                            </>)}
                            {bulkEdit && can("write") && <button className="btn sm" title="Edit per-model meanings" onClick={() => openEdit(r)}>✎ meanings</button>}
                          </div>
                        </td>
                        <td>{bulkEdit
                          ? <label className="flex" style={{ gap: 6 }}><input type="checkbox" checked={edits[r.id]?.isActive ?? !!r.is_active} onChange={(e) => editVal(r.id, { isActive: e.target.checked })} /> Active</label>
                          : (r.is_active ? <span className="badge green dot">Active</span> : <span className="badge gray dot">Off</span>)}</td>
                        <td>
                          <div className="actions-cell" style={{ justifyContent: "flex-end" }}>
                            {can("write") && <button className="icon-btn" title="Edit (incl. per-model meanings)" onClick={() => openEdit(r)}>✎</button>}
                            {can("delete") && <button className="icon-btn danger" title="Delete" onClick={() => remove(r)} disabled={bulkEdit}>🗑</button>}
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
      )}

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
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <Field label="Code" required><input className="input mono" value={editing.code} disabled={!!editing.id} onChange={(e) => setEditing({ ...editing, code: e.target.value })} /></Field>
              <Field label="Sort Order"><input className="input" type="number" value={editing.sortOrder} onChange={(e) => setEditing({ ...editing, sortOrder: Number(e.target.value) })} /></Field>
            </div>
            <Field label="Default description" required hint="Used when no model-specific meaning is set below">
              <input className="input" value={editing.description} onChange={(e) => setEditing({ ...editing, description: e.target.value })} />
            </Field>
            <label className="flex" style={{ gap: 8 }}><input type="checkbox" checked={editing.isActive} onChange={(e) => setEditing({ ...editing, isActive: e.target.checked })} /> Active</label>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, display: "block", marginBottom: 4 }}>Meaning per product model <span className="muted" style={{ fontWeight: 400 }}>(optional)</span></label>
              {mdList.map((e, i) => (
                <div className="flex" key={i} style={{ gap: 8, marginBottom: 6 }}>
                  <select className="select" style={{ width: 190, flexShrink: 0 }} value={e.model} onChange={(ev) => setMd(i, { model: ev.target.value })}>
                    <option value="">Select model…</option>
                    {models.map((m) => <option key={m.code} value={m.code}>{m.code} — {m.description}</option>)}
                  </select>
                  <input className="input" style={{ flex: 1 }} placeholder="e.g. Version 1 / 2 inch / 60 LEDs" value={e.text} onChange={(ev) => setMd(i, { text: ev.target.value })} />
                  <button className="icon-btn danger" onClick={() => delMd(i)}>🗑</button>
                </div>
              ))}
              <button className="btn sm" style={{ marginTop: 4 }} onClick={addMd}>+ Add model meaning</button>
            </div>
          </div>
        </Modal>
      )}

      {importOpen && <ExcelImporter defs={defs} models={models} onClose={() => setImportOpen(false)} onDone={() => { setImportOpen(false); load(); }} />}
      {node}
    </Layout>
  );
}

// ─── Excel import: one sheet per segment, or single sheet with column mapping ──
type Target = "ignore" | "segment" | "code" | "description" | `model:${string}`;
type ParsedSheet = { name: string; headers: string[]; rows: string[][] };
type VRow = { segmentKey: string; code: string; description: string; modelDescriptions: Record<string, string> };
const sanitizeSheet = (s: string) => s.replace(/[\\/?*[\]:]/g, "-").replace(/\s+/g, " ").trim().slice(0, 31);

function ExcelImporter({ defs, models, onClose, onDone }: { defs: SegmentDef[]; models: Model[]; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const [fileName, setFileName] = useState("");
  const [sheets, setSheets] = useState<ParsedSheet[]>([]);
  const [perSheet, setPerSheet] = useState(true);       // one segment per sheet
  const [sheetName, setSheetName] = useState("");         // active sheet in single mode
  const [map, setMap] = useState<Record<number, Target>>({});
  const [defaultSeg, setDefaultSeg] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ updated: number; created: number; withModels: number; errors: { row: number; error: string }[] } | null>(null);

  const norm = (s: unknown) => String(s ?? "").replace(/\s+/g, " ").trim().toLowerCase();
  const resolveSegByName = (name: string) => { const n = norm(name); const d = defs.find((x) => norm(x.label) === n || x.key.toLowerCase() === n || norm(sanitizeSheet(x.label)) === n); return d?.key || null; };
  const resolveSegByCell = (cell: string) => { const n = norm(cell); const d = defs.find((x) => norm(x.label) === n || x.key.toLowerCase() === n); return d?.key || null; };

  const computeMap = (hdrs: string[]) => {
    const m: Record<number, Target> = {};
    hdrs.forEach((h, i) => {
      const n = norm(h);
      if (!n) { m[i] = "ignore"; return; }
      if (/(^|\b)code\b/.test(n)) { m[i] = "code"; return; }
      if (/(desc|description|meaning|default)/.test(n)) { m[i] = "description"; return; }
      if (/(section|segment|attribute|part number section)/.test(n)) { m[i] = "segment"; return; }
      const model = models.find((mo) => norm(mo.description) === n || norm(mo.code) === n || (mo.description && n.includes(norm(mo.description))));
      if (model) { m[i] = `model:${model.code}`; return; }
      m[i] = "ignore";
    });
    return m;
  };

  const onFile = async (file?: File | null) => {
    if (!file) return;
    setResult(null);
    try {
      const XLSX = await import("xlsx");
      const wb = XLSX.read(await file.arrayBuffer(), { type: "array" });
      const parsed: ParsedSheet[] = wb.SheetNames.map((name: string) => {
        const grid = XLSX.utils.sheet_to_json<any[]>(wb.Sheets[name], { header: 1, raw: false, defval: "", blankrows: false });
        return { name, headers: (grid[0] || []).map((c: any) => String(c).trim()), rows: grid.slice(1) as string[][] };
      });
      setSheets(parsed); setFileName(file.name);
      const matching = parsed.filter((s) => resolveSegByName(s.name)).length;
      setPerSheet(matching >= 2 && matching >= parsed.length - 1);
      const pref = parsed.find((s) => norm(s.name).includes("value description")) || parsed[0];
      if (pref) { setSheetName(pref.name); setMap(computeMap(pref.headers)); setDefaultSeg(resolveSegByName(pref.name) || defs.find((d) => d.key !== "productModel")?.key || ""); }
    } catch { toast("Could not read that file. Use .xlsx or .csv.", "error"); }
  };

  // Template: one sheet per segment (Code · Description + a column per model).
  const downloadTemplate = async () => {
    try {
      const all = await api.get<SegmentValue[]>("/segments/values" + qs({ segmentKey: "all" }));
      const XLSX = await import("xlsx");
      const byKey: Record<string, SegmentValue[]> = {};
      for (const v of all) (byKey[v.segment_key] ||= []).push(v);
      const modelHeaders = models.map((m) => m.description || m.code);
      const wb = XLSX.utils.book_new();
      const used = new Set<string>();
      for (const d of defs) {
        const vals = byKey[d.key] || [];
        if (!vals.length) continue;
        // Product Model is the models themselves — just Code + Description, no per-model columns.
        const isModelSeg = d.key === "productModel";
        const data = vals.map((v) => {
          const row: Record<string, string> = { Code: v.code, Description: v.description || "" };
          if (!isModelSeg) models.forEach((m) => { row[m.description || m.code] = (v.model_descriptions && v.model_descriptions[m.code]) || ""; });
          return row;
        });
        let name = sanitizeSheet(d.label) || d.key, n = 2;
        while (used.has(name.toLowerCase())) { name = `${sanitizeSheet(d.label).slice(0, 28)} ${n}`; n++; }
        used.add(name.toLowerCase());
        const header = isModelSeg ? ["Code", "Description"] : ["Code", "Description", ...modelHeaders];
        const ws = XLSX.utils.json_to_sheet(data, { header });
        ws["!cols"] = isModelSeg ? [{ wch: 12 }, { wch: 42 }] : [{ wch: 12 }, { wch: 42 }, ...modelHeaders.map(() => ({ wch: 22 }))];
        XLSX.utils.book_append_sheet(wb, ws, name);
      }
      if (!wb.SheetNames.length) { toast("No values to export yet.", "error"); return; }
      XLSX.writeFile(wb, "partpilot-values-template.xlsx");
      toast("Template downloaded — one sheet per segment", "success");
    } catch (e) { toast((e as Error).message, "error"); }
  };

  const buildFromSheet = (sheet: ParsedSheet, m: Record<number, Target>, defSeg: string, useSegCol: boolean): VRow[] => {
    const segCol = useSegCol ? Object.entries(m).find(([, t]) => t === "segment")?.[0] : undefined;
    const codeCol = Object.entries(m).find(([, t]) => t === "code")?.[0];
    const descCol = Object.entries(m).find(([, t]) => t === "description")?.[0];
    const modelCols = Object.entries(m).filter(([, t]) => t.startsWith("model:")).map(([i, t]) => ({ idx: Number(i), model: (t as string).slice(6) }));
    const out: VRow[] = []; let carry = "";
    for (const row of sheet.rows) {
      let seg = defSeg;
      if (segCol !== undefined) { const cell = String(row[Number(segCol)] ?? "").trim(); if (cell) { const k = resolveSegByCell(cell); if (k) carry = k; } seg = carry || defSeg; }
      const code = codeCol !== undefined ? String(row[Number(codeCol)] ?? "").trim() : "";
      if (!seg || !code) continue;
      const description = descCol !== undefined ? String(row[Number(descCol)] ?? "").trim() : "";
      const md: Record<string, string> = {};
      for (const mc of modelCols) { const v = String(row[mc.idx] ?? "").trim(); if (v) md[mc.model] = v; }
      out.push({ segmentKey: seg, code, description, modelDescriptions: md });
    }
    return out;
  };

  const cur = sheets.find((s) => s.name === sheetName);
  const perSheetInfo = useMemo(() => sheets.map((s) => {
    const seg = resolveSegByName(s.name);
    const rows = seg ? buildFromSheet(s, computeMap(s.headers), seg, false) : [];
    return { name: s.name, seg, count: rows.length, rows };
  }), [sheets]); // eslint-disable-line react-hooks/exhaustive-deps
  const builtSingle = useMemo(() => (cur ? buildFromSheet(cur, map, defaultSeg, true) : []), [cur, map, defaultSeg]); // eslint-disable-line react-hooks/exhaustive-deps

  const built = perSheet ? perSheetInfo.flatMap((p) => p.rows) : builtSingle;
  const withModels = built.filter((r) => Object.keys(r.modelDescriptions).length).length;
  const canImport = built.length > 0;

  const runImport = async () => {
    if (!canImport) { toast("Nothing to import — check your sheet/column mapping.", "error"); return; }
    setBusy(true); setResult(null);
    try {
      const res = await api.post<typeof result>("/segments/import-value-descriptions", { rows: built });
      setResult(res);
      toast(`${res!.updated} updated · ${res!.created} added · ${res!.withModels} with model meanings`, "success");
    } catch (e) { toast((e as Error).message, "error"); } finally { setBusy(false); }
  };
  const setCol = (i: number, t: Target) => setMap((m) => ({ ...m, [i]: t }));

  return (
    <Modal title="Import from Excel" onClose={onClose}
      footer={<>
        <button className="btn" onClick={onClose}>Close</button>
        <button className="btn primary" onClick={runImport} disabled={busy || !canImport}>{busy ? "Importing…" : `Import ${built.length} value(s)`}</button>
      </>}>
      <div className="grid" style={{ gap: 14 }}>
        <div className="insight info">
          <div className="t">How it works</div>
          <div className="d">Download the template (one tab per segment), fill in the model columns, and re-upload — every tab imports to its segment automatically. Or upload any sheet and map its columns yourself. Existing codes are updated, new ones added.</div>
        </div>

        <div className="flex" style={{ gap: 8, flexWrap: "wrap" }}>
          <label className="btn primary" style={{ cursor: "pointer" }}>⬆ Choose file (.xlsx / .csv)
            <input type="file" accept=".xlsx,.xls,.csv" style={{ display: "none" }} onChange={(e) => { void onFile(e.target.files?.[0]); e.currentTarget.value = ""; }} />
          </label>
          <button className="btn" onClick={downloadTemplate}>⬇ Download template</button>
        </div>

        {sheets.length > 0 && (<>
          <div className="flex" style={{ gap: 12, flexWrap: "wrap", alignItems: "center" }}>
            <span className="muted" style={{ fontSize: 12.5 }}><b>{fileName}</b> · {sheets.length} sheet(s)</span>
            {sheets.length > 1 && (
              <label className="flex" style={{ gap: 6, fontSize: 12.5 }}>
                <input type="checkbox" checked={perSheet} onChange={(e) => setPerSheet(e.target.checked)} /> One segment per sheet (import all tabs)
              </label>
            )}
          </div>

          {perSheet ? (
            <div className="table-wrap" style={{ maxHeight: 320, overflowY: "auto" }}>
              <table className="tbl">
                <thead><tr><th>Sheet</th><th>Segment</th><th style={{ textAlign: "right" }}>Values</th></tr></thead>
                <tbody>
                  {perSheetInfo.map((p) => (
                    <tr key={p.name}>
                      <td style={{ fontWeight: 600 }}>{p.name}</td>
                      <td>{p.seg ? <span className="badge green">{label(p.seg, defs)}</span> : <span className="badge amber">not matched — skipped</span>}</td>
                      <td style={{ textAlign: "right" }} className="muted">{p.count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (<>
            <div className="flex" style={{ gap: 12, flexWrap: "wrap" }}>
              {sheets.length > 1 && (
                <label className="flex" style={{ gap: 6, fontSize: 12.5 }}>Sheet:
                  <select className="select" style={{ width: 200 }} value={sheetName} onChange={(e) => { setSheetName(e.target.value); const s = sheets.find((x) => x.name === e.target.value); if (s) { setMap(computeMap(s.headers)); setDefaultSeg(resolveSegByName(s.name) || defaultSeg); } }}>
                    {sheets.map((s) => <option key={s.name} value={s.name}>{s.name}</option>)}
                  </select>
                </label>
              )}
              <label className="flex" style={{ gap: 6, fontSize: 12.5 }}>Default segment:
                <select className="select" style={{ width: 200 }} value={defaultSeg} onChange={(e) => setDefaultSeg(e.target.value)}>
                  <option value="">— none —</option>
                  {defs.map((d) => <option key={d.key} value={d.key}>{d.label}</option>)}
                </select>
              </label>
            </div>
            {cur && (
              <div className="table-wrap" style={{ maxHeight: 300, overflowY: "auto" }}>
                <table className="tbl">
                  <thead><tr><th>Column</th><th>Sample</th><th>Maps to</th></tr></thead>
                  <tbody>
                    {cur.headers.map((h, i) => (
                      <tr key={i}>
                        <td style={{ fontWeight: 600 }}>{h || <span className="muted">(blank)</span>}</td>
                        <td className="muted" style={{ maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{String(cur.rows.find((r) => String(r[i] ?? "").trim())?.[i] ?? "")}</td>
                        <td>
                          <select className="select" value={map[i] || "ignore"} onChange={(e) => setCol(i, e.target.value as Target)}>
                            <option value="ignore">Ignore</option>
                            <option value="segment">Segment (section)</option>
                            <option value="code">Code</option>
                            <option value="description">Description</option>
                            <optgroup label="Product-model meaning">
                              {models.map((m) => <option key={m.code} value={`model:${m.code}`}>{m.code} — {m.description}</option>)}
                            </optgroup>
                          </select>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>)}

          <div className={"insight " + (canImport ? "success" : "warning")}>
            <div className="d">{canImport ? <><b>{built.length}</b> value(s) ready — <b>{withModels}</b> with per-model meanings.</> : "Nothing mapped yet — pick a Code column (single-sheet) or make sure sheet names match segments."}</div>
          </div>
        </>)}

        {result && (
          <div className="insight success"><div className="t">Import complete</div>
            <div className="d">{result.updated} updated · {result.created} added · {result.withModels} with model meanings{result.errors.length ? ` · ${result.errors.length} error(s)` : ""}</div>
          </div>
        )}
      </div>
    </Modal>
  );
}
function label(k: string, defs: SegmentDef[]) { return defs.find((d) => d.key === k)?.label || k; }

// ─── Spreadsheet-style per-model matrix: codes (rows) × product models (cols) ──
function MatrixEditor({ segmentKey, segLabel, models, onSaved }: { segmentKey: string; segLabel: string; models: Model[]; onSaved: () => void }) {
  const toast = useToast();
  const [vals, setVals] = useState<SegmentValue[]>([]);
  const [grid, setGrid] = useState<Record<number, Record<string, string>>>({});
  const [dirty, setDirty] = useState<Set<number>>(new Set());
  const [cols, setCols] = useState<string[]>(models.map((m) => m.code));
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => { setCols(models.map((m) => m.code)); }, [models]);
  useEffect(() => {
    setLoading(true);
    api.get<SegmentValue[]>("/segments/values" + qs({ segmentKey }))
      .then((r) => { setVals(r); const g: Record<number, Record<string, string>> = {}; for (const v of r) g[v.id] = { ...(v.model_descriptions || {}) }; setGrid(g); setDirty(new Set()); })
      .catch((e) => toast(e.message, "error")).finally(() => setLoading(false));
  }, [segmentKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const setCell = (id: number, model: string, text: string) => { setGrid((g) => ({ ...g, [id]: { ...g[id], [model]: text } })); setDirty((d) => new Set(d).add(id)); };
  const saveAll = async () => {
    const ids = [...dirty];
    if (!ids.length) return;
    setSaving(true);
    try {
      for (const id of ids) {
        const md: Record<string, string> = {};
        for (const [m, t] of Object.entries(grid[id] || {})) if (t && t.trim()) md[m] = t.trim();
        await api.patch(`/segments/values/${id}`, { modelDescriptions: md });
      }
      toast(`${ids.length} value(s) updated`, "success"); setDirty(new Set()); onSaved();
    } catch (e) { toast((e as Error).message, "error"); } finally { setSaving(false); }
  };
  const shownModels = models.filter((m) => cols.includes(m.code));

  return (
    <div className="card">
      <div className="card-head" style={{ flexWrap: "wrap", gap: 10 }}>
        <div><h3>Per-model meanings — {segLabel}</h3><div className="sub">Fill a cell with what the code means for that model. Empty = use the default description.</div></div>
        <button className="btn primary" style={{ marginLeft: "auto" }} onClick={saveAll} disabled={saving || dirty.size === 0}>{saving ? "Saving…" : `Save all (${dirty.size})`}</button>
      </div>
      <div className="card-pad" style={{ paddingBottom: 8 }}>
        <div className="muted" style={{ fontSize: 12, marginBottom: 6 }}>Show model columns:</div>
        <div className="flex" style={{ flexWrap: "wrap", gap: 6 }}>
          <button className="btn sm" onClick={() => setCols(models.map((m) => m.code))}>All</button>
          <button className="btn sm" onClick={() => setCols([])}>None</button>
          {models.map((m) => (
            <label key={m.code} className={"badge " + (cols.includes(m.code) ? "green" : "gray")} style={{ cursor: "pointer", gap: 5 }} title={m.description}>
              <input type="checkbox" checked={cols.includes(m.code)} onChange={(e) => setCols((c) => e.target.checked ? [...c, m.code] : c.filter((x) => x !== m.code))} />{m.code}
            </label>
          ))}
        </div>
      </div>
      {loading ? <Spinner /> : vals.length === 0 ? <Empty title="No codes in this segment yet" /> : shownModels.length === 0 ? (
        <div className="card-pad muted">Select at least one model column above.</div>
      ) : (
        <div className="table-wrap">
          <table className="tbl">
            <thead><tr>
              <th style={{ position: "sticky", left: 0, background: "#fbfcfd", zIndex: 2 }}>Code</th>
              <th style={{ position: "sticky", left: 60, background: "#fbfcfd", zIndex: 2, minWidth: 140 }}>Default</th>
              {shownModels.map((m) => (
                <th key={m.code} title={`${m.code} — ${m.description}`} style={{ minWidth: 130, verticalAlign: "bottom" }}>
                  <div style={{ fontWeight: 700, whiteSpace: "normal", lineHeight: 1.25 }}>{m.description || m.code}</div>
                  <div className="mono muted" style={{ fontSize: 10, fontWeight: 400 }}>{m.code}</div>
                </th>
              ))}
            </tr></thead>
            <tbody>
              {vals.map((v) => (
                <tr key={v.id}>
                  <td className="mono" style={{ position: "sticky", left: 0, background: "#fff", fontWeight: 700, zIndex: 1 }}>{v.code}</td>
                  <td className="muted" style={{ position: "sticky", left: 60, background: "#fff", zIndex: 1, maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={v.description}>{v.description}</td>
                  {shownModels.map((m) => (
                    <td key={m.code} style={{ padding: 4 }}>
                      <input className="input" style={{ minWidth: 120, padding: "6px 8px" }} value={grid[v.id]?.[m.code] ?? ""} onChange={(e) => setCell(v.id, m.code, e.target.value)} placeholder="—" />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
