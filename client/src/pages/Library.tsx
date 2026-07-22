import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Layout } from "../components/Layout";
import { StatusBadge, Spinner, Empty, Pager, useConfirm } from "../components/ui";
import { api, qs } from "../lib/api";
import { useToast } from "../lib/toast";
import { useAuth } from "../lib/auth";
import { PartNumber, Company, Category } from "../lib/types";

export default function Library() {
  const nav = useNavigate();
  const toast = useToast();
  const { can } = useAuth();
  const { confirm, node } = useConfirm();

  const [rows, setRows] = useState<PartNumber[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [company, setCompany] = useState("all");
  const [status, setStatus] = useState("all");
  const [category, setCategory] = useState("all");
  const [companies, setCompanies] = useState<Company[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const pageSize = 15;

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

  return (
    <Layout title="Part Number Library" subtitle="View, search and manage all part numbers."
      actions={<>
        <a className="btn" href="/api/export/parts.csv">⬇ Export CSV</a>
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

        {loading ? <Spinner /> : rows.length === 0 ? <Empty title="No part numbers found" sub="Adjust filters or create a new part number." /> : (
          <div className="table-wrap">
            <table className="tbl">
              <thead><tr>
                <th>Part Number</th><th>Product</th><th>Company</th><th>Category</th><th>Status</th><th style={{ textAlign: "right" }}>Actions</th>
              </tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td><span className="mono" style={{ fontWeight: 600, cursor: "pointer" }} onClick={() => nav(`/part/${r.id}`)}>{r.partNumber}</span></td>
                    <td>{r.productName}</td>
                    <td className="muted">{r.company_name || "—"}</td>
                    <td>{r.productCategory}</td>
                    <td><StatusBadge status={r.status} /></td>
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
      {node}
    </Layout>
  );
}
