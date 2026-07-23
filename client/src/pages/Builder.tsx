import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Layout } from "../components/Layout";
import { Field, StatusBadge, FileUpload } from "../components/ui";
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
  const [showOptional, setShowOptional] = useState(false); // add-on segments start collapsed

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
  const optionalCount = useMemo(() => (meta?.optional ?? []).filter((s) => form[s.key]).length, [meta, form]);

  // Live duplicate + similarity check. Debounced; re-runs whenever the assembled
  // number changes. `existing` drives the red alert; `similar` lists same-series parts.
  const [dup, setDup] = useState<{ duplicate: boolean; existing: any; similar: any[] }>({ duplicate: false, existing: null, similar: [] });
  useEffect(() => {
    const t = setTimeout(() => {
      api.post<{ duplicate: boolean; existing: any; similar: any[] }>("/part-numbers/check", { ...form, excludeId: id })
        .then(setDup)
        .catch(() => setDup({ duplicate: false, existing: null, similar: [] }));
    }, 300);
    return () => clearTimeout(t);
  }, [partNumber, id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Smart defaults + unusual-combination warnings, learned from existing parts
  // in the selected series. Pure statistics — improves with every saved part.
  type Suggestion = { key: string; label: string; code: string; count: number; share: number };
  type Warning = { key: string; label: string; code: string; message: string };
  const [sugg, setSugg] = useState<{ basisCount: number; suggestions: Suggestion[]; warnings: Warning[] }>({ basisCount: 0, suggestions: [], warnings: [] });
  useEffect(() => {
    if (!form.productModel) { setSugg({ basisCount: 0, suggestions: [], warnings: [] }); return; }
    const t = setTimeout(() => {
      api.post<typeof sugg>("/ai/suggest", form)
        .then(setSugg)
        .catch(() => setSugg({ basisCount: 0, suggestions: [], warnings: [] }));
    }, 350);
    return () => clearTimeout(t);
  }, [partNumber]); // eslint-disable-line react-hooks/exhaustive-deps

  // Plain-English description → auto-filled segments.
  const [describe, setDescribe] = useState("");
  const [parsing, setParsing] = useState(false);
  const autoFill = async () => {
    if (!describe.trim() || parsing) return;
    setParsing(true);
    try {
      const res = await api.post<{ fields: Record<string, string>; source: string }>("/ai/parse", { text: describe });
      const n = Object.keys(res.fields).length;
      if (!n) { toast("Couldn't match any segments — try mentioning wattage, colour, voltage…", "error"); return; }
      setForm((f) => ({ ...f, ...res.fields }));
      toast(`Filled ${n} segment(s) from your description${res.source === "ai" ? "" : " (keyword match)"}`, "success");
    } catch (e) { toast((e as Error).message, "error"); }
    finally { setParsing(false); }
  };
  const applyAllSuggestions = () => {
    setForm((f) => {
      const next = { ...f };
      for (const s of sugg.suggestions) if (!next[s.key]) next[s.key] = s.code;
      return next;
    });
    toast("Applied the most common values for this series", "success");
  };

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
              {/* Plain-English auto-fill — describe the fixture, AI maps it to real codes */}
              <div className="flex" style={{ gap: 8, marginBottom: 6 }}>
                <input className="input" style={{ flex: 1 }}
                  placeholder='✨ Describe it in plain English — e.g. "240W UFO high bay, black, dimmable, 120-277V, motion sensor"'
                  value={describe}
                  onChange={(e) => setDescribe(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && autoFill()} />
                <button className="btn primary" onClick={autoFill} disabled={parsing || !describe.trim()}>
                  {parsing ? "Matching…" : "✨ Auto-fill"}
                </button>
              </div>
              <div className="muted" style={{ fontSize: 11.5, marginBottom: 12 }}>
                Only real catalog codes are used — review the dropdowns after auto-fill.
              </div>

              <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))" }}>
                {meta.core.map((s) => renderSegment(s))}
              </div>

              {/* Learned suggestions: most common values among this series' parts */}
              {sugg.suggestions.length > 0 && (
                <div className="insight info" style={{ marginTop: 12 }}>
                  <div className="spread">
                    <div className="t">Suggestions from {sugg.basisCount} existing {form.productModel} part(s)</div>
                    <button className="btn sm" onClick={applyAllSuggestions}>Apply all</button>
                  </div>
                  <div className="flex" style={{ flexWrap: "wrap", gap: 6, marginTop: 8 }}>
                    {sugg.suggestions.map((s) => (
                      <button key={s.key} className="btn sm" title={`Used by ${s.count} of ${sugg.basisCount} parts — click to apply`}
                        onClick={() => set(s.key, s.code)}>
                        {s.label}: <span className="mono" style={{ fontWeight: 700 }}>{s.code}</span>
                        <span className="muted" style={{ fontSize: 10.5 }}> {s.share}%</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="divider" />
              <button type="button" onClick={() => setShowOptional((v) => !v)}
                className="btn" style={{ width: "100%", justifyContent: "space-between", background: "transparent", borderStyle: "dashed" }}>
                <span style={{ fontWeight: 600, fontSize: 12.5 }}>
                  Optional add-on segments (appended after manufacturer)
                  {optionalCount > 0 ? <span className="badge green" style={{ marginLeft: 8 }}>{optionalCount} selected</span> : null}
                </span>
                <span className="muted">{showOptional ? "Hide ▲" : "Show ▼"}</span>
              </button>
              {showOptional && (
                <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", marginTop: 12 }}>
                  {meta.optional.map((s) => renderSegment(s, true))}
                </div>
              )}

              <div className="divider" />
              <div className={"gen-code" + (dup.duplicate ? " dupe" : "")}>
                <div>
                  <div className="muted" style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: .5 }}>Generated Part Number</div>
                  <div className="pn">{partNumber}</div>
                </div>
                <button className="btn" onClick={copy}>⧉ Copy</button>
                <button className="btn" onClick={reset}>Reset</button>
              </div>

              {dup.duplicate && (
                <div className="insight danger" style={{ marginTop: 12 }}>
                  <div className="t" style={{ color: "var(--red)" }}>⚠ Duplicate part number</div>
                  <div className="d">
                    <span className="mono">{partNumber}</span> already exists
                    {dup.existing?.productName ? <> as “{dup.existing.productName}”</> : null}
                    {dup.existing?.createdBy ? <> (created by {dup.existing.createdBy})</> : null}.{" "}
                    {dup.existing?.id ? <a className="link" onClick={() => nav(`/part/${dup.existing.id}`)} style={{ cursor: "pointer", textDecoration: "underline" }}>View existing part ↗</a> : null}
                  </div>
                </div>
              )}

              {sugg.warnings.length > 0 && (
                <div className="insight warning" style={{ marginTop: 12 }}>
                  <div className="t">Unusual for this series — double-check</div>
                  <div className="d">
                    {sugg.warnings.map((w) => <div key={w.key}>• {w.message}</div>)}
                  </div>
                </div>
              )}

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
                <Field label="Vendor Spec Sheet" hint="Upload the vendor's spec sheet (PDF / image / doc)">
                  <FileUpload value={form.vendorSpecSheet} accept=".pdf,image/*,.doc,.docx,.xls,.xlsx" onChange={(v) => set("vendorSpecSheet", v)} />
                </Field>
                <Field label="IKIO Spec Sheet" hint="Upload the IKIO spec sheet (PDF / image / doc)">
                  <FileUpload value={form.ikioSpecSheet} accept=".pdf,image/*,.doc,.docx,.xls,.xlsx" onChange={(v) => set("ikioSpecSheet", v)} />
                </Field>
                <Field label="Product Image" hint="Upload a product image for this part number">
                  <FileUpload value={form.image} image accept="image/*" onChange={(v) => set("image", v)} />
                </Field>
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
              {can("write") && <button className="btn primary" style={{ width: "100%", justifyContent: "center", marginTop: 14 }} onClick={save} disabled={saving || dup.duplicate} title={dup.duplicate ? "This part number already exists" : ""}>{saving ? "Saving…" : dup.duplicate ? "Duplicate — can't save" : id ? "Update Part Number" : "Save Part Number"}</button>}
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

      {/* Similar existing part numbers — same series, shown as a library-style table */}
      {dup.similar.length > 0 && (
        <div className="card" style={{ marginTop: 16 }}>
          <div className="card-head">
            <div>
              <h3>Similar Part Numbers</h3>
              <div className="sub">Existing parts in the same series ({form.productModel}) — {dup.similar.length} found</div>
            </div>
          </div>
          <div className="table-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Part Number</th>
                  <th>Product</th>
                  <th>Company</th>
                  <th>Status</th>
                  <th>Created On</th>
                  <th style={{ textAlign: "right" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {dup.similar.map((s) => (
                  <tr key={s.id}>
                    <td><span className="mono" style={{ fontWeight: 600 }}>{s.partNumber}</span></td>
                    <td>{s.productName || "—"}</td>
                    <td className="muted">{s.companyName || "—"}</td>
                    <td><StatusBadge status={s.status} /></td>
                    <td className="muted">{s.createdAt ? new Date(s.createdAt).toLocaleDateString() : "—"}</td>
                    <td>
                      <div className="actions-cell" style={{ justifyContent: "flex-end" }}>
                        <button className="btn sm" onClick={() => nav(`/part/${s.id}`)}>View</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </Layout>
  );
}
