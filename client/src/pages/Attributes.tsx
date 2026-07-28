import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Layout } from "../components/Layout";
import { Spinner } from "../components/ui";
import { api } from "../lib/api";
import { useToast } from "../lib/toast";
import { useAuth } from "../lib/auth";
import { SegmentDef } from "../lib/types";

type Edit = { label?: string; help?: string };

export default function Attributes() {
  const nav = useNavigate();
  const toast = useToast();
  const { can } = useAuth();
  const editable = can("write");

  const [defs, setDefs] = useState<SegmentDef[] | null>(null);
  const [edits, setEdits] = useState<Record<string, Edit>>({});
  const [saving, setSaving] = useState(false);

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

  return (
    <Layout title="Attributes" subtitle="The segments that make up every IKIO part number, in order. Rename them or refine their help text."
      actions={editable && dirty.length > 0 && <button className="btn primary" onClick={saveAll} disabled={saving}>{saving ? "Saving…" : `Save all changes (${dirty.length})`}</button>}>
      <div className="card">
        <div className="table-wrap">
          <table className="tbl">
            <thead><tr><th>#</th><th>Attribute</th><th>Key</th><th>Type</th><th>Values</th><th>Help / description</th>{editable && <th></th>}</tr></thead>
            <tbody>
              {defs.map((d, i) => {
                const isDirty = !!edits[d.key];
                return (
                  <tr key={d.key} style={isDirty ? { background: "var(--green-50)" } : undefined}>
                    <td className="muted">{i + 1}</td>
                    <td style={{ minWidth: 170 }}>
                      {editable
                        ? <input className="input" value={val(d, "label")} onChange={(e) => setEdit(d.key, { label: e.target.value })} />
                        : <strong>{d.label}</strong>}
                    </td>
                    <td><span className="mono muted">{d.key}</span></td>
                    <td>{d.required ? <span className="badge green">Required</span> : <span className="badge blue">Optional</span>}{d.letter ? <span className="badge gray mono" style={{ marginLeft: 4 }}>{d.letter}</span> : null}</td>
                    <td><span className="badge gray" style={{ cursor: "pointer" }} onClick={() => nav("/values")}>{d.valueCount} values</span></td>
                    <td style={{ minWidth: 260 }}>
                      {editable
                        ? <input className="input" value={val(d, "help")} onChange={(e) => setEdit(d.key, { help: e.target.value })} />
                        : <span className="muted">{d.help}</span>}
                    </td>
                    {editable && (
                      <td>
                        <div className="actions-cell" style={{ justifyContent: "flex-end", gap: 6 }}>
                          <button className="btn sm" disabled={!isDirty || saving} onClick={() => saveOne(d)}>Save</button>
                          <button className="btn sm" title="Manage values" onClick={() => nav("/values")}>Values →</button>
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
    </Layout>
  );
}
