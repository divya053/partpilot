import { useEffect, useState } from "react";
import { Layout } from "../components/Layout";
import { Modal } from "../components/Modal";
import { Field, Spinner, Empty, useConfirm } from "../components/ui";
import { api, qs } from "../lib/api";
import { useToast } from "../lib/toast";
import { useAuth } from "../lib/auth";
import { SegmentDef, SegmentValue } from "../lib/types";

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

  return (
    <Layout title="Units & Values" subtitle="Manage the allowed codes and descriptions for every segment."
      actions={can("write") && <button className="btn primary" onClick={() => setEditing({ segmentKey: segmentKey === "all" ? defs[0]?.key : segmentKey, code: "", description: "", isActive: true, sortOrder: 0 })}>+ Add Value</button>}>
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
                    <td>{r.description}</td>
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
      {node}
    </Layout>
  );
}
