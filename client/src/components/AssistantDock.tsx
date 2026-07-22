import { useState } from "react";
import { api } from "../lib/api";

type Msg = { role: "user" | "bot"; text: string };

export function AssistantDock() {
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([
    { role: "bot", text: "Hi! I'm the PartPilot assistant. Ask me about part numbers, drivers, or registry health. I only advise — I never change data." },
  ]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);

  const send = async () => {
    const q = input.trim();
    if (!q || busy) return;
    setMsgs((m) => [...m, { role: "user", text: q }]);
    setInput("");
    setBusy(true);
    try {
      const res = await api.post<{ answer: string }>("/ai/ask", { question: q });
      setMsgs((m) => [...m, { role: "bot", text: res.answer }]);
    } catch (e) {
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
              <div className="muted" style={{ fontSize: 11 }}>Advisory · data-aware</div>
            </div>
          </div>
          <div className="ai-msgs">
            {msgs.map((m, i) => <div key={i} className={`ai-msg ${m.role}`}>{m.text}</div>)}
            {busy && <div className="ai-msg bot"><span className="spinner" style={{ width: 14, height: 14 }} /></div>}
          </div>
          <div className="ai-input">
            <input className="input" placeholder="Ask about your part numbers…" value={input}
              onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && send()} />
            <button className="btn primary" onClick={send} disabled={busy}>Send</button>
          </div>
        </div>
      )}
    </>
  );
}
