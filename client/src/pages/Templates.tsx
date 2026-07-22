import { useEffect, useState } from "react";
import { Layout } from "../components/Layout";
import { Modal } from "../components/Modal";
import { Field, Spinner, Empty, useConfirm } from "../components/ui";
import { api } from "../lib/api";
import { useToast } from "../lib/toast";
import { useAuth } from "../lib/auth";
import { Template, SegmentDef } from "../lib/types";

export default function Templates() {
  const toast = useToast();
  const { can } = useAuth();
  const { confirm, node } = useConfirm();
  const [rows, setRows] = useState<Template[]>([]);
  const [defs, setDefs] = useState<SegmentDef[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<any | null>(null);
  const [saving, setSaving] = useState(false);

  const load = () => { setLoading(true); api.get<Template[]>("/templates").then(setRows).catch(() => {}).finally(() => setLoading(false)); };
  useEffect(() => { load(); api.get<{ all: SegmentDef[] }>("/segments/meta").then((m) => setDefs(m.all)).catch(() => {}); }, []);

  const toggleSeg = (key: string) => setEditing((e: any) => ({ ...e, segments: e.segments.includes(key) ? e.segments.filter((s: string) => s !== key) : [...e.segments, key] }));
  const save = async () => {
    setSaving(true);
    try {
      if (editing.id) await api.patch(`/templates/${editing.id}`, editing);
      else await api.post("/templates", { ...editing, created_by: "You", usage_count: 0 });
      toast("Template saved", "success"); setEditing(null); load();
    } catch (e) { toast((e as Error).message, "error"); } finally { setSaving(false); }
  };
  const remove = async (t: Template) => {
    if (!(await confirm(`Delete template "${t.name}"?`))) return;
    try { await api.del(`/templates/${t.id}`); toast("Deleted", "success"); load(); } catch (e) { toast((e as Error).message, "error"); }
  };

  return (
    <Layout title="Templates" subtitle="Preset segment layouts to speed up the builder."
      actions={can("write") && <button className="btn primary" onClick={() => setEditing({ name: "", description: "", segments: [] })}>+ New Template</button>}>
      <div className="card">
        {loading ? <Spinner /> : rows.length === 0 ? <Empty title="No templates yet" /> : (
          <div className="table-wrap">
            <table className="tbl">
              <thead><tr><th>Template</th><th>Description</th><th>Segments</th><th>Used</th><th>By</th><th style={{ textAlign: "right" }}>Actions</th></tr></thead>
              <tbody>
                {rows.map((t) => (
                  <tr key={t.id}>
                    <td><strong>{t.name}</strong></td>
                    <td className="muted">{t.description || "—"}</td>
                    <td><span className="badge gray">{t.segments?.length || 0} segments</span></td>
                    <td className="muted">{t.usage_count}×</td>
                    <td className="muted">{t.created_by || "—"}</td>
                    <td><div className="actions-cell" style={{ justifyContent: "flex-end" }}>
                      {can("write") && <button className="icon-btn" onClick={() => setEditing({ ...t })}>✎</button>}
                      {can("delete") && <button className="icon-btn danger" onClick={() => remove(t)}>🗑</button>}
                    </div></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {editing && (
        <Modal size="lg" title={editing.id ? "Edit Template" : "New Template"} onClose={() => setEditing(null)}
          footer={<><button className="btn" onClick={() => setEditing(null)}>Cancel</button><button className="btn primary" onClick={save} disabled={saving}>{saving ? "Saving…" : "Save"}</button></>}>
          <div className="grid" style={{ gap: 14 }}>
            <Field label="Name" required><input className="input" value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} /></Field>
            <Field label="Description"><input className="input" value={editing.description} onChange={(e) => setEditing({ ...editing, description: e.target.value })} /></Field>
            <Field label="Included Segments">
              <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 8 }}>
                {defs.map((d) => (
                  <label key={d.key} className="flex" style={{ gap: 7, fontSize: 13 }}>
                    <input type="checkbox" checked={editing.segments.includes(d.key)} onChange={() => toggleSeg(d.key)} /> {d.label}
                  </label>
                ))}
              </div>
            </Field>
          </div>
        </Modal>
      )}
      {node}
    </Layout>
  );
}
