import { useEffect, useState } from "react";
import { Layout } from "../components/Layout";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";

export default function Settings() {
  const { user } = useAuth();
  const [ai, setAi] = useState<boolean | null>(null);
  useEffect(() => { api.get<{ enabled: boolean }>("/ai/status").then((r) => setAi(r.enabled)).catch(() => setAi(false)); }, []);

  return (
    <Layout title="Settings" subtitle="Your profile and system configuration.">
      <div className="row" style={{ alignItems: "flex-start" }}>
        <div className="card card-pad" style={{ flex: 1 }}>
          <h3 style={{ marginBottom: 12 }}>Profile</h3>
          <div className="kv"><span className="k">Name</span><span className="v">{user?.displayName}</span></div>
          <div className="kv"><span className="k">Username</span><span className="v mono">{user?.username}</span></div>
          <div className="kv"><span className="k">Role</span><span className="v" style={{ textTransform: "capitalize" }}>{user?.role}</span></div>
        </div>

        <div className="card card-pad" style={{ flex: 1 }}>
          <h3 style={{ marginBottom: 12 }}>AI Assistant</h3>
          <div className="kv"><span className="k">Provider</span><span className="v">{ai === null ? "…" : ai ? <span className="badge green dot">Connected</span> : <span className="badge gray dot">Deterministic only</span>}</span></div>
          <p className="muted" style={{ fontSize: 12.5, marginTop: 10 }}>
            {ai ? "A free/local AI provider is configured. Explanations and the assistant use live AI." :
              "No AI key configured — insights and explanations run on deterministic, data-grounded analysis. Add a free Groq key (GROQ_API_KEY) or a local endpoint (AI_BASE_URL) in server/.env to enable AI narratives."}
          </p>
        </div>
      </div>

      <div className="card card-pad" style={{ marginTop: 16 }}>
        <h3 style={{ marginBottom: 12 }}>About PartPilot</h3>
        <div className="kv"><span className="k">Part-number format</span><span className="v mono">IK-{"{model}{ver}"}-{"{size}"}-{"{power}"}-…-BFU</span></div>
        <div className="kv"><span className="k">Database</span><span className="v mono">MySQL · partpilot</span></div>
        <div className="kv"><span className="k">Version</span><span className="v">1.0.0</span></div>
      </div>
    </Layout>
  );
}
