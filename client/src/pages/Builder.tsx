import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Layout } from "../components/Layout";
import { Field, StatusBadge } from "../components/ui";
import { api } from "../lib/api";
import { useToast } from "../lib/toast";
import { useAuth } from "../lib/auth";
import { buildPartNumber, partSegments } from "../lib/partNumber";
import { SegmentDef, SegmentValue, Company, Category } from "../lib/types";

type Grouped = Record<string, SegmentValue[]>;

export default function Builder() {
  const { id } = useParams();
  const nav = useNavigate();
  const toast = useToast();
  const { can } = useAuth();

  const [meta, setMeta] = useState<{ core: SegmentDef[]; optional: SegmentDef[] } | null>(null);
  const [values, setValues] = useState<Grouped>({});
  const [companies, setCompanies] = useState<Company[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [form, setForm] = useState<Record<string, any>>({ status: "active", productStage: "stocked" });
  const [saving, setSaving] = useState(false);
  const [explain, setExplain] = useState<string>("");
  const [explaining, setExplaining] = useState(false);

  useEffect(() => {
    Promise.all([
      api.get<{ core: SegmentDef[]; optional: SegmentDef[] }>("/segments/meta"),
      api.get<Grouped>("/segments/values/grouped"),
      api.get<Company[]>("/companies"),
      api.get<Category[]>("/categories"),
    ]).then(([m, v, co, ca]) => {
      setMeta(m); setValues(v); setCompanies(co); setCategories(ca);
      setForm((f) => {
        const next = { ...f };
        // Prefill sensible defaults from first available value of each core segment.
        for (const s of m.core) if (!next[s.key] && v[s.key]?.length) next[s.key] = v[s.key][0].code;
        return next;
      });
    }).catch((e) => toast(e.message, "error"));
  }, []);

  useEffect(() => {
    if (!id) return;
    api.get<any>(`/part-numbers/${id}`).then((p) => setForm(p)).catch((e) => toast(e.message, "error"));
  }, [id]);

  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const partNumber = useMemo(() => buildPartNumber(form), [form]);
  const chips = useMemo(() => partSegments(form), [form]);

  const descFor = (segKey: string, code: string) =>
    values[segKey]?.find((v) => v.code === code)?.description || "";

  const reset = () => setForm({ status: "active", productStage: "stocked" });
  const copy = () => { navigator.clipboard.writeText(partNumber); toast("Part number copied", "success"); };

  const save = async () => {
    if (!form.productName || !form.productCategory) { toast("Product name and category are required", "error"); return; }
    setSaving(true);
    try {
      if (id) { await api.patch(`/part-numbers/${id}`, form); toast("Part number updated", "success"); nav(`/part/${id}`); }
      else {
        const created = await api.post<{ id: number }>("/part-numbers", form);
        toast("Part number saved", "success"); nav(`/part/${created.id}`);
      }
    } catch (e) { toast((e as Error).message, "error"); }
    finally { setSaving(false); }
  };

  const runExplain = async () => {
    setExplaining(true);
    try {
      const r = await api.post<{ explanation: string }>("/ai/explain", form);
      setExplain(r.explanation);
    } catch (e) { toast((e as Error).message, "error"); }
    finally { setExplaining(false); }
  };

  if (!meta) return <Layout title="Part Number Builder"><div className="center-load"><div className="spinner" /></div></Layout>;

  const renderSegment = (s: SegmentDef, optional = false) => {
    const opts = values[s.key] || [];
    return (
      <Field key={s.key} label={s.label} required={!optional} hint={form[s.key] ? descFor(s.key, form[s.key]) : s.help}>
        <select className="select" value={form[s.key] ?? ""} onChange={(e) => set(s.key, e.target.value)}>
          {optional && <option value="">— None —</option>}
          {opts.map((o) => <option key={o.id} value={o.code}>{o.code} — {o.description}</option>)}
        </select>
      </Field>
    );
  };

  return (
    <Layout title="Part Number Builder" subtitle="Create, manage and track part numbers for products."
      actions={<>
        <button className="btn" onClick={() => nav("/library")}>View Part Number Library</button>
        {can("write") && <button className="btn primary" onClick={reset}>+ Create New Part Number</button>}
      </>}>
      <div className="row" style={{ alignItems: "flex-start" }}>
        <div style={{ flex: 1, minWidth: 0 }} className="grid">

          {/* Step 1: Configure */}
          <div className="card">
            <div className="card-head"><span className="step-badge">1</span><div><h3>Configure Your Part Number</h3><div className="sub">Select options for each attribute to build your part number.</div></div></div>
            <div className="card-pad">
              <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))" }}>
                {meta.core.map((s) => renderSegment(s))}
              </div>

              <div className="divider" />
              <div className="muted" style={{ fontSize: 12.5, fontWeight: 600, marginBottom: 10 }}>
                Optional add-on segments (appended after manufacturer)
              </div>
              <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))" }}>
                {meta.optional.map((s) => renderSegment(s, true))}
              </div>

              <div className="divider" />
              <div className="gen-code">
                <div>
                  <div className="muted" style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: .5 }}>Generated Part Number</div>
                  <div className="pn">{partNumber}</div>
                </div>
                <button className="btn" onClick={copy}>⧉ Copy</button>
                <button className="btn" onClick={reset}>Reset</button>
              </div>

              <div className="seg-chips" style={{ marginTop: 14 }}>
                {chips.map((c, i) => (
                  <div key={i} className="flex" style={{ gap: 6 }}>
                    <div className="seg-chip"><div className="code">{c.value}</div><div className="lab">{c.label}</div></div>
                    {i < chips.length - 1 && <div className="seg-sep">–</div>}
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Step 2: Details */}
          <div className="card">
            <div className="card-head"><span className="step-badge">2</span><div><h3>Part Number Details</h3><div className="sub">Add product metadata, spec sheets and status for this part number.</div></div></div>
            <div className="card-pad">
              <div className="grid" style={{ gridTemplateColumns: "1fr 1fr" }}>
                <Field label="Product Name" required><input className="input" value={form.productName ?? ""} onChange={(e) => set("productName", e.target.value)} placeholder="e.g. UFO High Bay 240W" /></Field>
                <Field label="Category" required>
                  <select className="select" value={form.productCategory ?? ""} onChange={(e) => set("productCategory", e.target.value)}>
                    <option value="">Select category…</option>
                    {categories.map((c) => <option key={c.id} value={c.name}>{c.name}</option>)}
                  </select>
                </Field>
                <Field label="Company">
                  <select className="select" value={form.companyId ?? ""} onChange={(e) => set("companyId", e.target.value)}>
                    <option value="">Unassigned</option>
                    {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </Field>
                <Field label="SKU"><input className="input" value={form.sku ?? ""} onChange={(e) => set("sku", e.target.value)} /></Field>
                <Field label="Vendor Name"><input className="input" value={form.vendorName ?? ""} onChange={(e) => set("vendorName", e.target.value)} /></Field>
                <Field label="Product Stage">
                  <select className="select" value={form.productStage ?? "stocked"} onChange={(e) => set("productStage", e.target.value)}>
                    <option value="stocked">Stocked</option>
                    <option value="temporary">Temporary</option>
                  </select>
                </Field>
                <Field label="Vendor Spec Sheet" hint="Link to the vendor's specification sheet"><input className="input" value={form.vendorSpecSheet ?? ""} onChange={(e) => set("vendorSpecSheet", e.target.value)} placeholder="https://…" /></Field>
                <Field label="IKIO Spec Sheet" hint="Link to the IKIO specification sheet"><input className="input" value={form.ikioSpecSheet ?? ""} onChange={(e) => set("ikioSpecSheet", e.target.value)} placeholder="https://…" /></Field>
                <Field label="Status">
                  <select className="select" value={form.status ?? "active"} onChange={(e) => set("status", e.target.value)}>
                    <option value="active">Active</option>
                    <option value="draft">Draft</option>
                    <option value="deprecated">Deprecated</option>
                  </select>
                </Field>
              </div>
              <div style={{ marginTop: 14 }} className="grid">
                <Field label="Description"><textarea className="textarea" value={form.productDescription ?? ""} onChange={(e) => set("productDescription", e.target.value)} /></Field>
                <Field label="Internal Notes"><textarea className="textarea" value={form.internalNotes ?? ""} onChange={(e) => set("internalNotes", e.target.value)} /></Field>
              </div>
            </div>
          </div>
        </div>

        {/* Summary rail */}
        <div style={{ width: 320, flexShrink: 0 }} className="grid">
          <div className="card">
            <div className="card-head"><h3>Part Number Summary</h3></div>
            <div className="card-pad">
              <div className="gen-code" style={{ marginBottom: 12 }}><div className="pn" style={{ fontSize: 15 }}>{partNumber}</div></div>
              {chips.map((c, i) => <div key={i} className="kv"><span className="k">{c.label}</span><span className="v mono">{c.value}</span></div>)}
              <div className="kv"><span className="k">Status</span><span className="v"><StatusBadge status={form.status} /></span></div>
              {can("write") && <button className="btn primary" style={{ width: "100%", justifyContent: "center", marginTop: 14 }} onClick={save} disabled={saving}>{saving ? "Saving…" : id ? "Update Part Number" : "Save Part Number"}</button>}
            </div>
          </div>

          <div className="card">
            <div className="card-head"><h3>✦ AI Explanation</h3></div>
            <div className="card-pad">
              <button className="btn" style={{ width: "100%", justifyContent: "center" }} onClick={runExplain} disabled={explaining}>
                {explaining ? "Thinking…" : "Explain this part number"}
              </button>
              {explain && <div className="insight info" style={{ marginTop: 12 }}><div className="d" style={{ whiteSpace: "pre-wrap" }}>{explain}</div></div>}
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
}
