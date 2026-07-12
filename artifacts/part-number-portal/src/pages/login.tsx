import { useState } from "react";
import { Boxes, Loader2, ShieldCheck, LogIn } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/lib/auth";

const DEMO_ACCOUNTS = [
  { username: "master", password: "master123", role: "Master", desc: "Full control + user management" },
  { username: "creator", password: "creator123", role: "Creator", desc: "Build & edit parts" },
  { username: "viewer", password: "viewer123", role: "Viewer", desc: "Read-only access" },
];

export default function Login() {
  const { login } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password) return;
    setSubmitting(true);
    setError(null);
    try {
      await login(username.trim(), password);
    } catch {
      setError("Invalid username or password.");
      setSubmitting(false);
    }
  };

  const quickFill = (u: string, p: string) => {
    setUsername(u);
    setPassword(p);
    setError(null);
  };

  return (
    <div className="flex min-h-screen w-full items-center justify-center bg-sidebar p-4 text-sidebar-foreground">
      <div className="w-full max-w-md">
        <div className="mb-8 flex flex-col items-center text-center">
          <div className="mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br from-primary to-violet-500 text-white shadow-lg shadow-primary/30">
            <Boxes className="h-7 w-7" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight">PartPilot</h1>
          <p className="mt-1 text-sm text-sidebar-foreground/60">AI-assisted part number intelligence · Sign in to continue</p>
        </div>

        <form
          onSubmit={submit}
          className="space-y-4 rounded-2xl border border-sidebar-border bg-card/5 p-6 shadow-xl backdrop-blur"
        >
          <div className="space-y-2">
            <Label htmlFor="username" className="text-sidebar-foreground">Username</Label>
            <Input
              id="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoFocus
              autoComplete="username"
              placeholder="master"
              className="border-white/10 bg-white/5 text-sidebar-foreground placeholder:text-sidebar-foreground/30"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password" className="text-sidebar-foreground">Password</Label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              placeholder="••••••••"
              className="border-white/10 bg-white/5 text-sidebar-foreground placeholder:text-sidebar-foreground/30"
            />
          </div>

          {error ? (
            <p className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-red-300">
              {error}
            </p>
          ) : null}

          <Button type="submit" className="w-full" disabled={submitting || !username.trim() || !password}>
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogIn className="h-4 w-4" />}
            {submitting ? "Signing in…" : "Sign in"}
          </Button>
        </form>

        <div className="mt-6 rounded-2xl border border-sidebar-border bg-white/[0.02] p-4">
          <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-sidebar-foreground/50">
            <ShieldCheck className="h-3.5 w-3.5" />
            Demo accounts — click to fill
          </div>
          <div className="space-y-2">
            {DEMO_ACCOUNTS.map((a) => (
              <button
                key={a.username}
                type="button"
                onClick={() => quickFill(a.username, a.password)}
                className="flex w-full items-center justify-between rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-left transition-colors hover:border-primary/40 hover:bg-white/[0.06]"
              >
                <div>
                  <p className="text-sm font-semibold text-sidebar-foreground">{a.role}</p>
                  <p className="text-xs text-sidebar-foreground/50">{a.desc}</p>
                </div>
                <code className="rounded bg-white/5 px-2 py-1 text-[11px] text-sidebar-foreground/70">
                  {a.username} / {a.password}
                </code>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
