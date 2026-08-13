import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Layout } from "../components/Layout";
import { StatusBadge, Spinner, Empty, Pager, useConfirm } from "../components/ui";
import { ImportWizard } from "../components/ImportWizard";
import { useBulkSelect, SelectAll, BulkBar, InlineEdit, MassField } from "../components/bulk";
import type { FieldDef } from "../components/CrudPage";
import { api, qs, API_BASE } from "../lib/api";
import { useToast } from "../lib/toast";
import { useAuth } from "../lib/auth";
import { PartNumber, Company, Category } from "../lib/types";

// Fields offered when bulk-importing part numbers. Keys match the segment /
// metadata fields the server accepts; the generated part number is recomputed.
const PART_IMPORT_FIELDS: FieldDef[] = [
  { key: "productCategory", label: "Category" }, { key: "productName", label: "Product Name" }, { key: "sku", label: "SKU" },
  { key: "company", label: "Company Code" }, { key: "productModel", label: "Product Model" }, { key: "versionVariant", label: "Version/Variant" },
  { key: "sizeVariant", label: "Size Variant" }, { key: "powerType", label: "Power Type" }, { key: "maxPower", label: "Max Power" },
  { key: "voltageRange", label: "Voltage Range" }, { key: "dimming", label: "Dimming" }, { key: "cct", label: "CCT" },
  { key: "lightDistribution", label: "Light Distribution" }, { key: "driver", label: "Driver" }, { key: "finish", label: "Finish" },
  { key: "manufacturer", label: "Manufacturer" }, { key: "lensType", label: "Lens Type" }, { key: "emergencyOption", label: "Emergency Option" },
  { key: "sensorOption", label: "Sensor Option" }, { key: "surgeProtection", label: "Surge Protection" }, { key: "reflectorCover", label: "Reflector/Cover" },
  { key: "mountingOption", label: "Mounting Option" }, { key: "photocontrolOption", label: "Photocontrol Option" }, { key: "connectableOption", label: "Connectable Option" },
  { key: "base", label: "Base" }, { key: "productStage", label: "Stage" }, { key: "status", label: "Status" },
  { key: "vendorName", label: "Vendor Name" }, { key: "productDescription", label: "Description", type: "textarea" },
];

export default function Library() {
  const nav = useNavigate();
  const toast = useToast();
  const { can } = useAuth();
  const { confirm, node } = useConfirm();

  // Seed filters from the URL so dashboard cards can deep-link (e.g. ?status=active).
  const [params] = useSearchParams();
  const [rows, setRows] = useState<PartNumber[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState(params.get("search") || "");
  const [company, setCompany] = useState(params.get("company") || "all");
  const [status, setStatus] = useState(params.get("status") || "all");
  const [category, setCategory] = useState(params.get("category") || "all");
  const [companies, setCompanies] = useState<Company[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [importOpen, setImportOpen] = useState(false);
  const pageSize = 15;

  const sel = useBulkSelect(rows.map((r) => r.id));

  useEffect(() => {
    api.get<Company[]>("/companies").then(setCompanies).catch(() => {});
    api.get<Category[]>("/categories").then(setCategories).catch(() => {});
  }, []);

  const load = () => {
    setLoading(true);
    api.get<{ data: PartNumber[]; total: number }>("/part-numbers" + qs({ search, company, status, category, page, pageSize }))
      .then((r) => { setRows(r.data); setTotal(r.total); })
      .catch((e) => toast(e.message, "error")).finally(() => setLoading(false));
  };
  useEffect(() => { const t = setTimeout(load, 200); return () => clearTimeout(t); }, [search, company, status, category, page]);
  useEffect(() => { setPage(1); }, [search, company, status, category]);

  const duplicate = async (row: PartNumber) => {
    try { const r = await api.post<{ id: number }>(`/part-numbers/${row.id}/duplicate`); toast("Part duplicated", "success"); nav(`/part/${r.id}`); }
    catch (e) { toast((e as Error).message, "error"); }
  };
  const remove = async (row: PartNumber) => {
    if (!(await confirm(`Delete ${row.partNumber}? This cannot be undone.`))) return;
    try { await api.del(`/part-numbers/${row.id}`); toast("Part deleted", "success"); load(); }
    catch (e) { toast((e as Error).message, "error"); }
  };

  // Inline single-cell edit → PATCH, then patch local row (keeps company_name in
  // sync since the PATCH response doesn't join the company table).
  const patchRow = async (id: number, patch: Record<string, string>) => {
    const updated = await api.patch<PartNumber>(`/part-numbers/${id}`, patch);
    setRows((rs) => rs.map((r) => r.id === id ? {
      ...r, ...updated,
      company_name: "companyId" in patch ? (companies.find((c) => String(c.id) === String(patch.companyId))?.name ?? undefined) : r.company_name,
    } : r));
  };

  // ── Bulk actions ──────────────────────────────────────────────────────────
  const massFields: MassField[] = [
    { key: "status", label: "Status", options: [{ value: "active", label: "Active" }, { value: "draft", label: "Draft" }, { value: "deprecated", label: "Deprecated" }] },
    { key: "productStage", label: "Stage", options: [{ value: "stocked", label: "Stocked" }, { value: "temporary", label: "Temporary" }] },
    { key: "productCategory", label: "Category", options: categories.map((c) => ({ value: c.name, label: c.name })) },
    { key: "companyId", label: "Company", options: [{ value: "", label: "Unassigned" }, ...companies.map((c) => ({ value: String(c.id), label: c.name }))] },
  ];
  const bulkApply = async (field: string, value: string) => {
    try {
      const r = await api.post<{ updated: number }>("/part-numbers/bulk-update", { ids: sel.ids(), patch: { [field]: value } });
      toast(`${r.updated} part(s) updated`, "success"); sel.clear(); load();
    } catch (e) { toast((e as Error).message, "error"); }
  };
  const bulkDelete = async () => {
    const ids = sel.ids();
    if (!(await confirm(`Delete ${ids.length} part number(s)? This cannot be undone.`))) return;
    try {
      const r = await api.post<{ deleted: number }>("/part-numbers/bulk-delete", { ids });
      toast(`${r.deleted} part(s) deleted`, "success"); sel.clear(); load();
    } catch (e) { toast((e as Error).message, "error"); }
  };

  const statusOpts = [{ value: "active", label: "Active" }, { value: "draft", label: "Draft" }, { value: "deprecated", label: "Deprecated" }];
  const companyOpts = [{ value: "", label: "— Unassigned —" }, ...companies.map((c) => ({ value: String(c.id), label: c.name }))];
  const categoryOpts = categories.map((c) => ({ value: c.name, label: c.name }));

  return (
    <Layout title="Part Number Library" subtitle="View, search and manage all part numbers."
      actions={<>
        <a className="btn" href={`${API_BASE}/export/parts.csv`}>⬇ Export CSV</a>
        {can("write") && <button className="btn" onClick={() => setImportOpen(true)}>⬆ Import</button>}
        {can("write") && <button className="btn primary" onClick={() => nav("/builder")}>+ Create New Part Number</button>}
      </>}>
      <div className="card">
        <div className="card-pad" style={{ paddingBottom: 0 }}>
          <div className="toolbar">
            <div className="search"><span className="ico">⌕</span>
              <input className="input" placeholder="Search part numbers…" value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            <select className="select" style={{ width: 170 }} value={company} onChange={(e) => setCompany(e.target.value)}>
              <option value="all">All Companies</option>
              {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <select className="select" style={{ width: 160 }} value={category} onChange={(e) => setCategory(e.target.value)}>
              <option value="all">All Categories</option>
              {categories.map((c) => <option key={c.id} value={c.name}>{c.name}</option>)}
            </select>
            <select className="select" style={{ width: 140 }} value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="all">All Status</option>
              <option value="active">Active</option>
              <option value="draft">Draft</option>
              <option value="deprecated">Deprecated</option>
            </select>
          </div>
        </div>

        {sel.count > 0 && (
          <div className="card-pad" style={{ paddingTop: 12, paddingBottom: 0 }}>
            <BulkBar count={sel.count} massFields={can("write") ? massFields : []} onApply={bulkApply}
              onDelete={can("delete") ? bulkDelete : undefined} canDelete={can("delete")} onClear={sel.clear} />
          </div>
        )}

        {loading ? <Spinner /> : rows.length === 0 ? <Empty title="No part numbers found" sub="Adjust filters or create a new part number." /> : (
          <div className="table-wrap">
            <table className="tbl">
              <thead><tr>
                <th style={{ width: 34 }}><SelectAll allOn={sel.allOn} someOn={sel.someOn} onToggle={sel.toggleAll} /></th>
                <th>Part Number</th><th>Product</th><th>Company</th><th>Category</th><th>Status</th><th style={{ textAlign: "right" }}>Actions</th>
              </tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} style={sel.isSel(r.id) ? { background: "var(--green-50)" } : undefined}>
                    <td><input type="checkbox" checked={sel.isSel(r.id)} onChange={() => sel.toggle(r.id)} style={{ cursor: "pointer" }} /></td>
                    <td><span className="mono" style={{ fontWeight: 600, cursor: "pointer" }} onClick={() => nav(`/part/${r.id}`)}>{r.partNumber}</span></td>
                    <td>{can("write")
                      ? <InlineEdit value={r.productName ?? ""} onSave={(v) => patchRow(r.id, { productName: v })} />
                      : r.productName}</td>
                    <td className="muted">{can("write")
                      ? <InlineEdit type="select" value={String((r as any).companyId ?? "")} options={companyOpts}
                          display={() => r.company_name || <span className="muted">—</span>}
                          onSave={(v) => patchRow(r.id, { companyId: v })} />
                      : (r.company_name || "—")}</td>
                    <td>{can("write")
                      ? <InlineEdit type="select" value={r.productCategory ?? ""} options={categoryOpts}
                          onSave={(v) => patchRow(r.id, { productCategory: v })} />
                      : r.productCategory}</td>
                    <td>{can("write")
                      ? <InlineEdit type="select" value={r.status ?? "active"} options={statusOpts}
                          display={() => <StatusBadge status={r.status} />} onSave={(v) => patchRow(r.id, { status: v })} />
                      : <StatusBadge status={r.status} />}</td>
                    <td>
                      <div className="actions-cell" style={{ justifyContent: "flex-end" }}>
                        <button className="icon-btn" title="View" onClick={() => nav(`/part/${r.id}`)}>👁</button>
                        {can("write") && <button className="icon-btn" title="Edit" onClick={() => nav(`/builder/${r.id}`)}>✎</button>}
                        {can("write") && <button className="icon-btn" title="Duplicate" onClick={() => duplicate(r)}>⧉</button>}
                        {can("delete") && <button className="icon-btn danger" title="Delete" onClick={() => remove(r)}>🗑</button>}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="card-pad" style={{ paddingTop: 0 }}>
              <Pager page={page} pageSize={pageSize} total={total} onPage={setPage} />
            </div>
          </div>
        )}
      </div>

      {importOpen && (
        <ImportWizard title="Part Numbers" endpoint="/part-numbers" singular="Part Number" fields={PART_IMPORT_FIELDS} keyless
          getExisting={async () => (await api.get<{ data: Record<string, unknown>[] }>("/part-numbers" + qs({ pageSize: 1000 }))).data}
          onClose={() => setImportOpen(false)} onDone={() => { setImportOpen(false); load(); }} />
      )}
      {node}
    </Layout>
  );
}
