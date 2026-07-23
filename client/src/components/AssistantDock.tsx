import { useEffect, useRef, useState } from "react";
import { api } from "../lib/api";

type Msg = { role: "user" | "bot"; text: string };

const QUICK_QUESTIONS = [
  "How are part numbers created?",
  "Registry summary",
  "What does MV mean?",
  "Show UHB series",
];

export function AssistantDock() {
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([
    { role: "bot", text: "Hi! I'm the PartPilot assistant. Ask me anything — decode a part number, code meanings, series or company lookups, registry summary. I only advise — I never change data." },
  ]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [msgs, busy]);

  const ask = async (question: string) => {
    const q = question.trim();
    if (!q || busy) return;
    setMsgs((m) => [...m, { role: "user", text: q }]);
    setInput("");
    setBusy(true);
    try {
      const res = await api.post<{ answer: string }>("/ai/ask", { question: q });
      setMsgs((m) => [...m, { role: "bot", text: res.answer }]);
    } catch {
      setMsgs((m) => [...m, { role: "bot", text: "Sorry, I couldn't answer that right now." }]);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <button className="ai-fab" title="AI Assistant" onClick={() => setOpen((o) => !o)}>
        {open ? "×" : "✦"}
      </button>
      {open && (
        <div className="ai-panel">
          <div className="ai-head">
            <span className="avatar" style={{ width: 28, height: 28, fontSize: 13 }}>✦</span>
            <div>
              <div style={{ fontWeight: 600, fontSize: 14 }}>PartPilot Assistant</div>
              <div className="muted" style={{ fontSize: 11 }}>Advisory · answers from your registry data</div>
            </div>
          </div>
          <div className="ai-msgs">
            {msgs.map((m, i) => (
              <div key={i} className={`ai-msg ${m.role}`} style={{ whiteSpace: "pre-wrap" }}>{m.text}</div>
            ))}
            {busy && <div className="ai-msg bot"><span className="spinner" style={{ width: 14, height: 14 }} /></div>}
            <div ref={endRef} />
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, padding: "0 12px 8px" }}>
            {QUICK_QUESTIONS.map((qq) => (
              <button key={qq} className="btn sm" style={{ fontSize: 11.5 }} onClick={() => ask(qq)} disabled={busy}>
                {qq}
              </button>
            ))}
          </div>
          <div className="ai-input">
            <input className="input" placeholder="Ask about your part numbers…" value={input}
              onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && ask(input)} />
            <button className="btn primary" onClick={() => ask(input)} disabled={busy}>Send</button>
          </div>
        </div>
      )}
    </>
  );
}
