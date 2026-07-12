import { useState } from "react";
import {
  useListUsers,
  useCreateUser,
  useUpdateUser,
  useDeleteUser,
  type AuthUser,
  type Role,
} from "@workspace/api-client-react";
import { UserPlus, Trash2, Shield, Loader2, KeyRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useAuth, ROLE_LABELS } from "@/lib/auth";

const ROLES: Role[] = ["master", "creator", "viewer"];

const ROLE_BADGE: Record<Role, string> = {
  master: "bg-primary/15 text-primary border-primary/30",
  creator: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30",
  viewer: "bg-muted text-muted-foreground border-border",
};

export default function Users() {
  const { user: me } = useAuth();
  const { toast } = useToast();
  const { data: users, isLoading, refetch } = useListUsers();
  const { mutateAsync: createUser, isPending: creating } = useCreateUser();
  const { mutateAsync: updateUser } = useUpdateUser();
  const { mutateAsync: deleteUser } = useDeleteUser();

  const [addOpen, setAddOpen] = useState(false);
  const [form, setForm] = useState({ username: "", displayName: "", password: "", role: "viewer" as Role });
  const [pwUser, setPwUser] = useState<AuthUser | null>(null);
  const [newPw, setNewPw] = useState("");

  const handleAdd = async () => {
    if (!form.username.trim() || !form.displayName.trim() || form.password.length < 6) {
      toast({ title: "Missing fields", description: "Username, name, and a 6+ char password are required.", variant: "destructive" });
      return;
    }
    try {
      await createUser({ data: { ...form, username: form.username.trim(), displayName: form.displayName.trim() } });
      toast({ title: "User created", description: `${form.username} (${ROLE_LABELS[form.role]})` });
      setAddOpen(false);
      setForm({ username: "", displayName: "", password: "", role: "viewer" });
      refetch();
    } catch (err: any) {
      toast({ title: "Create failed", description: err?.data?.error ?? "Could not create user.", variant: "destructive" });
    }
  };

  const handleRole = async (u: AuthUser, role: Role) => {
    try {
      await updateUser({ id: u.id, data: { role } });
      toast({ title: "Role updated", description: `${u.username} is now ${ROLE_LABELS[role]}.` });
      refetch();
    } catch (err: any) {
      toast({ title: "Update failed", description: err?.data?.error ?? "Could not change role.", variant: "destructive" });
    }
  };

  const handleResetPw = async () => {
    if (!pwUser || newPw.length < 6) {
      toast({ title: "Password too short", description: "Use at least 6 characters.", variant: "destructive" });
      return;
    }
    try {
      await updateUser({ id: pwUser.id, data: { password: newPw } });
      toast({ title: "Password reset", description: `New password set for ${pwUser.username}.` });
      setPwUser(null);
      setNewPw("");
    } catch (err: any) {
      toast({ title: "Reset failed", description: err?.data?.error ?? "Could not reset password.", variant: "destructive" });
    }
  };

  const handleDelete = async (u: AuthUser) => {
    try {
      await deleteUser({ id: u.id });
      toast({ title: "User deleted", description: u.username });
      refetch();
    } catch (err: any) {
      toast({ title: "Delete failed", description: err?.data?.error ?? "Could not delete user.", variant: "destructive" });
    }
  };

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground flex items-center gap-2">
            <Shield className="h-7 w-7 text-primary" /> User Management
          </h1>
          <p className="text-muted-foreground mt-1">Create users and control who can build, edit, or just view.</p>
        </div>
        <Dialog open={addOpen} onOpenChange={setAddOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2"><UserPlus className="h-4 w-4" /> Add User</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Add a new user</DialogTitle></DialogHeader>
            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <Label>Username</Label>
                <Input value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} placeholder="jsmith" />
              </div>
              <div className="space-y-2">
                <Label>Display Name</Label>
                <Input value={form.displayName} onChange={(e) => setForm({ ...form, displayName: e.target.value })} placeholder="Jane Smith" />
              </div>
              <div className="space-y-2">
                <Label>Password</Label>
                <Input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder="min 6 characters" />
              </div>
              <div className="space-y-2">
                <Label>Role</Label>
                <Select value={form.role} onValueChange={(v) => setForm({ ...form, role: v as Role })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {ROLES.map((r) => <SelectItem key={r} value={r}>{ROLE_LABELS[r]}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setAddOpen(false)}>Cancel</Button>
              <Button onClick={handleAdd} disabled={creating}>
                {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Create
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
        <table className="w-full text-sm text-left">
          <thead className="bg-muted/50 text-muted-foreground uppercase text-xs">
            <tr>
              <th className="px-6 py-3 font-semibold">User</th>
              <th className="px-6 py-3 font-semibold">Username</th>
              <th className="px-6 py-3 font-semibold">Role</th>
              <th className="px-6 py-3 font-semibold text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {isLoading ? (
              [1, 2, 3].map((i) => (
                <tr key={i}><td colSpan={4} className="px-6 py-4"><div className="h-5 animate-pulse rounded bg-muted" /></td></tr>
              ))
            ) : (users ?? []).map((u) => {
              const isSelf = me?.id === u.id;
              return (
                <tr key={u.id} className="hover:bg-muted/20">
                  <td className="px-6 py-3">
                    <div className="flex items-center gap-3">
                      <div className="grid h-8 w-8 place-items-center rounded-full bg-gradient-to-br from-primary to-violet-500 text-xs font-bold text-white">
                        {u.displayName.slice(0, 2).toUpperCase()}
                      </div>
                      <span className="font-medium text-foreground">{u.displayName}{isSelf ? " (you)" : ""}</span>
                    </div>
                  </td>
                  <td className="px-6 py-3 font-mono text-muted-foreground">{u.username}</td>
                  <td className="px-6 py-3">
                    <Select value={u.role} onValueChange={(v) => handleRole(u, v as Role)}>
                      <SelectTrigger className={`h-8 w-32 border ${ROLE_BADGE[u.role]}`}><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {ROLES.map((r) => <SelectItem key={r} value={r}>{ROLE_LABELS[r]}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </td>
                  <td className="px-6 py-3">
                    <div className="flex items-center justify-end gap-1">
                      <Button variant="ghost" size="icon" className="h-8 w-8" title="Reset password" onClick={() => { setPwUser(u); setNewPw(""); }}>
                        <KeyRound className="h-4 w-4 text-muted-foreground" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive hover:bg-destructive/10 disabled:opacity-30"
                        title={isSelf ? "You can't delete yourself" : "Delete user"}
                        disabled={isSelf}
                        onClick={() => handleDelete(u)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <Dialog open={!!pwUser} onOpenChange={(o) => { if (!o) setPwUser(null); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Reset password{pwUser ? ` — ${pwUser.username}` : ""}</DialogTitle></DialogHeader>
          <div className="space-y-2 py-2">
            <Label>New password</Label>
            <Input type="password" value={newPw} onChange={(e) => setNewPw(e.target.value)} placeholder="min 6 characters" autoFocus />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPwUser(null)}>Cancel</Button>
            <Button onClick={handleResetPw}>Set password</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
