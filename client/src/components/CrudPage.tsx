import { useEffect, useState } from "react";
import { Layout } from "./Layout";
import { Modal } from "./Modal";
import { Field, StatusBadge, Spinner, Empty, useConfirm } from "./ui";
import { api, qs } from "../lib/api";
import { useToast } from "../lib/toast";
import { useAuth } from "../lib/auth";

export interface FieldDef {
  key: string;
  label: string;
  type?: "text" | "textarea" | "select" | "email";
  options?: { value: string; label: string }[];
  required?: boolean;
  hint?: string;
  default?: string;
}
export interface ColumnDef<T> {
  header: string;
  render: (row: T) => React.ReactNode;
}

export function CrudPage<T extends { id: number }>({
  title, subtitle, endpoint, singular, columns, fields, searchable = true, statusFilter = true,
}: {
  title: string; subtitle: string; endpoint: string; singular: string;
  columns: ColumnDef<T>[]; fields: FieldDef[]; searchable?: boolean; statusFilter?: boolean;
}) {
  const toast = useToast();
  const { can } = useAuth();
  const { confirm, node } = useConfirm();
  const [rows, setRows] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [editing, setEditing] = useState<Partial<T> | null>(null);
  const [saving, setSaving] = useState(false);

  const load = () => {
    setLoading(true);
    api.get<T[]>(endpoint + qs({ search, status: statusFilter ? status : undefined }))
      .then(setRows).catch((e) => toast(e.message, "error")).finally(() => setLoading(false));
  };
  useEffect(() => { const t = setTimeout(load, 200); return () => clearTimeout(t); }, [search, status]);

  const openNew = () => {
    const blank: Record<string, string> = {};
    for (const f of fields) blank[f.key] = f.default ?? "";
    setEditing(blank as Partial<T>);
  };

  const save = async () => {
    setSaving(true);
    try {
      const id = (editing as any).id;
      if (id) { await api.patch(`${endpoint}/${id}`, editing); toast(`${singular} updated`, "success"); }
      else { await api.post(endpoint, editing); toast(`${singular} created`, "success"); }
      setEditing(null); load();
    } catch (e) { toast((e as Error).message, "error"); }
    finally { setSaving(false); }
  };

  const remove = async (row: T) => {
    if (!(await confirm(`Delete this ${singular.toLowerCase()}? This cannot be undone.`))) return;
    try { await api.del(`${endpoint}/${row.id}`); toast(`${singular} deleted`, "success"); load(); }
    catch (e) { toast((e as Error).message, "error"); }
  };

  return (
    <Layout title={title} subtitle={subtitle}
      actions={can("write") && <button className="btn primary" onClick={openNew}>+ Add {singular}</button>}>
      <div className="card">
        <div className="card-pad" style={{ paddingBottom: 0 }}>
          <div className="toolbar">
            {searchable && (
              <div className="search">
                <span className="ico">⌕</span>
                <input className="input" placeholder={`Search ${title.toLowerCase()}…`} value={search} onChange={(e) => setSearch(e.target.value)} />
              </div>
            )}
            {statusFilter && (
              <select className="select" style={{ width: 150 }} value={status} onChange={(e) => setStatus(e.target.value)}>
                <option value="all">All Status</option>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            )}
          </div>
        </div>
        {loading ? <Spinner /> : rows.length === 0 ? <Empty title={`No ${title.toLowerCase()} found`} sub="Try adjusting your search or add a new record." /> : (
          <div className="table-wrap">
            <table className="tbl">
              <thead><tr>{columns.map((c) => <th key={c.header}>{c.header}</th>)}<th style={{ textAlign: "right" }}>Actions</th></tr></thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id}>
                    {columns.map((c) => <td key={c.header}>{c.render(row)}</td>)}
                    <td>
                      <div className="actions-cell" style={{ justifyContent: "flex-end" }}>
                        {can("write") && <button className="icon-btn" title="Edit" onClick={() => setEditing(row)}>✎</button>}
                        {can("delete") && <button className="icon-btn danger" title="Delete" onClick={() => remove(row)}>🗑</button>}
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
        <Modal title={`${(editing as any).id ? "Edit" : "New"} ${singular}`} onClose={() => setEditing(null)}
          footer={<>
            <button className="btn" onClick={() => setEditing(null)}>Cancel</button>
            <button className="btn primary" onClick={save} disabled={saving}>{saving ? "Saving…" : "Save"}</button>
          </>}>
          <div className="grid" style={{ gap: 14 }}>
            {fields.map((f) => (
              <Field key={f.key} label={f.label} required={f.required} hint={f.hint}>
                {f.type === "textarea" ? (
                  <textarea className="textarea" value={(editing as any)[f.key] ?? ""} onChange={(e) => setEditing({ ...editing, [f.key]: e.target.value })} />
                ) : f.type === "select" ? (
                  <select className="select" value={(editing as any)[f.key] ?? ""} onChange={(e) => setEditing({ ...editing, [f.key]: e.target.value })}>
                    {f.options!.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                ) : (
                  <input className="input" type={f.type === "email" ? "email" : "text"} value={(editing as any)[f.key] ?? ""} onChange={(e) => setEditing({ ...editing, [f.key]: e.target.value })} />
                )}
              </Field>
            ))}
          </div>
        </Modal>
      )}
      {node}
    </Layout>
  );
}

export { StatusBadge };
