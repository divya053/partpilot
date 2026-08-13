import { useEffect, useState } from "react";
import { Layout } from "./Layout";
import { Modal } from "./Modal";
import { Field, StatusBadge, Spinner, Empty, useConfirm } from "./ui";
import { ImportWizard } from "./ImportWizard";
import { useBulkSelect, SelectAll, BulkBar, InlineEdit, MassField } from "./bulk";
import { api, qs } from "../lib/api";
import { useToast } from "../lib/toast";
import { useAuth } from "../lib/auth";

export interface FieldDef {
  key: string;
  label: string;
  type?: "text" | "textarea" | "select" | "email" | "list";
  options?: { value: string; label: string }[];
  required?: boolean;
  hint?: string;
  default?: string;
}
export interface ColumnDef<T> {
  header: string;
  render: (row: T) => React.ReactNode;
  // When set (and the field is text/select), the cell becomes click-to-edit
  // inline, saving via PATCH. The FieldDef with this key supplies type/options.
  editKey?: string;
}

export function CrudPage<T extends { id: number }>({
  title, subtitle, endpoint, singular, columns, fields, searchable = true, statusFilter = true, massFields,
}: {
  title: string; subtitle: string; endpoint: string; singular: string;
  columns: ColumnDef<T>[]; fields: FieldDef[]; searchable?: boolean; statusFilter?: boolean;
  // Fields offered for mass-update in the bulk bar. Defaults to every select
  // field (e.g. Status), so most pages get sensible mass-update for free.
  massFields?: MassField[];
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
  const [importOpen, setImportOpen] = useState(false);

  const sel = useBulkSelect(rows.map((r) => r.id));
  const bulkFields: MassField[] = massFields
    || fields.filter((f) => f.type === "select" && f.options?.length).map((f) => ({ key: f.key, label: f.label, options: f.options! }));

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

  // Inline cell edit → PATCH, update the single row in place.
  const patchRow = async (id: number, patch: Record<string, string>) => {
    const updated = await api.patch<T>(`${endpoint}/${id}`, patch);
    setRows((rs) => rs.map((r) => r.id === id ? updated : r));
  };

  // ── Bulk actions ──────────────────────────────────────────────────────────
  const bulkApply = async (field: string, value: string) => {
    try {
      const r = await api.post<{ updated: number }>(`${endpoint}/bulk-update`, { ids: sel.ids(), patch: { [field]: value } });
      toast(`${r.updated} ${title.toLowerCase()} updated`, "success"); sel.clear(); load();
    } catch (e) { toast((e as Error).message, "error"); }
  };
  const bulkDelete = async () => {
    const ids = sel.ids();
    if (!(await confirm(`Delete ${ids.length} ${title.toLowerCase()}? This cannot be undone.`))) return;
    try {
      const r = await api.post<{ deleted: number }>(`${endpoint}/bulk-delete`, { ids });
      toast(`${r.deleted} deleted`, "success"); sel.clear(); load();
    } catch (e) { toast((e as Error).message, "error"); }
  };

  // Client-side CSV export of the current (filtered) rows.
  const exportCsv = () => {
    const esc = (v: unknown) => { const s = Array.isArray(v) ? v.join("|") : (v == null ? "" : String(v)); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
    const header = fields.map((f) => f.label).join(",");
    const body = rows.map((r) => fields.map((f) => esc((r as any)[f.key])).join(",")).join("\n");
    const blob = new Blob([header + "\n" + body], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = `partpilot-${singular.toLowerCase()}.csv`; a.click();
    URL.revokeObjectURL(a.href);
  };

  // Inline editor for a column that declares editKey.
  const inlineCell = (col: ColumnDef<T>, row: T) => {
    const fd = fields.find((f) => f.key === col.editKey);
    const isSelect = fd?.type === "select" && !!fd.options?.length;
    if (!can("write") || !fd || (fd.type && !["text", "select", "email"].includes(fd.type))) return col.render(row);
    return (
      <InlineEdit value={String((row as any)[col.editKey!] ?? "")} type={isSelect ? "select" : "text"} options={fd.options}
        display={() => col.render(row)} onSave={(v) => patchRow(row.id, { [col.editKey!]: v })} />
    );
  };

  return (
    <Layout title={title} subtitle={subtitle}
      actions={<>
        <button className="btn" onClick={exportCsv} disabled={!rows.length}>⬇ Export CSV</button>
        {can("write") && <button className="btn" onClick={() => setImportOpen(true)}>⬆ Import</button>}
        {can("write") && <button className="btn primary" onClick={openNew}>+ Add {singular}</button>}
      </>}>
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
        {sel.count > 0 && (
          <div className="card-pad" style={{ paddingTop: 12, paddingBottom: 0 }}>
            <BulkBar count={sel.count} massFields={can("write") ? bulkFields : []} onApply={bulkApply}
              onDelete={can("delete") ? bulkDelete : undefined} canDelete={can("delete")} onClear={sel.clear} />
          </div>
        )}
        {loading ? <Spinner /> : rows.length === 0 ? <Empty title={`No ${title.toLowerCase()} found`} sub="Try adjusting your search or add a new record." /> : (
          <div className="table-wrap">
            <table className="tbl">
              <thead><tr>
                <th style={{ width: 34 }}><SelectAll allOn={sel.allOn} someOn={sel.someOn} onToggle={sel.toggleAll} /></th>
                {columns.map((c) => <th key={c.header}>{c.header}</th>)}<th style={{ textAlign: "right" }}>Actions</th>
              </tr></thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} style={sel.isSel(row.id) ? { background: "var(--green-50)" } : undefined}>
                    <td><input type="checkbox" checked={sel.isSel(row.id)} onChange={() => sel.toggle(row.id)} style={{ cursor: "pointer" }} /></td>
                    {columns.map((c) => <td key={c.header}>{c.editKey ? inlineCell(c, row) : c.render(row)}</td>)}
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
      {importOpen && (
        <ImportWizard title={title} endpoint={endpoint} singular={singular} fields={fields}
          onClose={() => setImportOpen(false)} onDone={load} />
      )}
      {node}
    </Layout>
  );
}

export { StatusBadge };
