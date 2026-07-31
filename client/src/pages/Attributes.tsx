import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Layout } from "../components/Layout";
import { Modal } from "../components/Modal";
import { Spinner } from "../components/ui";
import { api } from "../lib/api";
import { useToast } from "../lib/toast";
import { useAuth } from "../lib/auth";
import { SegmentDef } from "../lib/types";

type Edit = { label?: string; help?: string };
type AttrRow = { key: string; label: string; help: string };

export default function Attributes() {
  const nav = useNavigate();
  const toast = useToast();
  const { can } = useAuth();
  const editable = can("write");

  const [defs, setDefs] = useState<SegmentDef[] | null>(null);
  const [edits, setEdits] = useState<Record<string, Edit>>({});
  const [saving, setSaving] = useState(false);
  const [editMode, setEditMode] = useState(false); // view-only until the user opts in

  // Excel import (bulk update label/help by attribute key)
  const [impOpen, setImpOpen] = useState(false);
  const [impRows, setImpRows] = useState<AttrRow[]>([]);
  const [impFile, setImpFile] = useState("");
  const [impBusy, setImpBusy] = useState(false);
  const [impResult, setImpResult] = useState<{ updated: number } | null>(null);
  const [impSkipped, setImpSkipped] = useState<string[]>([]);

  const load = () => api.get<SegmentDef[]>("/segments/summary").then(setDefs).catch(() => {});
  useEffect(() => { load(); }, []);

  if (!defs) return <Layout title="Attributes"><Spinner /></Layout>;

  const val = (d: SegmentDef, f: "label" | "help") => edits[d.key]?.[f] ?? (d[f] as string) ?? "";
  const setEdit = (key: string, patch: Edit) => setEdits((e) => ({ ...e, [key]: { ...e[key], ...patch } }));
  const dirty = Object.keys(edits);

  const saveOne = async (d: SegmentDef) => {
    setSaving(true);
    try {
      await api.patch(`/segments/def/${d.key}`, { label: val(d, "label"), help: val(d, "help") });
      toast(`“${val(d, "label")}” saved`, "success");
      setEdits((e) => { const n = { ...e }; delete n[d.key]; return n; });
      load();
    } catch (e) { toast((e as Error).message, "error"); } finally { setSaving(false); }
  };
  const saveAll = async () => {
    if (!dirty.length) return;
    setSaving(true);
    try {
      const rows = dirty.map((key) => {
        const d = defs.find((x) => x.key === key)!;
        return { key, label: val(d, "label"), help: val(d, "help") };
      });
      const r = await api.post<{ updated: number }>("/segments/def/bulk", { rows });
      toast(`${r.updated} attribute(s) updated`, "success");
      setEdits({}); load();
    } catch (e) { toast((e as Error).message, "error"); } finally { setSaving(false); }
  };

  const toggleEdit = () => { setEditMode((v) => !v); setEdits({}); };

  // ─── Excel bulk update (Key · Attribute · Help) ───────────────────────────
  const downloadTemplate = async () => {
    if (!defs) return;
    try {
      const XLSX = await import("xlsx");
      const data = defs.map((d) => ({ Key: d.key, Attribute: d.label, Help: d.help || "" }));
      const ws = XLSX.utils.json_to_sheet(data, { header: ["Key", "Attribute", "Help"] });
      ws["!cols"] = [{ wch: 20 }, { wch: 26 }, { wch: 60 }];
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Attributes");
      XLSX.writeFile(wb, "partpilot-attributes-template.xlsx");
      toast(`Template with ${data.length} attributes downloaded`, "success");
    } catch (e) { toast((e as Error).message, "error"); }
  };
  const onImpFile = async (file?: File | null) => {
    if (!file || !defs) return;
    setImpResult(null);
    try {
      const XLSX = await import("xlsx");
      const wb = XLSX.read(await file.arrayBuffer(), { type: "array" });
      const grid = XLSX.utils.sheet_to_json<any[]>(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: "", raw: false, blankrows: false });
      const headers = (grid[0] || []).map((c: any) => String(c).trim().toLowerCase());
      const keyCol = headers.findIndex((h: string) => /key/.test(h));
      const labelCol = headers.findIndex((h: string) => /(attribute|label|name)/.test(h) && !/key/.test(h));
      const helpCol = headers.findIndex((h: string) => /(help|desc)/.test(h));
      const rows: AttrRow[] = [];
      const skipped: string[] = [];
      for (const r of grid.slice(1)) {
        const raw = keyCol >= 0 ? String(r[keyCol] ?? "").trim() : "";
        if (!raw) continue;
        const d = defs.find((x) => x.key.toLowerCase() === raw.toLowerCase() || (x.label || "").toLowerCase() === raw.toLowerCase());
        if (!d) { skipped.push(raw); continue; } // key changed / unknown — can't rename keys
        rows.push({ key: d.key, label: labelCol >= 0 ? String(r[labelCol] ?? "").trim() || d.label : d.label, help: helpCol >= 0 ? String(r[helpCol] ?? "").trim() : (d.help || "") });
      }
      setImpSkipped(skipped);
      if (!rows.length) { toast("No matching attributes found — the Key column must keep the original keys.", "error"); return; }
      setImpRows(rows); setImpFile(file.name);
    } catch { toast("Could not read that file. Use the .xlsx template.", "error"); }
  };
  const runImport = async () => {
    if (!impRows.length) return;
    setImpBusy(true); setImpResult(null);
    try {
      const r = await api.post<{ updated: number }>("/segments/def/bulk", { rows: impRows });
      setImpResult(r); toast(`${r.updated} attribute(s) updated`, "success"); load();
    } catch (e) { toast((e as Error).message, "error"); } finally { setImpBusy(false); }
  };

  return (
    <Layout title="Attributes" subtitle="The segments that make up every IKIO part number, in order."
      actions={editable && <>
        {editMode && dirty.length > 0 && <button className="btn primary" onClick={saveAll} disabled={saving}>{saving ? "Saving…" : `Save all changes (${dirty.length})`}</button>}
        {!editMode && <button className="btn" onClick={() => { setImpRows([]); setImpFile(""); setImpResult(null); setImpSkipped([]); setImpOpen(true); }}>⬆ Import Excel</button>}
        <button className={"btn" + (editMode ? " danger" : "")} onClick={toggleEdit}>{editMode ? "Done" : "✎ Edit attributes"}</button>
      </>}>
      <div className="card">
        <div className="table-wrap">
          <table className="tbl">
            <thead><tr><th>#</th><th>Attribute (name)</th><th title="Fixed technical identifier — cannot be changed">Key 🔒</th><th>Type</th><th>Values</th><th>Help / description</th>{editable && <th></th>}</tr></thead>
            <tbody>
              {defs.map((d, i) => {
                const isDirty = !!edits[d.key];
                return (
                  <tr key={d.key} style={isDirty ? { background: "var(--green-50)" } : undefined}>
                    <td className="muted">{i + 1}</td>
                    <td style={{ minWidth: 170 }}>
                      {editMode
                        ? <input className="input" value={val(d, "label")} onChange={(e) => setEdit(d.key, { label: e.target.value })} />
                        : <strong>{d.label}</strong>}
                    </td>
                    <td><span className="mono muted">{d.key}</span></td>
                    <td>{d.required ? <span className="badge green">Required</span> : <span className="badge blue">Optional</span>}{d.letter ? <span className="badge gray mono" style={{ marginLeft: 4 }}>{d.letter}</span> : null}</td>
                    <td><span className="badge gray" style={{ cursor: "pointer" }} onClick={() => nav("/values")}>{d.valueCount} values</span></td>
                    <td style={{ minWidth: 260 }}>
                      {editMode
                        ? <input className="input" value={val(d, "help")} onChange={(e) => setEdit(d.key, { help: e.target.value })} />
                        : <span className="muted">{d.help}</span>}
                    </td>
                    {editable && (
                      <td>
                        <div className="actions-cell" style={{ justifyContent: "flex-end", gap: 6 }}>
                          {editMode
                            ? <button className="btn sm" disabled={!isDirty || saving} onClick={() => saveOne(d)}>Save</button>
                            : <button className="btn sm" title="Manage values" onClick={() => nav("/values")}>Values →</button>}
                        </div>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
      <div className="muted" style={{ marginTop: 12, fontSize: 12.5 }}>
        Type &amp; add-on letter are fixed by the part-number format. Edit an attribute's <b>values</b> (codes, descriptions, per-model meanings) in <a className="link" style={{ textDecoration: "underline", cursor: "pointer" }} onClick={() => nav("/values")}>Units &amp; Values</a>.
      </div>

      {impOpen && (
        <Modal title="Import attributes from Excel" onClose={() => setImpOpen(false)}
          footer={<>
            <button className="btn" onClick={() => setImpOpen(false)}>Close</button>
            <button className="btn primary" onClick={runImport} disabled={impBusy || impRows.length === 0}>{impBusy ? "Importing…" : `Update ${impRows.length || ""} attribute(s)`}</button>
          </>}>
          <div className="grid" style={{ gap: 12 }}>
            <div className="insight info">
              <div className="t">Bulk-update attribute names &amp; help text</div>
              <div className="d">Download the template, edit only the <b>Attribute</b> (name) and <b>Help</b> columns, and re-upload. Rows are matched by <span className="mono">Key</span> — <b>don't change the Key column</b>: keys are fixed identifiers wired into the part-number format, so a changed key can't be matched and its row is skipped.</div>
            </div>
            {impSkipped.length > 0 && (
              <div className="insight warning">
                <div className="t">{impSkipped.length} row(s) skipped — unknown key</div>
                <div className="d">These keys don't exist and were ignored (keys can't be renamed): <span className="mono">{impSkipped.slice(0, 8).join(", ")}{impSkipped.length > 8 ? "…" : ""}</span></div>
              </div>
            )}
            <div className="flex" style={{ gap: 8, flexWrap: "wrap" }}>
              <button className="btn" onClick={downloadTemplate}>⬇ Download template</button>
              <label className="btn primary" style={{ cursor: "pointer" }}>⬆ Upload edited sheet
                <input type="file" accept=".xlsx,.xls,.csv" style={{ display: "none" }} onChange={(e) => { void onImpFile(e.target.files?.[0]); e.currentTarget.value = ""; }} />
              </label>
            </div>
            {impFile && <div className="muted" style={{ fontSize: 12.5 }}><b>{impFile}</b> — {impRows.length} matching attribute(s) ready.</div>}
            {impResult && <div className="insight success"><div className="d">{impResult.updated} attribute(s) updated.</div></div>}
          </div>
        </Modal>
      )}
    </Layout>
  );
}
