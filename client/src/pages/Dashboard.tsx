import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Layout } from "../components/Layout";
import { StatusBadge, Spinner } from "../components/ui";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";

interface DashData {
  stats: { parts: number; active: number; drafts: number; companies: number; products: number; segmentValues: number };
  byCategory: { name: string; value: number }[];
  byStatus: { name: string; value: number }[];
  topDrivers: { name: string; value: number }[];
  recentParts: any[];
  recentActivity: any[];
}
interface Insight { type: string; title: string; detail: string; }

type Decoded = {
  partNumber: string;
  found: boolean;
  productName?: string;
  status?: string;
  id?: number;
  segments: { key: string; label: string; code: string; description: string }[];
};

export default function Dashboard() {
  const nav = useNavigate();
  const { user } = useAuth();
  const [data, setData] = useState<DashData | null>(null);
  const [insights, setInsights] = useState<Insight[]>([]);
  const [decodeInput, setDecodeInput] = useState("");
  const [decoded, setDecoded] = useState<Decoded | null>(null);
  const [decoding, setDecoding] = useState(false);

  useEffect(() => {
    api.get<DashData>("/dashboard").then(setData).catch(() => {});
    api.get<{ insights: Insight[] }>("/ai/insights").then((r) => setInsights(r.insights)).catch(() => {});
  }, []);

  const decode = async () => {
    const pn = decodeInput.trim();
    if (!pn || decoding) return;
    setDecoding(true);
    setDecoded(null);
    try {
      setDecoded(await api.post<Decoded>("/ai/decode", { partNumber: pn }));
    } catch { setDecoded({ partNumber: pn, found: false, segments: [] }); }
    finally { setDecoding(false); }
  };

  if (!data) return <Layout title="Dashboard"><Spinner /></Layout>;
  const s = data.stats;
  const maxCat = Math.max(...data.byCategory.map((c) => c.value), 1);
  const maxDrv = Math.max(...data.topDrivers.map((c) => c.value), 1);

  const tiles = [
    { k: "Total Part Numbers", v: s.parts, ico: "☰" },
    { k: "Active Parts", v: s.active, ico: "✓" },
    { k: "Companies", v: s.companies, ico: "🏢" },
    { k: "Products", v: s.products, ico: "📦" },
    { k: "Segment Values", v: s.segmentValues, ico: "≣" },
    { k: "Drafts", v: s.drafts, ico: "✎" },
  ];

  return (
    <Layout title={`Welcome back, ${user?.displayName?.split(" ")[0] || ""}`} subtitle="Overview of your IKIO part-number registry."
      actions={<button className="btn primary" onClick={() => nav("/builder")}>+ Create New Part Number</button>}>

      <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", marginBottom: 20 }}>
        {tiles.map((t) => (
          <div key={t.k} className="stat">
            <div className="k"><span className="ico">{t.ico}</span>{t.k}</div>
            <div className="v">{t.v}</div>
          </div>
        ))}
      </div>

      {/* Decode any part number — from a label, an email, a legacy sheet… */}
      <div className="card card-pad" style={{ marginBottom: 20 }}>
        <h3 style={{ marginBottom: 4 }}>🔍 Decode a Part Number</h3>
        <div className="muted" style={{ fontSize: 12.5, marginBottom: 10 }}>
          Paste any part number to see what each segment means — works even if it isn't in the registry yet.
        </div>
        <div className="flex" style={{ gap: 8 }}>
          <input className="input mono" style={{ flex: 1 }} placeholder="e.g. IK-UHB3-02-S0240-MV-D-CCT-WD-01-BK-BFU"
            value={decodeInput} onChange={(e) => setDecodeInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && decode()} />
          <button className="btn primary" onClick={decode} disabled={decoding || !decodeInput.trim()}>
            {decoding ? "Decoding…" : "Decode"}
          </button>
        </div>
        {decoded && (
          <div style={{ marginTop: 14 }}>
            {decoded.segments.length === 0 ? (
              <div className="insight warning"><div className="d">Couldn't decode “{decoded.partNumber}” — check the format.</div></div>
            ) : (
              <>
                <div className="spread" style={{ marginBottom: 10 }}>
                  <span className="mono" style={{ fontWeight: 700 }}>{decoded.partNumber}</span>
                  {decoded.found
                    ? <span className="flex" style={{ gap: 8 }}>
                        <StatusBadge status={decoded.status} />
                        <button className="btn sm" onClick={() => nav(`/part/${decoded.id}`)}>Open “{decoded.productName}” ↗</button>
                      </span>
                    : <span className="badge amber">Not in registry — best-effort decode</span>}
                </div>
                <div className="seg-chips">
                  {decoded.segments.map((c, i) => (
                    <div key={i} className="flex" style={{ gap: 6 }}>
                      <div className="seg-chip" title={c.description}>
                        <div className="code">{c.code}</div>
                        <div className="lab">{c.label}</div>
                      </div>
                      {i < decoded.segments.length - 1 && <div className="seg-sep">–</div>}
                    </div>
                  ))}
                </div>
                <div className="grid" style={{ gap: 4, marginTop: 10 }}>
                  {decoded.segments.map((c, i) => (
                    <div key={i} className="kv" style={{ padding: "3px 0" }}>
                      <span className="k">{c.label} · <span className="mono">{c.code}</span></span>
                      <span className="v">{c.description}</span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        )}
      </div>

      <div className="row" style={{ alignItems: "flex-start", marginBottom: 20 }}>
        <div className="card card-pad" style={{ flex: 1 }}>
          <h3 style={{ marginBottom: 14 }}>Parts by Category</h3>
          {data.byCategory.map((c) => (
            <div key={c.name} style={{ marginBottom: 11 }}>
              <div className="spread" style={{ fontSize: 12.5, marginBottom: 4 }}><span>{c.name}</span><span className="muted">{c.value}</span></div>
              <div className="bar-track"><div className="bar-fill" style={{ width: `${(c.value / maxCat) * 100}%` }} /></div>
            </div>
          ))}
        </div>
        <div className="card card-pad" style={{ flex: 1 }}>
          <h3 style={{ marginBottom: 14 }}>Top Drivers</h3>
          {data.topDrivers.map((c) => (
            <div key={c.name} style={{ marginBottom: 11 }}>
              <div className="spread" style={{ fontSize: 12.5, marginBottom: 4 }}><span className="mono">Driver {c.name}</span><span className="muted">{c.value} parts</span></div>
              <div className="bar-track"><div className="bar-fill" style={{ width: `${(c.value / maxDrv) * 100}%` }} /></div>
            </div>
          ))}
        </div>
      </div>

      <div className="row" style={{ alignItems: "flex-start" }}>
        <div className="card" style={{ flex: 1.3 }}>
          <div className="card-head"><h3>Recent Part Numbers</h3></div>
          <div className="table-wrap">
            <table className="tbl">
              <thead><tr><th>Part Number</th><th>Product</th><th>Company</th><th>Status</th></tr></thead>
              <tbody>
                {data.recentParts.map((p) => (
                  <tr key={p.id} style={{ cursor: "pointer" }} onClick={() => nav(`/part/${p.id}`)}>
                    <td><span className="mono" style={{ fontWeight: 600 }}>{p.part_number}</span></td>
                    <td>{p.product_name}</td>
                    <td className="muted">{p.company_name || "—"}</td>
                    <td><StatusBadge status={p.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="card" style={{ flex: 1 }}>
          <div className="card-head"><h3>✦ AI Insights</h3><span className="badge green" style={{ marginLeft: "auto" }}>Live</span></div>
          <div className="card-pad grid" style={{ gap: 10 }}>
            {insights.length === 0 ? <div className="muted">Analyzing your registry…</div> :
              insights.map((i, idx) => (
                <div key={idx} className={`insight ${i.type}`}>
                  <div className="t">{i.title}</div><div className="d">{i.detail}</div>
                </div>
              ))}
          </div>
        </div>
      </div>
    </Layout>
  );
}
