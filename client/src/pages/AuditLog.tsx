import { useEffect, useState } from "react";
import { Layout } from "../components/Layout";
import { Spinner, Empty, Pager } from "../components/ui";
import { api, qs } from "../lib/api";
import { AuditEntry } from "../lib/types";

const ACTION_BADGE: Record<string, string> = {
  Created: "green", Updated: "blue", Deleted: "red", Duplicated: "amber", Imported: "green", Exported: "gray", Login: "gray",
};

export default function AuditLog() {
  const [rows, setRows] = useState<AuditEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [module, setModule] = useState("all");
  const [action, setAction] = useState("all");
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState<{ modules: string[]; actions: string[] }>({ modules: [], actions: [] });
  const pageSize = 25;

  useEffect(() => { api.get<any>("/audit/filters").then(setFilters).catch(() => {}); }, []);
  const load = () => {
    setLoading(true);
    api.get<{ data: AuditEntry[]; total: number }>("/audit" + qs({ module, action, search, page, pageSize }))
      .then((r) => { setRows(r.data); setTotal(r.total); }).catch(() => {}).finally(() => setLoading(false));
  };
  useEffect(() => { const t = setTimeout(load, 200); return () => clearTimeout(t); }, [module, action, search, page]);
  useEffect(() => { setPage(1); }, [module, action, search]);

  return (
    <Layout title="Audit Log" subtitle="Every change and activity across PartPilot.">
      <div className="card">
        <div className="card-pad" style={{ paddingBottom: 0 }}>
          <div className="toolbar">
            <div className="search"><span className="ico">⌕</span><input className="input" placeholder="Search activity…" value={search} onChange={(e) => setSearch(e.target.value)} /></div>
            <select className="select" style={{ width: 160 }} value={module} onChange={(e) => setModule(e.target.value)}>
              <option value="all">All Modules</option>{filters.modules.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
            <select className="select" style={{ width: 150 }} value={action} onChange={(e) => setAction(e.target.value)}>
              <option value="all">All Actions</option>{filters.actions.map((a) => <option key={a} value={a}>{a}</option>)}
            </select>
          </div>
        </div>
        {loading ? <Spinner /> : rows.length === 0 ? <Empty title="No activity yet" /> : (
          <div className="table-wrap">
            <table className="tbl">
              <thead><tr><th>Date &amp; Time</th><th>User</th><th>Module</th><th>Action</th><th>Details</th><th>IP</th></tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td className="muted" style={{ whiteSpace: "nowrap" }}>{new Date(r.created_at).toLocaleString()}</td>
                    <td>{r.user_name || "System"}</td>
                    <td><span className="badge gray">{r.module}</span></td>
                    <td><span className={`badge ${ACTION_BADGE[r.action] || "gray"}`}>{r.action}</span></td>
                    <td>{r.details}</td>
                    <td className="mono muted">{r.ip_address || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="card-pad" style={{ paddingTop: 0 }}><Pager page={page} pageSize={pageSize} total={total} onPage={setPage} /></div>
          </div>
        )}
      </div>
    </Layout>
  );
}
