import { useEffect, useMemo, useState } from "react";
import { Layout } from "../components/Layout";
import { Spinner, Empty } from "../components/ui";
import { api, qs } from "../lib/api";
import { useToast } from "../lib/toast";
import { useAuth } from "../lib/auth";
import { SegmentValue } from "../lib/types";

type Model = { code: string; description: string };
type CfgValue = { id: number; code: string; description: string; applies: boolean; overridden: boolean; usedByReal: boolean; meaning: string; isActive: boolean };
type CfgSegment = { key: string; label: string; help?: string; values: CfgValue[] };
type Edit = { applies?: boolean; meaning?: string };

/**
 * Model-centric configuration. Pick a product model and, per segment, control
 * which codes APPLY to it (shown in the builder / offered by the agent) and what
 * each code MEANS for it. Writes manual applicability overrides + per-model
 * meanings — the auto-usage recompute never clobbers these.
 */
export default function ModelConfig() {
  const toast = useToast();
  const { can } = useAuth();
  const editable = can("write");

  const [models, setModels] = useState<Model[]>([]);
  const [model, setModel] = useState("");
  const [segments, setSegments] = useState<CfgSegment[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [edits, setEdits] = useState<Record<number, Edit>>({});
  const [search, setSearch] = useState("");
  const [openSeg, setOpenSeg] = useState<string | null>(null);

  useEffect(() => {
    api.get<SegmentValue[]>("/segments/values" + qs({ segmentKey: "productModel" }))
      .then((r) => {
        const m = r.map((v) => ({ code: v.code, description: v.description }));
        setModels(m);
        if (m.length && !model) setModel(m[0].code);
      }).catch(() => {});
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const load = () => {
    if (!model) return;
    setLoading(true); setEdits({});
    api.get<{ segments: CfgSegment[] }>(`/segments/model-config/${encodeURIComponent(model)}`)
      .then((r) => { setSegments(r.segments); setOpenSeg(r.segments[0]?.key ?? null); })
      .catch((e) => toast(e.message, "error")).finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, [model]); // eslint-disable-line react-hooks/exhaustive-deps

  const modelName = models.find((m) => m.code === model)?.description || model;

  // Effective (edited) value getters.
  const appliesOf = (v: CfgValue) => edits[v.id]?.applies ?? v.applies;
  const meaningOf = (v: CfgValue) => edits[v.id]?.meaning ?? v.meaning;
  const setEdit = (id: number, patch: Edit) => setEdits((e) => ({ ...e, [id]: { ...e[id], ...patch } }));
  const dirtyCount = Object.keys(edits).length;

  const save = async () => {
    if (!dirtyCount || !segments) return;
    const byId = new Map<number, CfgValue>();
    for (const s of segments) for (const v of s.values) byId.set(v.id, v);
    const changes = Object.keys(edits).map((idStr) => {
      const id = Number(idStr); const v = byId.get(id)!;
      return { id, applies: edits[id].applies ?? v.applies, meaning: edits[id].meaning ?? v.meaning };
    });
    setSaving(true);
    try {
      const r = await api.post<{ updated: number }>(`/segments/model-config/${encodeURIComponent(model)}`, { changes });
      toast(`Saved ${r.updated} code(s) for ${modelName}`, "success");
      load();
    } catch (e) { toast((e as Error).message, "error"); } finally { setSaving(false); }
  };

  // Per-segment: apply/hide all shown codes at once.
  const setAllInSegment = (seg: CfgSegment, applies: boolean) => {
    setEdits((e) => {
      const n = { ...e };
      for (const v of filteredValues(seg)) n[v.id] = { ...n[v.id], applies };
      return n;
    });
  };

  const filteredValues = (seg: CfgSegment) => {
    const s = search.trim().toLowerCase();
    if (!s) return seg.values;
    return seg.values.filter((v) => v.code.toLowerCase().includes(s) || (v.description || "").toLowerCase().includes(s) || (v.meaning || "").toLowerCase().includes(s));
  };

  const appliesCount = (seg: CfgSegment) => seg.values.filter((v) => appliesOf(v)).length;
  const totalApplies = useMemo(() => (segments || []).reduce((n, s) => n + appliesCount(s), 0), [segments, edits]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Layout title="Model Config" subtitle="Per product model — set which codes apply and what each one means."
      actions={editable && dirtyCount > 0 && <button className="btn primary" onClick={save} disabled={saving}>{saving ? "Saving…" : `Save changes (${dirtyCount})`}</button>}>

      <div className="insight info" style={{ marginBottom: 14 }}>
        <div className="t">How this works</div>
        <div className="d" style={{ lineHeight: 1.6 }}>
          Pick a <b>product model</b> below. For each segment you decide which <b>codes apply</b> to that model (only applicable codes show in the Builder and are offered by the AI agent) and, optionally, what each code <b>means</b> for this model (e.g. size <span className="mono">06</span> = “6 inch”, version <span className="mono">1</span> = “Recessed Downlight”). Your choices override the auto-detected data and are never overwritten.
        </div>
      </div>

      <div className="card" style={{ marginBottom: 14 }}>
        <div className="card-pad">
          <div className="flex" style={{ gap: 12, flexWrap: "wrap", alignItems: "center" }}>
            <label className="flex" style={{ gap: 8, alignItems: "center", fontSize: 13, fontWeight: 600 }}>
              Product Model:
              <select className="select" style={{ minWidth: 300 }} value={model} onChange={(e) => setModel(e.target.value)}>
                {models.map((m) => <option key={m.code} value={m.code}>{m.code} — {m.description}</option>)}
              </select>
            </label>
            <div className="search" style={{ maxWidth: 260 }}><span className="ico">⌕</span>
              <input className="input" placeholder="Search codes / meanings…" value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            {segments && <span className="muted" style={{ fontSize: 12.5, marginLeft: "auto" }}>{totalApplies} code(s) apply to <b>{modelName}</b> across {segments.length} segment(s)</span>}
          </div>
        </div>
      </div>

      {loading ? <Spinner /> : !segments ? <Empty title="Pick a product model to configure" /> : segments.length === 0 ? <Empty title="No configurable segments" /> : (
        <div className="grid" style={{ gap: 10 }}>
          {segments.map((seg) => {
            const open = openSeg === seg.key;
            const vals = filteredValues(seg);
            return (
              <div className="card" key={seg.key}>
                <div className="card-head" style={{ cursor: "pointer", flexWrap: "wrap", gap: 8 }} onClick={() => setOpenSeg(open ? null : seg.key)}>
                  <div>
                    <h3>{seg.label} <span className="badge green" style={{ marginLeft: 6 }}>{appliesCount(seg)}/{seg.values.length} apply</span></h3>
                    {seg.help && <div className="sub">{seg.help}</div>}
                  </div>
                  <div className="flex" style={{ gap: 6, marginLeft: "auto", alignItems: "center" }}>
                    {editable && open && (<>
                      <button className="btn sm" onClick={(e) => { e.stopPropagation(); setAllInSegment(seg, true); }}>Apply all</button>
                      <button className="btn sm" onClick={(e) => { e.stopPropagation(); setAllInSegment(seg, false); }}>Hide all</button>
                    </>)}
                    <span className="muted">{open ? "▲" : "▼"}</span>
                  </div>
                </div>
                {open && (
                  <div className="table-wrap">
                    <table className="tbl">
                      <thead><tr>
                        <th style={{ width: 70 }}>Applies</th><th>Code</th><th>Default description</th>
                        <th title="What this code means for THIS model (optional). Blank = use the default description.">Means for {model}</th>
                      </tr></thead>
                      <tbody>
                        {vals.length === 0 ? <tr><td colSpan={4} className="muted" style={{ padding: 14 }}>No codes match your search.</td></tr> : vals.map((v) => {
                          const applies = appliesOf(v);
                          return (
                            <tr key={v.id} style={applies ? undefined : { opacity: 0.55 }}>
                              <td>
                                <label className="flex" style={{ gap: 6, cursor: editable ? "pointer" : "default" }}>
                                  <input type="checkbox" checked={applies} disabled={!editable} onChange={(e) => setEdit(v.id, { applies: e.target.checked })} />
                                </label>
                              </td>
                              <td><span className="mono" style={{ fontWeight: 700 }}>{v.code}</span>{v.usedByReal && <span className="badge gray" style={{ marginLeft: 6, fontSize: 10 }} title="Used by at least one existing part of this model">in use</span>}</td>
                              <td className="muted">{v.description || "—"}</td>
                              <td>
                                {editable
                                  ? <input className="input" style={{ minWidth: 200 }} placeholder="(uses default description)" value={meaningOf(v)} disabled={!applies} onChange={(e) => setEdit(v.id, { meaning: e.target.value })} />
                                  : (v.meaning || <span className="muted">—</span>)}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </Layout>
  );
}
