import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Layout } from "../components/Layout";
import { Spinner } from "../components/ui";
import { api } from "../lib/api";
import { SegmentDef } from "../lib/types";

export default function Attributes() {
  const nav = useNavigate();
  const [defs, setDefs] = useState<SegmentDef[] | null>(null);
  useEffect(() => { api.get<SegmentDef[]>("/segments/summary").then(setDefs).catch(() => {}); }, []);
  if (!defs) return <Layout title="Attributes"><Spinner /></Layout>;

  return (
    <Layout title="Attributes" subtitle="The segments that make up every IKIO part number, in order.">
      <div className="card">
        <div className="table-wrap">
          <table className="tbl">
            <thead><tr><th>#</th><th>Attribute</th><th>Key</th><th>Type</th><th>Add-on Letter</th><th>Allowed Values</th><th>Description</th></tr></thead>
            <tbody>
              {defs.map((d, i) => (
                <tr key={d.key} style={{ cursor: "pointer" }} onClick={() => nav("/values")}>
                  <td className="muted">{i + 1}</td>
                  <td><strong>{d.label}</strong></td>
                  <td><span className="mono muted">{d.key}</span></td>
                  <td>{d.required ? <span className="badge green">Required</span> : <span className="badge blue">Optional</span>}</td>
                  <td>{d.letter ? <span className="badge gray mono">{d.letter}</span> : "—"}</td>
                  <td><span className="badge gray">{d.valueCount} values</span></td>
                  <td className="muted" style={{ maxWidth: 320 }}>{d.help}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <div className="muted" style={{ marginTop: 12, fontSize: 12.5 }}>Click any attribute to manage its allowed codes in Units &amp; Values.</div>
    </Layout>
  );
}
