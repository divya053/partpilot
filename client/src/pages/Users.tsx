import { useEffect, useState } from "react";
import { Layout } from "../components/Layout";
import { Modal } from "../components/Modal";
import { Field, Spinner, useConfirm } from "../components/ui";
import { api } from "../lib/api";
import { useToast } from "../lib/toast";
import { User } from "../lib/types";

const ROLE_BADGE: Record<string, string> = { master: "green", creator: "blue", viewer: "gray" };

export default function Users() {
  const toast = useToast();
  const { confirm, node } = useConfirm();
  const [rows, setRows] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<any | null>(null);
  const [saving, setSaving] = useState(false);

  const load = () => { setLoading(true); api.get<User[]>("/users").then(setRows).catch((e) => toast(e.message, "error")).finally(() => setLoading(false)); };
  useEffect(load, []);

  const save = async () => {
    setSaving(true);
    try {
      if (editing.id) { await api.patch(`/users/${editing.id}`, editing); toast("User updated", "success"); }
      else { await api.post("/users", editing); toast("User created", "success"); }
      setEditing(null); load();
    } catch (e) { toast((e as Error).message, "error"); } finally { setSaving(false); }
  };
  const remove = async (u: User) => {
    if (!(await confirm(`Delete user ${u.username}?`))) return;
    try { await api.del(`/users/${u.id}`); toast("User deleted", "success"); load(); }
    catch (e) { toast((e as Error).message, "error"); }
  };

  return (
    <Layout title="User Management" subtitle="Manage accounts and role-based access."
      actions={<button className="btn primary" onClick={() => setEditing({ username: "", displayName: "", role: "viewer", password: "" })}>+ Add User</button>}>
      <div className="card">
        {loading ? <Spinner /> : (
          <div className="table-wrap">
            <table className="tbl">
              <thead><tr><th>User</th><th>Username</th><th>Role</th><th>Status</th><th style={{ textAlign: "right" }}>Actions</th></tr></thead>
              <tbody>
                {rows.map((u) => (
                  <tr key={u.id}>
                    <td><strong>{u.displayName}</strong></td>
                    <td className="mono muted">{u.username}</td>
                    <td><span className={`badge ${ROLE_BADGE[u.role] || "gray"}`} style={{ textTransform: "capitalize" }}>{u.role}</span></td>
                    <td><span className={`badge ${u.status === "active" ? "green" : "gray"} dot`}>{u.status}</span></td>
                    <td>
                      <div className="actions-cell" style={{ justifyContent: "flex-end" }}>
                        <button className="icon-btn" onClick={() => setEditing({ ...u, password: "" })}>✎</button>
                        <button className="icon-btn danger" onClick={() => remove(u)}>🗑</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="card card-pad" style={{ marginTop: 16 }}>
        <h3 style={{ marginBottom: 8 }}>Role capabilities</h3>
        <div className="kv"><span className="k"><span className="badge green">Master</span></span><span className="v muted">Full control incl. user management, settings, delete</span></div>
        <div className="kv"><span className="k"><span className="badge blue">Creator</span></span><span className="v muted">Create / edit / import part numbers</span></div>
        <div className="kv"><span className="k"><span className="badge gray">Viewer</span></span><span className="v muted">Read-only access</span></div>
      </div>

      {editing && (
        <Modal title={editing.id ? "Edit User" : "New User"} onClose={() => setEditing(null)}
          footer={<><button className="btn" onClick={() => setEditing(null)}>Cancel</button><button className="btn primary" onClick={save} disabled={saving}>{saving ? "Saving…" : "Save"}</button></>}>
          <div className="grid" style={{ gap: 14 }}>
            <Field label="Display Name" required><input className="input" value={editing.displayName} onChange={(e) => setEditing({ ...editing, displayName: e.target.value })} /></Field>
            <Field label="Username" required><input className="input mono" value={editing.username} disabled={!!editing.id} onChange={(e) => setEditing({ ...editing, username: e.target.value })} /></Field>
            <Field label="Role" required>
              <select className="select" value={editing.role} onChange={(e) => setEditing({ ...editing, role: e.target.value })}>
                <option value="master">Master</option><option value="creator">Creator</option><option value="viewer">Viewer</option>
              </select>
            </Field>
            {editing.id && <Field label="Status">
              <select className="select" value={editing.status} onChange={(e) => setEditing({ ...editing, status: e.target.value })}>
                <option value="active">Active</option><option value="inactive">Inactive</option>
              </select>
            </Field>}
            <Field label={editing.id ? "New Password" : "Password"} required={!editing.id} hint={editing.id ? "Leave blank to keep current password" : undefined}>
              <input className="input" type="password" value={editing.password} onChange={(e) => setEditing({ ...editing, password: e.target.value })} />
            </Field>
          </div>
        </Modal>
      )}
      {node}
    </Layout>
  );
}
