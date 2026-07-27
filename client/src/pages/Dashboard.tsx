import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Layout } from "../components/Layout";
import { StatusBadge } from "../components/ui";
import { Icon } from "../components/Icon";
import { api, fileUrl } from "../lib/api";
import { useAuth } from "../lib/auth";

type NV = { name: string; value: number; id?: number };
interface DashData {
  stats: { parts: number; active: number; drafts: number; deprecated: number; companies: number; products: number; segmentValues: number; withImage: number; withSpec: number };
  byCategory: NV[]; byStatus: NV[]; bySeries: NV[]; byCct: NV[]; byFinish: NV[]; byVoltage: NV[];
  topDrivers: NV[]; topCompanies: NV[]; monthlyTrend: { ym: string; value: number }[]; recentParts: any[]; recentActivity: any[];
}
interface Insight { type: string; title: string; detail: string; }
type Decoded = { partNumber: string; found: boolean; productName?: string; status?: string; id?: number; segments: { key: string; label: string; code: string; description: string }[] };

const PALETTE = ["#1f8a5b", "#2e6bd6", "#6941c6", "#b54708", "#0e9384", "#c11574", "#dd8a0b", "#3538cd"];
const STATUS_COLOR: Record<string, string> = { active: "#1f8a5b", draft: "#b54708", deprecated: "#98a2b3", temporary: "#2e6bd6", inactive: "#98a2b3" };

export default function Dashboard() {
  const nav = useNavigate();
  const { user } = useAuth();
  const [data, setData] = useState<DashData | null>(null);
  const [insights, setInsights] = useState<Insight[]>([]);
  const [mounted, setMounted] = useState(false);
  const [activeSlice, setActiveSlice] = useState(-1);
  const [dim, setDim] = useState("category");

  const [decodeInput, setDecodeInput] = useState("");
  const [decoded, setDecoded] = useState<Decoded | null>(null);
  const [decoding, setDecoding] = useState(false);

  useEffect(() => {
    api.get<DashData>("/dashboard").then((d) => { setData(d); setTimeout(() => setMounted(true), 80); }).catch(() => {});
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

  const dims = useMemo(() => data ? ([
    { key: "category", label: "Category", data: data.byCategory, click: (d: NV) => nav(`/library?category=${encodeURIComponent(d.name)}`) },
    { key: "series", label: "Series", data: data.bySeries, click: (d: NV) => nav(`/library?search=${encodeURIComponent(d.name)}`) },
    { key: "driver", label: "Driver", data: data.topDrivers, click: (d: NV) => nav(`/library?search=${encodeURIComponent(d.name)}`) },
    { key: "cct", label: "CCT", data: data.byCct, click: (d: NV) => nav(`/library?search=${encodeURIComponent(d.name)}`) },
    { key: "finish", label: "Finish", data: data.byFinish, click: (d: NV) => nav(`/library?search=${encodeURIComponent(d.name)}`) },
    { key: "voltage", label: "Voltage", data: data.byVoltage, click: (d: NV) => nav(`/library?search=${encodeURIComponent(d.name)}`) },
  ]) : [], [data, nav]);

  if (!data) return <Layout title="Dashboard"><DashSkeleton /></Layout>;
  const s = data.stats;
  const pct = (n: number) => (s.parts ? Math.round((n / s.parts) * 100) : 0);
  const health = s.parts === 0
    ? { cls: "amber", text: "Let's create your first part number" }
    : s.drafts > 0 ? { cls: "amber", text: `${s.drafts} draft${s.drafts > 1 ? "s" : ""} to review` }
      : { cls: "green", text: "All part numbers published" };
  const cur = dims.find((d) => d.key === dim) || dims[0];

  const kpis = [
    { lbl: "Total Part Numbers", val: s.parts, icon: "layers", tint: "var(--green-50)", fg: "var(--green)", sub: <>across <b>{data.byCategory.length}</b> categories</>, go: "/library" },
    { lbl: "Active", val: s.active, icon: "check", tint: "var(--green-50)", fg: "var(--green)", sub: <><b>{pct(s.active)}%</b> of the registry</>, go: "/library?status=active" },
    { lbl: "Companies", val: s.companies, icon: "building", tint: "#eff4ff", fg: "#2e6bd6", sub: <><b>{data.topCompanies.length}</b> with parts assigned</>, go: "/companies" },
    { lbl: "Products", val: s.products, icon: "box", tint: "#f4f3ff", fg: "#6941c6", sub: <><b>{data.bySeries.length}</b> distinct series</>, go: "/products" },
  ];

  return (
    <Layout title={`Welcome back, ${user?.displayName?.split(" ")[0] || ""}`} subtitle="Live overview of your IKIO part-number registry."
      actions={<button className="btn primary" onClick={() => nav("/builder")}><Icon name="plus" size={16} /> Create New Part Number</button>}>

      {/* Summary */}
      <div className="hero">
        <div className="flex" style={{ gap: 10, flexWrap: "wrap" }}>
          <h2 style={{ fontSize: 18 }}>Your part-number registry at a glance</h2>
          <span className={`badge ${health.cls} dot`}>{health.text}</span>
        </div>
        <div className="lead">
          <b>{s.parts}</b> part numbers · <b>{s.active}</b> active ({pct(s.active)}%) · <b>{s.drafts}</b> draft · <b>{s.deprecated}</b> deprecated ·
          spanning <b>{s.companies}</b> companies and <b>{s.products}</b> products. Every code is built from the same segments, so it stays consistent no matter who creates it.
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", marginBottom: 18 }}>
        {kpis.map((k) => (
          <div key={k.lbl} className="kpi" onClick={() => nav(k.go)}>
            <div className="top">
              <span className="lbl">{k.lbl}</span>
              <span className="ic" style={{ background: k.tint, color: k.fg }}><Icon name={k.icon} size={19} /></span>
            </div>
            <div className="val">{k.val}</div>
            <div className="sub">{k.sub}</div>
          </div>
        ))}
      </div>

      {/* Distribution explorer + status donut */}
      <div className="row" style={{ alignItems: "stretch", marginBottom: 18 }}>
        <div className="card" style={{ flex: 1.5 }}>
          <div className="card-head" style={{ flexWrap: "wrap", gap: 10 }}>
            <div><h3>Distribution Explorer</h3><div className="sub">Break the registry down by any attribute — click a bar to open those parts</div></div>
            <div className="segctl" style={{ marginLeft: "auto" }}>
              {dims.map((d) => <button key={d.key} className={dim === d.key ? "on" : ""} onClick={() => setDim(d.key)}>{d.label}</button>)}
            </div>
          </div>
          <div className="card-pad" style={{ paddingTop: 14 }}>
            <Bars data={cur.data} mounted={mounted} onClick={cur.click} colorFn={(i) => PALETTE[i % PALETTE.length]} />
          </div>
        </div>

        <div className="card" style={{ flex: 1 }}>
          <div className="card-head"><h3>Status Breakdown</h3></div>
          <div className="card-pad" style={{ display: "grid", placeItems: "center", gap: 16 }}>
            <Donut data={data.byStatus} active={activeSlice} setActive={setActiveSlice} total={s.parts}
              colorFor={(n) => STATUS_COLOR[n.toLowerCase()] || "#98a2b3"} onSlice={(d) => nav(`/library?status=${encodeURIComponent(d.name)}`)} />
            <div className="chart-legend" style={{ justifyContent: "center", width: "100%" }}>
              {data.byStatus.map((d, i) => (
                <div key={d.name} className={"legend-item" + (activeSlice === i ? " on" : "")}
                  onMouseEnter={() => setActiveSlice(i)} onMouseLeave={() => setActiveSlice(-1)}
                  onClick={() => nav(`/library?status=${encodeURIComponent(d.name)}`)}>
                  <span className="legend-dot" style={{ background: STATUS_COLOR[d.name.toLowerCase()] || "#98a2b3" }} />
                  <span style={{ textTransform: "capitalize" }}>{d.name}</span>
                  <span className="lv">{pct(d.value)}%</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Completeness gauges */}
      <div className="card" style={{ marginBottom: 18 }}>
        <div className="card-head"><h3>Data Completeness</h3><div className="sub">How much of the catalogue is fully documented</div></div>
        <div className="card-pad">
          <div className="gauge-wrap">
            <Gauge pct={pct(s.active)} mounted={mounted} color="#1f8a5b" label="Published" sub={`${s.active} of ${s.parts} active`} />
            <Gauge pct={pct(s.withSpec)} mounted={mounted} color="#2e6bd6" label="Has Spec Sheet" sub={`${s.withSpec} of ${s.parts} parts`} />
            <Gauge pct={pct(s.withImage)} mounted={mounted} color="#6941c6" label="Has Image" sub={`${s.withImage} of ${s.parts} parts`} />
          </div>
        </div>
      </div>

      {/* Decode box */}
      <div id="decode-card" className="card card-pad" style={{ marginBottom: 18 }}>
        <h3 style={{ marginBottom: 4, display: "flex", alignItems: "center", gap: 8 }}><Icon name="search" size={17} /> Decode a Part Number</h3>
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
                ? <span className="flex" style={{ gap: 8 }}><StatusBadge status={decoded.status} /><button className="btn sm" onClick={() => nav(`/part/${decoded.id}`)}>Open “{decoded.productName}”</button></span>
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

      {/* Recent parts + AI insights */}
      <div className="row" style={{ alignItems: "flex-start" }}>
        <div className="card" style={{ flex: 1.3 }}>
          <div className="card-head"><h3>Recent Part Numbers</h3><button className="btn sm" style={{ marginLeft: "auto" }} onClick={() => nav("/library")}>View all <Icon name="chevronRight" size={14} /></button></div>
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
          <div className="card-head"><h3 style={{ display: "flex", alignItems: "center", gap: 8 }}><Icon name="star" size={16} /> AI Insights</h3><span className="badge green" style={{ marginLeft: "auto" }}>Live</span></div>
          <div className="card-pad grid" style={{ gap: 10 }}>
            {insights.length === 0 ? <div className="muted">Analyzing your registry…</div> :
              insights.map((i, idx) => (<div key={idx} className={`insight ${i.type}`}><div className="t">{i.title}</div><div className="d">{i.detail}</div></div>))}
          </div>
        </div>
      </div>
    </Layout>
  );
}

// ─── Horizontal ranked bars ──────────────────────────────────────────────────
function Bars({ data, mounted, onClick, colorFn }: { data: NV[]; mounted: boolean; onClick?: (d: NV) => void; colorFn: (i: number) => string }) {
  const [pctMode, setPctMode] = useState(false);
  const max = Math.max(...data.map((d) => d.value), 1);
  const sum = data.reduce((a, d) => a + d.value, 0) || 1;
  return (
    <>
      <div className="spread" style={{ marginBottom: 8 }}>
        <span className="muted" style={{ fontSize: 12 }}>{data.length} values</span>
        <div className="seg-toggle"><button className={pctMode ? "" : "on"} onClick={() => setPctMode(false)}>#</button><button className={pctMode ? "on" : ""} onClick={() => setPctMode(true)}>%</button></div>
      </div>
      {data.length === 0 ? <div className="muted" style={{ fontSize: 12.5 }}>No data yet.</div> : data.map((d, i) => (
        <div key={i} className={"rank2" + (onClick ? " click" : "")} onClick={() => onClick?.(d)} title={onClick ? "Open in Library" : ""}>
          <div className="rank2-top">
            <span className="rank2-name">{d.name}</span>
            <span className="rank2-val">{pctMode ? `${Math.round((d.value / sum) * 100)}%` : d.value}</span>
          </div>
          <div className="rank-track"><div className="rank-fill" style={{ width: mounted ? `${(d.value / max) * 100}%` : "0%", background: colorFn(i) }} /></div>
        </div>
      ))}
    </>
  );
}

// ─── Interactive donut ───────────────────────────────────────────────────────
function Donut({ data, active, setActive, colorFor, total, onSlice }: {
  data: NV[]; active: number; setActive: (i: number) => void; colorFor: (name: string, i: number) => string; total: number; onSlice: (d: NV) => void;
}) {
  const size = 176, thickness = 26, r = (size - thickness) / 2, c = size / 2, circ = 2 * Math.PI * r;
  const sum = data.reduce((a, d) => a + d.value, 0) || 1;
  let offset = 0;
  const shown = active >= 0 && data[active] ? data[active] : null;
  return (
    <div style={{ position: "relative", width: size, height: size }}>
      <svg width={size} height={size}>
        <circle cx={c} cy={c} r={r} fill="none" stroke="var(--line-2)" strokeWidth={thickness} />
        {data.map((d, i) => {
          const len = (d.value / sum) * circ;
          const seg = (
            <circle key={i} cx={c} cy={c} r={r} fill="none" stroke={colorFor(d.name, i)}
              strokeWidth={active === i ? thickness + 6 : thickness}
              strokeDasharray={`${len} ${circ - len}`} strokeDashoffset={-offset} transform={`rotate(-90 ${c} ${c})`}
              style={{ transition: "stroke-width .18s ease", cursor: "pointer" }}
              onMouseEnter={() => setActive(i)} onMouseLeave={() => setActive(-1)} onClick={() => onSlice(d)}>
              <title>{d.name}: {d.value}</title>
            </circle>
          );
          offset += len; return seg;
        })}
      </svg>
      <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", textAlign: "center", pointerEvents: "none" }}>
        <div>
          <div style={{ fontSize: 30, fontWeight: 800, lineHeight: 1 }}>{shown ? shown.value : total}</div>
          <div className="muted" style={{ fontSize: 10.5, textTransform: "uppercase", letterSpacing: .6, marginTop: 4 }}>{shown ? shown.name : "Total"}</div>
        </div>
      </div>
    </div>
  );
}

// ─── Radial progress gauge ───────────────────────────────────────────────────
function Gauge({ pct, mounted, color, label, sub }: { pct: number; mounted: boolean; color: string; label: string; sub: string }) {
  const size = 112, sw = 11, r = (size - sw) / 2, c = size / 2, circ = 2 * Math.PI * r;
  const dash = (mounted ? pct : 0) / 100 * circ;
  return (
    <div className="gauge">
      <svg width={size} height={size} style={{ display: "block", margin: "0 auto" }}>
        <circle cx={c} cy={c} r={r} fill="none" stroke="var(--line-2)" strokeWidth={sw} />
        <circle cx={c} cy={c} r={r} fill="none" stroke={color} strokeWidth={sw} strokeLinecap="round"
          strokeDasharray={`${dash} ${circ - dash}`} transform={`rotate(-90 ${c} ${c})`}
          style={{ transition: "stroke-dasharray .9s cubic-bezier(.4,0,.2,1)" }} />
        <text x={c} y={c} textAnchor="middle" dominantBaseline="central" style={{ fontSize: 23, fontWeight: 800, fill: "var(--ink)" }}>{pct}%</text>
      </svg>
      <div className="glbl">{label}</div>
      <div className="gsub">{sub}</div>
    </div>
  );
}

// ─── Loading skeleton ────────────────────────────────────────────────────────
function DashSkeleton() {
  return (
    <div>
      <div className="skel" style={{ height: 130, marginBottom: 18 }} />
      <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", marginBottom: 18 }}>
        {[0, 1, 2, 3].map((i) => <div key={i} className="skel" style={{ height: 118 }} />)}
      </div>
      <div className="row" style={{ marginBottom: 18 }}>
        <div className="skel" style={{ height: 320, flex: 1.5 }} />
        <div className="skel" style={{ height: 320, flex: 1 }} />
      </div>
      <div className="skel" style={{ height: 190 }} />
    </div>
  );
}
