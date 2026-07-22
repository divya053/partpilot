import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Layout } from "../components/Layout";
import { StatusBadge, Spinner, useConfirm } from "../components/ui";
import { api } from "../lib/api";
import { useToast } from "../lib/toast";
import { useAuth } from "../lib/auth";
import { PartNumber } from "../lib/types";

const SPEC_ROWS: { key: string; label: string }[] = [
  { key: "productModel", label: "Product Model" }, { key: "versionVariant", label: "Version / Variant" },
  { key: "sizeVariant", label: "Size Variant" }, { key: "powerType", label: "Power Type" },
  { key: "maxPower", label: "Max Power" }, { key: "voltageRange", label: "Voltage Range" },
  { key: "dimming", label: "Dimming" }, { key: "cct", label: "CCT" },
  { key: "lightDistribution", label: "Light Distribution" }, { key: "driver", label: "Driver" },
  { key: "finish", label: "Finish" }, { key: "manufacturer", label: "Manufacturer" },
];

export default function PartDetail() {
  const { id } = useParams();
  const nav = useNavigate();
  const toast = useToast();
  const { can } = useAuth();
  const { confirm, node } = useConfirm();
  const [part, setPart] = useState<PartNumber | null>(null);
  const [explain, setExplain] = useState("");
  const [explaining, setExplaining] = useState(false);

  useEffect(() => {
    api.get<PartNumber>(`/part-numbers/${id}`).then(setPart).catch((e) => toast(e.message, "error"));
  }, [id]);

  const remove = async () => {
    if (!part || !(await confirm(`Delete ${part.partNumber}?`))) return;
    try { await api.del(`/part-numbers/${part.id}`); toast("Part deleted", "success"); nav("/library"); }
    catch (e) { toast((e as Error).message, "error"); }
  };
  const duplicate = async () => {
    if (!part) return;
    try { const r = await api.post<{ id: number }>(`/part-numbers/${part.id}/duplicate`); toast("Duplicated", "success"); nav(`/part/${r.id}`); }
    catch (e) { toast((e as Error).message, "error"); }
  };
  const runExplain = async () => {
    if (!part) return;
    setExplaining(true);
    try { const r = await api.post<{ explanation: string }>("/ai/explain", part); setExplain(r.explanation); }
    catch (e) { toast((e as Error).message, "error"); } finally { setExplaining(false); }
  };

  if (!part) return <Layout title="Part Number"><Spinner /></Layout>;

  return (
    <Layout title={part.partNumber} subtitle={`${part.productName} · ${part.company_name || "Unassigned"}`}
      actions={<>
        <button className="btn" onClick={() => nav("/library")}>‹ Back to Library</button>
        <button className="btn" onClick={() => { navigator.clipboard.writeText(part.partNumber); toast("Copied", "success"); }}>⧉ Copy</button>
        {can("write") && <button className="btn" onClick={() => nav(`/builder/${part.id}`)}>✎ Edit</button>}
        {can("write") && <button className="btn" onClick={duplicate}>Duplicate</button>}
        {can("delete") && <button className="btn danger" onClick={remove}>Delete</button>}
      </>}>
      <div className="grid">
        <div className="card card-pad">
          <div className="spread" style={{ marginBottom: 14 }}>
            <h3>Part Number Breakdown</h3><StatusBadge status={part.status} />
          </div>
          <div className="seg-chips">
            {part.segments?.map((c, i) => (
              <div key={i} className="flex" style={{ gap: 6 }}>
                <div className="seg-chip"><div className="code">{c.value}</div><div className="lab">{c.label}</div></div>
                {i < part.segments.length - 1 && <div className="seg-sep">–</div>}
              </div>
            ))}
          </div>
        </div>

        <div className="row" style={{ alignItems: "flex-start" }}>
          <div className="card card-pad" style={{ flex: 1 }}>
            <h3 style={{ marginBottom: 12 }}>Details</h3>
            <div className="kv"><span className="k">Company</span><span className="v">{part.company_name || "—"}</span></div>
            <div className="kv"><span className="k">Product</span><span className="v">{part.productName}</span></div>
            <div className="kv"><span className="k">Category</span><span className="v">{part.productCategory}</span></div>
            <div className="kv"><span className="k">SKU</span><span className="v mono">{part.sku || "—"}</span></div>
            <div className="kv"><span className="k">Vendor</span><span className="v">{part.vendorName || "—"}</span></div>
            <div className="kv"><span className="k">Stage</span><span className="v">{part.productStage || "—"}</span></div>
            <div className="kv"><span className="k">Created By</span><span className="v">{part.createdBy || "—"}</span></div>
            {part.productDescription && <div style={{ marginTop: 12 }}><div className="muted" style={{ fontSize: 12, marginBottom: 4 }}>Description</div><div>{part.productDescription}</div></div>}
            {part.internalNotes && <div style={{ marginTop: 12 }}><div className="muted" style={{ fontSize: 12, marginBottom: 4 }}>Internal Notes</div><div className="muted">{part.internalNotes}</div></div>}

            <div className="divider" />
            <h3 style={{ marginBottom: 8, fontSize: 14 }}>Spec Sheets</h3>
            <div className="kv"><span className="k">Vendor Spec Sheet</span><span className="v">{part.vendorSpecSheet ? <a href={String(part.vendorSpecSheet)} target="_blank" className="badge blue">Open ↗</a> : "—"}</span></div>
            <div className="kv"><span className="k">IKIO Spec Sheet</span><span className="v">{part.ikioSpecSheet ? <a href={String(part.ikioSpecSheet)} target="_blank" className="badge green">Open ↗</a> : "—"}</span></div>
          </div>

          <div className="card card-pad" style={{ flex: 1 }}>
            <h3 style={{ marginBottom: 12 }}>Specifications</h3>
            {SPEC_ROWS.map((r) => (
              <div key={r.key} className="kv"><span className="k">{r.label}</span><span className="v mono">{String(part[r.key] ?? "—")}</span></div>
            ))}
          </div>
        </div>

        <div className="card card-pad">
          <div className="spread"><h3>✦ AI Explanation</h3>
            <button className="btn sm" onClick={runExplain} disabled={explaining}>{explaining ? "Thinking…" : "Explain"}</button>
          </div>
          {explain && <div className="insight info" style={{ marginTop: 12 }}><div className="d" style={{ whiteSpace: "pre-wrap" }}>{explain}</div></div>}
        </div>
      </div>
      {node}
    </Layout>
  );
}
