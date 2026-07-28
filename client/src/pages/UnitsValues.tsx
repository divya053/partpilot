import { useEffect, useState } from "react";
import { Layout } from "../components/Layout";
import { Modal } from "../components/Modal";
import { Field, Spinner, Empty, useConfirm } from "../components/ui";
import { api, qs } from "../lib/api";
import { useToast } from "../lib/toast";
import { useAuth } from "../lib/auth";
import { SegmentDef, SegmentValue } from "../lib/types";

type BulkRow = { segmentKey: string; code: string; description: string };
type BulkResult = { updated: number; skipped: number; errors: { row: number; error: string }[] };
type VdRow = { segmentKey: string; code: string; description: string; modelDescriptions: Record<string, string> };

// Maps the "Part Number Sections" labels in the Value Descriptions sheet to our
// segment keys (whitespace/case-insensitive; includes the sheet's typos).
const SECTION_TO_KEY: Record<string, string> = {
  "product model": "productModel",
  "genreration/series/varient type": "versionVariant",
  "generation/series/variant type": "versionVariant",
  "size variant": "sizeVariant",
  "selectable/fixed power": "powerType",
  "voltage range": "voltageRange",
  "dimming": "dimming",
  "light distribution": "lightDistribution",
  "driver": "driver",
  "finish": "finish",
  'lens type "l"': "lensType",
  'emergency option "x"': "emergencyOption",
  'integraetd sensor options "y"': "sensorOption",
  'integrated sensor options "y"': "sensorOption",
  'surge protection options "s"': "surgeProtection",
  'reflector cover options "r"': "reflectorCover",
  'mounting options "m"': "mountingOption",
  'photocontrol options "p"': "photocontrolOption",
  'connectable in series or not options "c"': "connectableOption",
  'base "b"': "base",
};

// Parse the "Value Descriptions" sheet into value rows + per-model meanings.
// Column A = section (carried down through the group), B = code, C = generic
// description, D+ = one product-model family per column. A filled family cell
// means that code applies to that family with that specific meaning.
async function parseValueDescriptions(file: File): Promise<VdRow[]> {
  const XLSX = await import("xlsx");
  const wb = XLSX.read(await file.arrayBuffer(), { type: "array" });
  const ws = wb.Sheets["Value Descriptions"];
  if (!ws) throw new Error('This file has no "Value Descriptions" sheet.');
  const rows = XLSX.utils.sheet_to_json<any[]>(ws, { header: 1, raw: false, defval: "", blankrows: true });
  const header = (rows[0] || []).map((c) => String(c).trim());
  const familyCols: { idx: number; name: string }[] = [];
  for (let c = 3; c < header.length; c++) if (header[c]) familyCols.push({ idx: c, name: header[c] });

  const norm = (s: unknown) => String(s ?? "").replace(/\s+/g, " ").trim().toLowerCase();

  // Which segment each row belongs to (section label carries down the group).
  const rowSection: (string | null)[] = new Array(rows.length).fill(null);
  let cur: string | null = null;
  for (let r = 1; r < rows.length; r++) {
    const a = norm(rows[r]?.[0]);
    if (a) cur = SECTION_TO_KEY[a] ?? null;
    rowSection[r] = cur;
  }

  // Map each family column → the model codes it contains (from the Product
  // Model section, where cells look like "UHB - UFO High Bay").
  const familyToModels: Record<string, Set<string>> = {};
  familyCols.forEach((f) => (familyToModels[f.name] = new Set()));
  for (let r = 1; r < rows.length; r++) {
    if (rowSection[r] !== "productModel") continue;
    for (const f of familyCols) {
      const m = String(rows[r]?.[f.idx] ?? "").trim().match(/^([A-Za-z0-9]+)\s*-/);
      if (m) familyToModels[f.name].add(m[1].toUpperCase());
    }
  }

  const out: VdRow[] = [];
  for (let r = 1; r < rows.length; r++) {
    const key = rowSection[r];
    if (!key || key === "productModel") continue; // productModel handled by seed/catalog
    const code = String(rows[r]?.[1] ?? "").trim();
    if (!code) continue;
    const generic = String(rows[r]?.[2] ?? "").trim();
    const md: Record<string, string> = {};
    for (const f of familyCols) {
      const cell = String(rows[r]?.[f.idx] ?? "").trim();
      if (!cell) continue;
      for (const mc of familyToModels[f.name] || []) if (!md[mc]) md[mc] = cell;
    }
    out.push({ segmentKey: key, code, description: generic, modelDescriptions: md });
  }
  return out;
}

// Read a header cell case/space-insensitively across the aliases we accept.
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
  const [rows, setRows] = useState<SegmentValue[]>([]);
  const [segmentKey, setSegmentKey] = useState("all");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<any | null>(null);
  const [saving, setSaving] = useState(false);

  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkRows, setBulkRows] = useState<BulkRow[]>([]);
  const [bulkFile, setBulkFile] = useState<string>("");
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkResult, setBulkResult] = useState<BulkResult | null>(null);

  // "Value Descriptions" Excel import (per-model dependency).
  const [impOpen, setImpOpen] = useState(false);
  const [impRows, setImpRows] = useState<VdRow[]>([]);
  const [impFile, setImpFile] = useState("");
  const [impBusy, setImpBusy] = useState(false);
  const [impResult, setImpResult] = useState<{ updated: number; created: number; withModels: number; errors: { row: number; error: string }[] } | null>(null);

  useEffect(() => {
    api.get<{ all: SegmentDef[] }>("/segments/meta").then((m) => setDefs(m.all)).catch(() => {});
  }, []);

  const load = () => {
    setLoading(true);
    api.get<SegmentValue[]>("/segments/values" + qs({ segmentKey, search }))
      .then(setRows).catch((e) => toast(e.message, "error")).finally(() => setLoading(false));
  };
  useEffect(() => { const t = setTimeout(load, 200); return () => clearTimeout(t); }, [segmentKey, search]);

  const label = (k: string) => defs.find((d) => d.key === k)?.label || k;

  const save = async () => {
    setSaving(true);
    try {
      if (editing.id) { await api.patch(`/segments/values/${editing.id}`, editing); toast("Value updated", "success"); }
      else { await api.post("/segments/values", editing); toast("Value added", "success"); }
      setEditing(null); load();
    } catch (e) { toast((e as Error).message, "error"); } finally { setSaving(false); }
  };
  const remove = async (r: SegmentValue) => {
    if (!(await confirm(`Delete value "${r.code}"?`))) return;
    try { await api.del(`/segments/values/${r.id}`); toast("Deleted", "success"); load(); }
    catch (e) { toast((e as Error).message, "error"); }
  };

  // ─── Bulk description update (download current data → edit in Excel → upload) ──

  const openBulk = () => { setBulkRows([]); setBulkFile(""); setBulkResult(null); setBulkOpen(true); };

  // Build the template from the CURRENT data (every segment value, all segments),
  // so the user only edits the Description column and re-uploads.
  const downloadTemplate = async () => {
    try {
      const all = await api.get<SegmentValue[]>("/segments/values" + qs({ segmentKey: "all" }));
      const data = all.map((r) => ({
        "Segment Key": r.segment_key,
        "Segment": label(r.segment_key),
        "Code": r.code,
        "Description": r.description ?? "",
      }));
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
      const wb = isCsv
        ? XLSX.read(await file.text(), { type: "string" })
        : XLSX.read(await file.arrayBuffer(), { type: "array" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: "" });
      const parsed: BulkRow[] = json
        .map((o) => ({
          segmentKey: pick(o, "Segment Key", "segmentKey", "segment_key").trim(),
          code: pick(o, "Code", "code").trim(),
          description: pick(o, "Description", "description"),
        }))
        .filter((r) => r.segmentKey && r.code);
      if (!parsed.length) { toast("No valid rows found. Keep the template's header row.", "error"); return; }
      setBulkRows(parsed);
      setBulkFile(file.name);
    } catch {
      toast("Could not read that file. Upload the .xlsx (or .csv) template.", "error");
    }
  };

  const runBulk = async () => {
    if (!bulkRows.length) return;
    setBulkBusy(true);
    setBulkResult(null);
    try {
      const res = await api.post<BulkResult>("/segments/values/bulk", { rows: bulkRows });
      setBulkResult(res);
      toast(`${res.updated} description(s) updated`, "success");
      load();
    } catch (e) { toast((e as Error).message, "error"); }
    finally { setBulkBusy(false); }
  };

  // ─── Value Descriptions Excel import (per-model) ──────────────────────────
  const openImport = () => { setImpRows([]); setImpFile(""); setImpResult(null); setImpOpen(true); };
  const onImportFile = async (file?: File | null) => {
    if (!file) return;
    setImpResult(null);
    try {
      const parsed = await parseValueDescriptions(file);
      if (!parsed.length) { toast("No value rows found on the 'Value Descriptions' sheet.", "error"); return; }
      setImpRows(parsed); setImpFile(file.name);
    } catch (e) { toast((e as Error).message, "error"); }
  };
  const runImport = async () => {
    if (!impRows.length) return;
    setImpBusy(true); setImpResult(null);
    try {
      const res = await api.post<typeof impResult>("/segments/import-value-descriptions", { rows: impRows });
      setImpResult(res);
      toast(`${res!.updated} updated · ${res!.created} added · ${res!.withModels} with per-model meanings`, "success");
      load();
    } catch (e) { toast((e as Error).message, "error"); }
    finally { setImpBusy(false); }
  };
  const impWithModels = impRows.filter((r) => Object.keys(r.modelDescriptions).length).length;

  return (
    <Layout title="Units & Values" subtitle="Manage the allowed codes and descriptions for every segment."
      actions={can("write") && <>
        <button className="btn" onClick={openImport}>⬆ Import Value Descriptions</button>
        <button className="btn" onClick={openBulk}>⬆ Bulk Descriptions</button>
        <button className="btn primary" onClick={() => setEditing({ segmentKey: segmentKey === "all" ? defs[0]?.key : segmentKey, code: "", description: "", isActive: true, sortOrder: 0 })}>+ Add Value</button>
      </>}>
      <div className="card">
        <div className="card-pad" style={{ paddingBottom: 0 }}>
          <div className="toolbar">
            <div className="search"><span className="ico">⌕</span>
              <input className="input" placeholder="Search codes or descriptions…" value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            <select className="select" style={{ width: 200 }} value={segmentKey} onChange={(e) => setSegmentKey(e.target.value)}>
              <option value="all">All Segments</option>
              {defs.map((d) => <option key={d.key} value={d.key}>{d.label}</option>)}
            </select>
          </div>
        </div>
        {loading ? <Spinner /> : rows.length === 0 ? <Empty title="No values found" /> : (
          <div className="table-wrap">
            <table className="tbl">
              <thead><tr><th>Segment</th><th>Code</th><th>Description</th><th>Used By</th><th>Active</th><th style={{ textAlign: "right" }}>Actions</th></tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td><span className="badge gray">{label(r.segment_key)}</span></td>
                    <td><span className="mono" style={{ fontWeight: 600 }}>{r.code}</span></td>
                    <td>
                      {r.description}
                      {r.model_descriptions && Object.keys(r.model_descriptions).length > 0 && (
                        <span className="badge blue" title={Object.entries(r.model_descriptions).map(([m, d]) => `${m}: ${d}`).join("\n")}
                          style={{ marginLeft: 8, cursor: "help" }}>
                          {Object.keys(r.model_descriptions).length} model meanings
                        </span>
                      )}
                    </td>
                    <td className="muted">{r.applicable_products?.length ? `${r.applicable_products.length} model(s)` : "—"}</td>
                    <td>{r.is_active ? <span className="badge green dot">Active</span> : <span className="badge gray dot">Off</span>}</td>
                    <td>
                      <div className="actions-cell" style={{ justifyContent: "flex-end" }}>
                        {can("write") && <button className="icon-btn" onClick={() => setEditing({ ...r, isActive: !!r.is_active, sortOrder: r.sort_order })}>✎</button>}
                        {can("delete") && <button className="icon-btn danger" onClick={() => remove(r)}>🗑</button>}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {editing && (
        <Modal title={editing.id ? "Edit Value" : "New Value"} onClose={() => setEditing(null)}
          footer={<><button className="btn" onClick={() => setEditing(null)}>Cancel</button><button className="btn primary" onClick={save} disabled={saving}>{saving ? "Saving…" : "Save"}</button></>}>
          <div className="grid" style={{ gap: 14 }}>
            <Field label="Segment" required>
              <select className="select" value={editing.segmentKey} disabled={!!editing.id} onChange={(e) => setEditing({ ...editing, segmentKey: e.target.value })}>
                {defs.map((d) => <option key={d.key} value={d.key}>{d.label}</option>)}
              </select>
            </Field>
            <Field label="Code" required hint="The short code that appears in the part number">
              <input className="input mono" value={editing.code} onChange={(e) => setEditing({ ...editing, code: e.target.value })} />
            </Field>
            <Field label="Description" required hint="Plain-English meaning (shown in the builder)">
              <input className="input" value={editing.description} onChange={(e) => setEditing({ ...editing, description: e.target.value })} />
            </Field>
            <Field label="Sort Order"><input className="input" type="number" value={editing.sortOrder} onChange={(e) => setEditing({ ...editing, sortOrder: Number(e.target.value) })} /></Field>
            <label className="flex" style={{ gap: 8 }}><input type="checkbox" checked={editing.isActive} onChange={(e) => setEditing({ ...editing, isActive: e.target.checked })} /> Active (available in builder)</label>
          </div>
        </Modal>
      )}

      {bulkOpen && (
        <Modal title="Bulk Update Descriptions" onClose={() => setBulkOpen(false)}
          footer={<>
            <button className="btn" onClick={() => setBulkOpen(false)}>Close</button>
            <button className="btn primary" onClick={runBulk} disabled={bulkBusy || bulkRows.length === 0}>
              {bulkBusy ? "Saving…" : `Update ${bulkRows.length || ""} description(s)`}
            </button>
          </>}>
          <div className="grid" style={{ gap: 12 }}>
            <div className="insight info">
              <div className="t">How it works — description only</div>
              <div className="d">
                <b>1.</b> Download the template — it comes pre-filled with every current code and description.<br />
                <b>2.</b> Edit only the <span className="mono">Description</span> column in Excel and save.<br />
                <b>3.</b> Upload it back here. Descriptions are matched by <span className="mono">Segment Key + Code</span> and saved.
                Codes, status and sort order are never changed, and no new rows are created.
              </div>
            </div>
            <div className="flex" style={{ gap: 8 }}>
              <button className="btn" onClick={downloadTemplate}>⬇ Download template (.xlsx)</button>
              <label className="btn primary" style={{ cursor: "pointer" }}>
                ⬆ Upload edited sheet
                <input type="file" accept=".xlsx,.xls,.csv" style={{ display: "none" }}
                  onChange={(e) => { void onBulkFile(e.target.files?.[0]); e.currentTarget.value = ""; }} />
              </label>
            </div>
            {bulkFile && (
              <div className="muted" style={{ fontSize: 12.5 }}>
                <b>{bulkFile}</b> — {bulkRows.length} row(s) ready. Click “Update description(s)” to save.
              </div>
            )}
            {bulkResult && (
              <div className="insight success">
                <div className="t">Done</div>
                <div className="d">
                  {bulkResult.updated} description(s) updated · {bulkResult.skipped} unchanged/skipped
                  {bulkResult.errors.length > 0 ? ` · ${bulkResult.errors.length} error(s)` : ""}
                </div>
                {bulkResult.errors.length > 0 && (
                  <ul style={{ margin: "6px 0 0", paddingLeft: 18, fontSize: 12 }}>
                    {bulkResult.errors.slice(0, 8).map((er, i) => <li key={i}>Row {er.row}: {er.error}</li>)}
                  </ul>
                )}
              </div>
            )}
          </div>
        </Modal>
      )}

      {impOpen && (
        <Modal title="Import Value Descriptions (per-model)" onClose={() => setImpOpen(false)}
          footer={<>
            <button className="btn" onClick={() => setImpOpen(false)}>Close</button>
            <button className="btn primary" onClick={runImport} disabled={impBusy || impRows.length === 0}>
              {impBusy ? "Importing…" : `Import ${impRows.length || ""} value(s)`}
            </button>
          </>}>
          <div className="grid" style={{ gap: 12 }}>
            <div className="insight info">
              <div className="t">Upload the master template's “Value Descriptions” sheet</div>
              <div className="d">
                This reads the dependency matrix: the same code can mean different things per product model
                (e.g. Size <span className="mono">01</span> = “Version 1” for Linear High Bay but “60 LEDs” for Strip Lights).
                Descriptions and the per-model meanings are saved; the builder then shows the right meaning for the selected model.
                Existing codes are updated, new ones added — nothing is deleted.
              </div>
            </div>
            <label className="btn primary" style={{ cursor: "pointer", alignSelf: "flex-start" }}>
              ⬆ Choose .xlsx file
              <input type="file" accept=".xlsx,.xls" style={{ display: "none" }}
                onChange={(e) => { void onImportFile(e.target.files?.[0]); e.currentTarget.value = ""; }} />
            </label>
            {impFile && (
              <div className="muted" style={{ fontSize: 12.5 }}>
                <b>{impFile}</b> — {impRows.length} value(s) parsed, <b>{impWithModels}</b> with per-model meanings. Click Import to save.
              </div>
            )}
            {impResult && (
              <div className="insight success">
                <div className="t">Import complete</div>
                <div className="d">
                  {impResult.updated} updated · {impResult.created} added · {impResult.withModels} with per-model meanings
                  {impResult.errors.length > 0 ? ` · ${impResult.errors.length} error(s)` : ""}
                </div>
                {impResult.errors.length > 0 && (
                  <ul style={{ margin: "6px 0 0", paddingLeft: 18, fontSize: 12 }}>
                    {impResult.errors.slice(0, 8).map((er, i) => <li key={i}>Row {er.row}: {er.error}</li>)}
                  </ul>
                )}
              </div>
            )}
          </div>
        </Modal>
      )}
      {node}
    </Layout>
  );
}
