import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Layout } from "../components/Layout";
import { StatusBadge, Spinner } from "../components/ui";
import { api, fileUrl } from "../lib/api";
import { useAuth } from "../lib/auth";

type NV = { name: string; value: number; id?: number };
interface DashData {
  stats: { parts: number; active: number; drafts: number; deprecated: number; companies: number; products: number; segmentValues: number; withImage: number; withSpec: number };
  byCategory: NV[];
  byStatus: NV[];
  bySeries: NV[];
  byCct: NV[];
  byFinish: NV[];
  byVoltage: NV[];
  topDrivers: NV[];
  topCompanies: NV[];
  monthlyTrend: { ym: string; value: number }[];
  recentParts: any[];
  recentActivity: any[];
}
interface Insight { type: string; title: string; detail: string; }
type Decoded = { partNumber: string; found: boolean; productName?: string; status?: string; id?: number; segments: { key: string; label: string; code: string; description: string }[] };

const PALETTE = ["#1f8a5b", "#175cd3", "#b54708", "#7a5af8", "#0e9384", "#e0447b", "#dd8a0b", "#2e90fa"];
const STATUS_COLOR: Record<string, string> = { active: "#1f8a5b", draft: "#b54708", deprecated: "#98a2b3", temporary: "#175cd3", inactive: "#98a2b3" };

export default function Dashboard() {
  const nav = useNavigate();
  const { user } = useAuth();
  const [data, setData] = useState<DashData | null>(null);
  const [insights, setInsights] = useState<Insight[]>([]);
  const [mounted, setMounted] = useState(false);
  const [activeSlice, setActiveSlice] = useState(-1);

  const [decodeInput, setDecodeInput] = useState("");
  const [decoded, setDecoded] = useState<Decoded | null>(null);
  const [decoding, setDecoding] = useState(false);

  useEffect(() => {
    api.get<DashData>("/dashboard").then((d) => { setData(d); setTimeout(() => setMounted(true), 60); }).catch(() => {});
    api.get<{ insights: Insight[] }>("/ai/insights").then((r) => setInsights(r.insights)).catch(() => {});
  }, []);

  const decode = async () => {
    const pn = decodeInput.trim();
    if (!pn || decoding) return;
    setDecoding(true); setDecoded(null);
    try { setDecoded(await api.post<Decoded>("/ai/decode", { partNumber: pn })); }
    catch { setDecoded({ partNumber: pn, found: false, segments: [] }); }
    finally { setDecoding(false); }
  };

  const monthLabels = useMemo(() => {
    const fmt = (ym: string) => { const [y, m] = ym.split("-"); return new Date(Number(y), Number(m) - 1, 1).toLocaleString(undefined, { month: "short" }); };
    return (data?.monthlyTrend || []).map((t) => ({ ...t, label: fmt(t.ym) }));
  }, [data]);

  if (!data) return <Layout title="Dashboard"><Spinner /></Layout>;
  const s = data.stats;

  const tiles = [
    { k: "Total Part Numbers", v: s.parts, ico: "☰", go: "/library" },
    { k: "Active", v: s.active, ico: "✓", go: "/library?status=active" },
    { k: "Drafts", v: s.drafts, ico: "✎", go: "/library?status=draft" },
    { k: "Deprecated", v: s.deprecated, ico: "⌫", go: "/library?status=deprecated" },
    { k: "Companies", v: s.companies, ico: "🏢", go: "/companies" },
    { k: "Products", v: s.products, ico: "📦", go: "/products" },
    { k: "Segment Values", v: s.segmentValues, ico: "≣", go: "/values" },
    { k: "With Image", v: s.withImage, ico: "🖼", go: "/library" },
  ];

  return (
    <Layout title={`Welcome back, ${user?.displayName?.split(" ")[0] || ""}`} subtitle="Live overview of your IKIO part-number registry."
      actions={<button className="btn primary" onClick={() => nav("/builder")}>+ Create New Part Number</button>}>

      {/* KPI tiles */}
      <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(165px, 1fr))", marginBottom: 18 }}>
        {tiles.map((t) => (
          <div key={t.k} className="stat click" onClick={() => nav(t.go)}>
            <div className="k"><span className="ico">{t.ico}</span>{t.k}</div>
            <div className="v">{t.v}</div>
          </div>
        ))}
      </div>

      {/* Decode box */}
      <div className="card card-pad" style={{ marginBottom: 18 }}>
        <h3 style={{ marginBottom: 4 }}>🔍 Decode a Part Number</h3>
        <div className="muted" style={{ fontSize: 12.5, marginBottom: 10 }}>Paste any part number to see what each segment means — works even if it isn't in the registry yet.</div>
        <div className="flex" style={{ gap: 8 }}>
          <input className="input mono" style={{ flex: 1 }} placeholder="e.g. IK-UHB3-02-S0240-MV-D-CCT-WD-01-BK-BFU"
            value={decodeInput} onChange={(e) => setDecodeInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && decode()} />
          <button className="btn primary" onClick={decode} disabled={decoding || !decodeInput.trim()}>{decoding ? "Decoding…" : "Decode"}</button>
        </div>
        {decoded && decoded.segments.length > 0 && (
          <div style={{ marginTop: 14 }}>
            <div className="spread" style={{ marginBottom: 10 }}>
              <span className="mono" style={{ fontWeight: 700 }}>{decoded.partNumber}</span>
              {decoded.found
                ? <span className="flex" style={{ gap: 8 }}><StatusBadge status={decoded.status} /><button className="btn sm" onClick={() => nav(`/part/${decoded.id}`)}>Open “{decoded.productName}” ↗</button></span>
                : <span className="badge amber">Not in registry — best-effort decode</span>}
            </div>
            <div className="seg-chips">
              {decoded.segments.map((c, i) => (
                <div key={i} className="flex" style={{ gap: 6 }}>
                  <div className="seg-chip" title={c.description}><div className="code">{c.code}</div><div className="lab">{c.label}</div></div>
                  {i < decoded.segments.length - 1 && <div className="seg-sep">–</div>}
                </div>
              ))}
            </div>
          </div>
        )}
        {decoded && decoded.segments.length === 0 && <div className="insight warning" style={{ marginTop: 12 }}><div className="d">Couldn't decode “{decoded.partNumber}”.</div></div>}
      </div>

      {/* Status donut + creation trend */}
      <div className="row" style={{ alignItems: "stretch", marginBottom: 18 }}>
        <div className="card" style={{ flex: 1 }}>
          <div className="card-head"><h3>Status Breakdown</h3></div>
          <div className="card-pad flex" style={{ gap: 20, alignItems: "center", flexWrap: "wrap" }}>
            <Donut data={data.byStatus} active={activeSlice} setActive={setActiveSlice}
              colorFor={(n) => STATUS_COLOR[n.toLowerCase()] || "#98a2b3"} total={s.parts}
              onSlice={(d) => nav(`/library?status=${encodeURIComponent(d.name)}`)} />
            <div className="chart-legend" style={{ flexDirection: "column", flex: 1, minWidth: 160 }}>
              {data.byStatus.map((d, i) => (
                <div key={d.name} className={"legend-item" + (activeSlice === i ? " on" : "")}
                  onMouseEnter={() => setActiveSlice(i)} onMouseLeave={() => setActiveSlice(-1)}
                  onClick={() => nav(`/library?status=${encodeURIComponent(d.name)}`)}>
                  <span className="legend-dot" style={{ background: STATUS_COLOR[d.name.toLowerCase()] || "#98a2b3" }} />
                  <span style={{ textTransform: "capitalize" }}>{d.name}</span>
                  <span className="lv">{d.value} · {Math.round((d.value / (s.parts || 1)) * 100)}%</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="card" style={{ flex: 1.2 }}>
          <div className="card-head"><h3>Part Numbers Created</h3><span className="muted" style={{ marginLeft: "auto", fontSize: 12 }}>{monthLabels.length > 1 ? "by month" : "all-time"}</span></div>
          <div className="card-pad">
            {monthLabels.length >= 2 ? (
              <TrendBars data={monthLabels} mounted={mounted} />
            ) : (
              <div className="flex" style={{ gap: 16, alignItems: "center", padding: "16px 0" }}>
                <div style={{ fontSize: 40, fontWeight: 700, color: "var(--green)" }}>{s.parts}</div>
                <div className="muted" style={{ fontSize: 13 }}>part numbers so far.<br />A month-by-month trend appears here as parts are created over time.</div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Category + Company bars */}
      <div className="row" style={{ alignItems: "flex-start", marginBottom: 18 }}>
        <RankCard title="Parts by Category" sub="Click a bar to open that category" data={data.byCategory} mounted={mounted}
          color={(i) => PALETTE[i % PALETTE.length]} onClick={(d) => nav(`/library?category=${encodeURIComponent(d.name)}`)} />
        <RankCard title="Top Companies" sub="Parts assigned per company" data={data.topCompanies} mounted={mounted}
          color="#175cd3" onClick={(d) => d.id && nav(`/library?company=${d.id}`)} />
      </div>

      {/* Segment distributions */}
      <div className="row" style={{ alignItems: "flex-start", marginBottom: 18 }}>
        <RankCard title="CCT" sub="Colour temperature mix" data={data.byCct} mounted={mounted} color="#dd8a0b" compact />
        <RankCard title="Finish" sub="Housing colour mix" data={data.byFinish} mounted={mounted} color="#7a5af8" compact />
        <RankCard title="Voltage Range" sub="Input voltage mix" data={data.byVoltage} mounted={mounted} color="#0e9384" compact />
      </div>

      {/* Recent parts + AI insights */}
      <div className="row" style={{ alignItems: "flex-start" }}>
        <div className="card" style={{ flex: 1.3 }}>
          <div className="card-head"><h3>Recent Part Numbers</h3><button className="btn sm" style={{ marginLeft: "auto" }} onClick={() => nav("/library")}>View all →</button></div>
          <div className="table-wrap">
            <table className="tbl">
              <thead><tr><th></th><th>Part Number</th><th>Product</th><th>Company</th><th>Status</th></tr></thead>
              <tbody>
                {data.recentParts.map((p) => (
                  <tr key={p.id} style={{ cursor: "pointer" }} onClick={() => nav(`/part/${p.id}`)}>
                    <td style={{ width: 44 }}>{p.image ? <img className="mini-thumb" src={fileUrl(p.image)} alt="" /> : <span className="muted">—</span>}</td>
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
                <div key={idx} className={`insight ${i.type}`}><div className="t">{i.title}</div><div className="d">{i.detail}</div></div>
              ))}
          </div>
        </div>
      </div>
    </Layout>
  );
}

// ─── Interactive donut (pure SVG) ────────────────────────────────────────────
function Donut({ data, active, setActive, colorFor, total, onSlice }: {
  data: NV[]; active: number; setActive: (i: number) => void; colorFor: (name: string, i: number) => string; total: number; onSlice: (d: NV) => void;
}) {
  const size = 172, thickness = 26, r = (size - thickness) / 2, c = size / 2, circ = 2 * Math.PI * r;
  const sum = data.reduce((a, d) => a + d.value, 0) || 1;
  let offset = 0;
  const shown = active >= 0 && data[active] ? data[active] : null;
  return (
    <div style={{ position: "relative", width: size, height: size, flexShrink: 0 }}>
      <svg width={size} height={size}>
        <circle cx={c} cy={c} r={r} fill="none" stroke="var(--line-2)" strokeWidth={thickness} />
        {data.map((d, i) => {
          const len = (d.value / sum) * circ;
          const seg = (
            <circle key={i} cx={c} cy={c} r={r} fill="none" stroke={colorFor(d.name, i)}
              strokeWidth={active === i ? thickness + 6 : thickness}
              strokeDasharray={`${len} ${circ - len}`} strokeDashoffset={-offset}
              transform={`rotate(-90 ${c} ${c})`} strokeLinecap="butt"
              style={{ transition: "stroke-width .18s ease", cursor: "pointer" }}
              onMouseEnter={() => setActive(i)} onMouseLeave={() => setActive(-1)} onClick={() => onSlice(d)} />
          );
          offset += len; return seg;
        })}
      </svg>
      <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", textAlign: "center", pointerEvents: "none" }}>
        <div>
          <div style={{ fontSize: 30, fontWeight: 700, lineHeight: 1 }}>{shown ? shown.value : total}</div>
          <div className="muted" style={{ fontSize: 10.5, textTransform: "uppercase", letterSpacing: .6, marginTop: 4 }}>{shown ? shown.name : "Total"}</div>
        </div>
      </div>
    </div>
  );
}

// ─── Ranked horizontal bars ──────────────────────────────────────────────────
function RankCard({ title, sub, data, mounted, color, onClick, compact }: {
  title: string; sub?: string; data: NV[]; mounted: boolean; color: string | ((i: number) => string); onClick?: (d: NV) => void; compact?: boolean;
}) {
  const max = Math.max(...data.map((d) => d.value), 1);
  const col = (i: number) => (typeof color === "function" ? color(i) : color);
  return (
    <div className="card" style={{ flex: 1 }}>
      <div className="card-head"><div><h3>{title}</h3>{sub && <div className="sub">{sub}</div>}</div></div>
      <div className="card-pad" style={{ paddingTop: 12 }}>
        {data.length === 0 ? <div className="muted" style={{ fontSize: 12.5 }}>No data yet.</div> : data.map((d, i) => (
          <div key={i} className={"rank-row" + (onClick ? " click" : "")} onClick={() => onClick?.(d)} title={onClick ? "Open in Library" : ""}>
            <span className="rank-name mono" style={{ fontWeight: compact ? 600 : 500 }}>{d.name}</span>
            <div className="rank-track"><div className="rank-fill" style={{ width: mounted ? `${(d.value / max) * 100}%` : "0%", background: col(i) }} /></div>
            <span className="rank-val">{d.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Vertical trend bars ─────────────────────────────────────────────────────
function TrendBars({ data, mounted }: { data: { label: string; value: number; ym: string }[]; mounted: boolean }) {
  const max = Math.max(...data.map((d) => d.value), 1);
  const recent = data.slice(-12);
  return (
    <div className="tbars">
      {recent.map((d, i) => (
        <div key={i} className="tbar" title={`${d.value} created`}>
          <span className="cnt">{d.value}</span>
          <div className="col" style={{ height: mounted ? `${Math.max((d.value / max) * 100, 4)}%` : "0%" }} />
          <span className="lab">{d.label}</span>
        </div>
      ))}
    </div>
  );
}
