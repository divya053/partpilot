import { useState } from "react";
import { useAuth } from "../lib/auth";

const DEMOS = [
  { role: "Master", username: "master", password: "master123" },
  { role: "Creator", username: "creator", password: "creator123" },
  { role: "Viewer", username: "viewer", password: "viewer123" },
];

export default function Login() {
  const { login } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(""); setBusy(true);
    try {
      await login(username, password);
    } catch (err) {
      setError((err as Error).message || "Login failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="login-wrap">
      <form className="login-card" onSubmit={submit}>
        <div className="logo">PART<span>PILOT</span></div>
        <div className="sub">IKIO Part Number Builder — sign in</div>

        <div className="grid" style={{ gap: 14 }}>
          <div className="field">
            <label>Username</label>
            <input className="input" value={username} autoFocus
              onChange={(e) => setUsername(e.target.value)} placeholder="master" />
          </div>
          <div className="field">
            <label>Password</label>
            <input className="input" type="password" value={password}
              onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" />
          </div>
          {error && <div className="badge red" style={{ justifyContent: "center", padding: "8px" }}>{error}</div>}
          <button className="btn primary" style={{ justifyContent: "center", padding: "11px" }} disabled={busy}>
            {busy ? "Signing in…" : "Sign In"}
          </button>
        </div>

        <div className="divider" />
        <div className="muted" style={{ fontSize: 12, marginBottom: 8 }}>Quick demo logins:</div>
        <div className="grid" style={{ gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
          {DEMOS.map((d) => (
            <div key={d.username} className="demo-chip" onClick={() => { setUsername(d.username); setPassword(d.password); }}>
              <div style={{ fontWeight: 700 }}>{d.role}</div>
              <div className="muted">{d.username}</div>
            </div>
          ))}
        </div>
      </form>
    </div>
  );
}
