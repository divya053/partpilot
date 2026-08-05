import { useEffect, useRef, useState } from "react";
import { api } from "../lib/api";
import { SegmentDef } from "../lib/types";

type Role = "user" | "assistant";
type AgentOption = { code: string; meaning: string; count: number };
type AgentWarning = { level: string; key?: string; message: string };
type AgentResponse = {
  reply: string;
  fields: Record<string, string>;
  nextField: string | null;
  nextLabel?: string | null;
  options: AgentOption[];
  warnings: AgentWarning[];
  partNumber: string;
  source: string;
};
type Msg = {
  role: Role;
  content: string;
  applied?: Record<string, string>;
  warnings?: AgentWarning[];
  options?: AgentOption[];
  nextField?: string | null;
  nextLabel?: string | null;
  source?: string;
};

const GREETING: Msg = {
  role: "assistant",
  content:
    "Hi — I'm your part-number agent. Describe the fixture in plain English (e.g. “6\" commercial downlight, selectable 22W, 4000K”) and I'll build a valid IKIO part number with you, one step at a time. I only use real catalog codes and I'll flag anything unusual for the product family.",
};

/**
 * Conversational build agent. Sends the chat history + the live builder draft to
 * /ai/agent, then applies the validated segment codes it returns straight into
 * the form (so the dropdowns and the generated number update live). Shows the
 * next step as one-click chips and surfaces any warnings.
 */
export function AgentChat({ form, meta, onApply, descFor }: {
  form: Record<string, any>;
  meta: { core: SegmentDef[]; optional: SegmentDef[] };
  onApply: (fields: Record<string, string>) => void;
  descFor: (segKey: string, code: string) => string;
}) {
  const [messages, setMessages] = useState<Msg[]>([GREETING]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(true);
  const threadRef = useRef<HTMLDivElement>(null);

  const labelFor = (key: string) =>
    [...meta.core, ...meta.optional].find((s) => s.key === key)?.label || key;

  useEffect(() => {
    if (threadRef.current) threadRef.current.scrollTop = threadRef.current.scrollHeight;
  }, [messages, busy]);

  const send = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || busy) return;
    const history = messages.filter((m) => m !== GREETING).map((m) => ({ role: m.role, content: m.content }));
    const next = [...messages, { role: "user" as Role, content: trimmed }];
    setMessages(next);
    setInput("");
    setBusy(true);
    try {
      const res = await api.post<AgentResponse>("/ai/agent", {
        messages: [...history, { role: "user", content: trimmed }],
        draft: form,
      });
      if (res.fields && Object.keys(res.fields).length) onApply(res.fields);
      setMessages((m) => [...m, {
        role: "assistant",
        content: res.reply,
        applied: res.fields,
        warnings: res.warnings,
        options: res.options,
        nextField: res.nextField,
        nextLabel: res.nextLabel,
        source: res.source,
      }]);
    } catch (e) {
      setMessages((m) => [...m, { role: "assistant", content: `⚠ ${(e as Error).message}` }]);
    } finally { setBusy(false); }
  };

  // Clicking a suggested option applies it and asks the agent to continue.
  const chooseOption = (nextField: string, o: AgentOption) => {
    if (busy) return;
    onApply({ [nextField]: o.code });
    void send(`Use ${o.meaning || o.code} for ${labelFor(nextField)}.`);
  };

  const last = messages[messages.length - 1];
  const showChips = last?.role === "assistant" && last.nextField && (last.options?.length || 0) > 0;

  return (
    <div className="card" style={{ borderColor: "var(--green)", boxShadow: "0 0 0 3px var(--green-50)" }}>
      <div className="card-head" style={{ cursor: "pointer" }} onClick={() => setOpen((v) => !v)}>
        <span className="step-badge" style={{ background: "var(--green)" }}>✦</span>
        <div style={{ flex: 1 }}>
          <h3>Build with AI <span className="badge green" style={{ marginLeft: 6 }}>agent</span></h3>
          <div className="sub">Describe the fixture — the agent fills the form using real catalog data.</div>
        </div>
        <span className="muted">{open ? "Hide ▲" : "Show ▼"}</span>
      </div>
      {open && (
        <div className="card-pad">
          <div ref={threadRef} style={{ maxHeight: 320, overflowY: "auto", display: "flex", flexDirection: "column", gap: 10, paddingRight: 4 }}>
            {messages.map((m, i) => (
              <div key={i} style={{ alignSelf: m.role === "user" ? "flex-end" : "flex-start", maxWidth: "92%" }}>
                <div style={{
                  background: m.role === "user" ? "var(--green)" : "var(--surface-2, #f4f5f7)",
                  color: m.role === "user" ? "#fff" : "inherit",
                  borderRadius: 12, padding: "8px 12px", fontSize: 13, lineHeight: 1.5, whiteSpace: "pre-wrap",
                }}>
                  {m.content}
                </div>
                {/* What the agent applied to the form */}
                {m.role === "assistant" && m.applied && Object.keys(m.applied).length > 0 && (
                  <div className="flex" style={{ gap: 5, flexWrap: "wrap", marginTop: 6 }}>
                    {Object.entries(m.applied).map(([k, code]) => (
                      <span key={k} className="badge green" style={{ fontSize: 10.5 }} title={labelFor(k)}>
                        {labelFor(k)}: {descFor(k, code) || code}
                      </span>
                    ))}
                  </div>
                )}
                {/* Warnings (warn-but-allow) */}
                {m.role === "assistant" && (m.warnings?.length || 0) > 0 && (
                  <div style={{ marginTop: 6 }}>
                    {m.warnings!.map((w, j) => (
                      <div key={j} style={{ fontSize: 11.5, color: "var(--amber, #b7791f)" }}>⚠ {w.message}</div>
                    ))}
                  </div>
                )}
                {m.role === "assistant" && m.source && (
                  <div className="muted" style={{ fontSize: 10, marginTop: 3 }}>
                    {m.source === "ai" ? "grounded in catalog + AI" : "grounded in catalog data"}
                  </div>
                )}
              </div>
            ))}
            {busy && <div className="muted" style={{ fontSize: 12 }}>Thinking…</div>}
          </div>

          {/* One-click next-step options */}
          {showChips && (
            <div style={{ marginTop: 10 }}>
              <div className="muted" style={{ fontSize: 11.5, marginBottom: 5 }}>Pick a {last!.nextLabel || labelFor(last!.nextField!)}:</div>
              <div className="flex" style={{ gap: 6, flexWrap: "wrap" }}>
                {last!.options!.slice(0, 8).map((o) => (
                  <button key={o.code} type="button" className="btn sm" disabled={busy}
                    title={o.count ? `${o.count} existing part(s) use this` : "Not yet used for this family"}
                    onClick={() => chooseOption(last!.nextField!, o)}>
                    {o.meaning || o.code}{o.count ? <span className="muted" style={{ fontSize: 10 }}> ({o.count})</span> : null}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="flex" style={{ gap: 8, marginTop: 12 }}>
            <input className="input" style={{ flex: 1 }} value={input}
              placeholder="Describe the fixture, or answer the agent…"
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && send(input)} disabled={busy} />
            <button className="btn primary" onClick={() => send(input)} disabled={busy || !input.trim()}>Send</button>
          </div>
        </div>
      )}
    </div>
  );
}
