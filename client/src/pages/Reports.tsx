import { useEffect, useState } from "react";
import { Layout } from "../components/Layout";
import { Spinner } from "../components/ui";
import { api } from "../lib/api";

interface DashData {
  stats: any;
  byCategory: { name: string; value: number }[];
  byStatus: { name: string; value: number }[];
  topDrivers: { name: string; value: number }[];
}

function BarBlock({ title, data, unit }: { title: string; data: { name: string; value: number }[]; unit?: string }) {
  const max = Math.max(...data.map((d) => d.value), 1);
  return (
    <div className="card card-pad" style={{ flex: 1 }}>
      <h3 style={{ marginBottom: 14 }}>{title}</h3>
      {data.map((d) => (
        <div key={d.name} style={{ marginBottom: 11 }}>
          <div className="spread" style={{ fontSize: 12.5, marginBottom: 4 }}><span>{d.name}</span><span className="muted">{d.value}{unit ? ` ${unit}` : ""}</span></div>
          <div className="bar-track"><div className="bar-fill" style={{ width: `${(d.value / max) * 100}%` }} /></div>
        </div>
      ))}
    </div>
  );
}

export default function Reports() {
  const [data, setData] = useState<DashData | null>(null);
  useEffect(() => { api.get<DashData>("/dashboard").then(setData).catch(() => {}); }, []);
  if (!data) return <Layout title="Reports"><Spinner /></Layout>;

  return (
    <Layout title="Reports" subtitle="Analytics across your part-number registry."
      actions={<a className="btn" href="/api/export/parts.csv">⬇ Export CSV</a>}>
      <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", marginBottom: 20 }}>
        {[
          { k: "Total Parts", v: data.stats.parts }, { k: "Active", v: data.stats.active },
          { k: "Drafts", v: data.stats.drafts }, { k: "Companies", v: data.stats.companies },
          { k: "Products", v: data.stats.products }, { k: "Segment Values", v: data.stats.segmentValues },
        ].map((t) => <div key={t.k} className="stat"><div className="k">{t.k}</div><div className="v">{t.v}</div></div>)}
      </div>
      <div className="row" style={{ alignItems: "flex-start", marginBottom: 20 }}>
        <BarBlock title="Parts by Category" data={data.byCategory} />
        <BarBlock title="Parts by Status" data={data.byStatus} />
      </div>
      <div className="row" style={{ alignItems: "flex-start" }}>
        <BarBlock title="Top Drivers" data={data.topDrivers} unit="parts" />
      </div>
    </Layout>
  );
}
