import React, { useEffect, useState, useMemo, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Users, UserPlus, RefreshCw, Shield, Trash2, KeyRound, Search,
  ChevronUp, ChevronDown, Crown, BadgeCheck,
} from "lucide-react";
import axios from "axios";
import { useAuth } from "../context/AuthContext";
import { Skeleton, ConfirmDialog } from "../components/ui/Premium";

/**
 * PROTO PANEL — user & role management (administrators only).
 * Self-contained CRUD against the real /api/system/users endpoints:
 *   GET / POST /api/system/users · PUT /:id/role · PUT /:id/password · DELETE /:id
 * The backend enforces admin rights on every one of them.
 */

interface PanelUser {
  id: string;
  username: string;
  role: "owner" | "admin" | "user" | string;
  createdAt?: string;
  googleId?: string;
}

export default function AdminUsersPage() {
  const { user: me } = useAuth();
  const [users, setUsers] = useState<PanelUser[] | null>(null);
  const [query, setQuery] = useState("");
  const [sortDesc, setSortDesc] = useState(true);
  const [notice, setNotice] = useState<{ text: string; ok: boolean } | null>(null);

  // create form
  const [nu, setNu] = useState({ username: "", password: "", role: "user" });
  const [creating, setCreating] = useState(false);

  // dialogs
  const [confirmDelete, setConfirmDelete] = useState<PanelUser | null>(null);
  const [pwTarget, setPwTarget] = useState<PanelUser | null>(null);
  const [newPw, setNewPw] = useState("");
  const [roleTarget, setRoleTarget] = useState<{ user: PanelUser; role: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const flash = (text: string, ok: boolean) => {
    setNotice({ text, ok });
    setTimeout(() => setNotice(null), 4000);
  };

  const load = useCallback(async () => {
    setUsers(null);
    try {
      const res = await axios.get("/api/system/users");
      setUsers(Array.isArray(res.data) ? res.data : []);
    } catch {
      setUsers([]);
      flash("Could not load users.", false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const filtered = useMemo(() => {
    if (!users) return null;
    const f = users.filter((u) =>
      !query || u.username.toLowerCase().includes(query.toLowerCase())
    );
    return f.sort((a, b) => {
      const r = (a.username || "").localeCompare(b.username || "");
      return sortDesc ? -r : r;
    });
  }, [users, query, sortDesc]);

  const createUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    try {
      await axios.post("/api/system/users", nu);
      flash(`Created user "${nu.username}".`, true);
      setNu({ username: "", password: "", role: "user" });
      await load();
    } catch (err: any) {
      flash(err.response?.data?.error || "Create failed.", false);
    } finally {
      setCreating(false);
    }
  };

  const doDelete = async () => {
    if (!confirmDelete) return;
    setBusy(true);
    try {
      await axios.delete(`/api/system/users/${confirmDelete.id}`);
      flash(`Deleted ${confirmDelete.username}.`, true);
      setConfirmDelete(null);
      await load();
    } catch (err: any) {
      flash(err.response?.data?.error || "Delete failed.", false);
    } finally {
      setBusy(false);
    }
  };

  const doRole = async () => {
    if (!roleTarget) return;
    setBusy(true);
    try {
      await axios.put(`/api/system/users/${roleTarget.user.id}/role`, { role: roleTarget.role });
      flash(`${roleTarget.user.username} is now ${roleTarget.role}.`, true);
      setRoleTarget(null);
      await load();
    } catch (err: any) {
      flash(err.response?.data?.error || "Role change failed.", false);
    } finally {
      setBusy(false);
    }
  };

  const doPassword = async () => {
    if (!pwTarget || !newPw) return;
    setBusy(true);
    try {
      await axios.put(`/api/system/users/${pwTarget.id}/password`, { password: newPw });
      flash(`Password updated for ${pwTarget.username}.`, true);
      setPwTarget(null);
      setNewPw("");
    } catch (err: any) {
      flash(err.response?.data?.error || "Password update failed.", false);
    } finally {
      setBusy(false);
    }
  };

  const genPw = () => {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
    let out = "";
    const arr = new Uint32Array(16);
    crypto.getRandomValues(arr);
    for (let i = 0; i < 16; i++) out += chars[arr[i] % chars.length];
    setNewPw(out);
  };

  const roleBadge = (role: string) => {
    if (role === "owner")
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-amber-500/12 text-amber-300 shadow-[inset_0_0_0_1px_rgba(251,191,36,0.3)]">
          <Crown size={10} /> OWNER
        </span>
      );
    if (role === "admin")
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-blue-500/12 text-blue-300 shadow-[inset_0_0_0_1px_rgba(59,130,246,0.3)]">
          <Shield size={10} /> ADMIN
        </span>
      );
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-slate-500/12 text-slate-400 shadow-[inset_0_0_0_1px_rgba(148,163,184,0.25)]">
        <BadgeCheck size={10} /> USER
      </span>
    );
  };

  return (
    <div className="p-4 md:p-6 lg:p-8 max-w-[1200px] mx-auto w-full space-y-5">
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col md:flex-row md:items-end justify-between gap-3">
        <div>
          <p className="pp-section-label">Administration</p>
          <h1 className="mt-1 font-display text-2xl md:text-[26px] font-bold tracking-tight">
            User <span className="pp-gradient-text">Management</span>
          </h1>
          <p className="mt-1 text-sm text-muted-foreground flex items-center gap-1.5">
            <Users size={13} /> Accounts, roles and passwords · changes take effect immediately
          </p>
        </div>
        <button onClick={load} className="pp-btn-ghost px-3.5 py-2 text-xs gap-2 self-start md:self-auto">
          <RefreshCw size={13} /> Refresh
        </button>
      </motion.div>

      <AnimatePresence>
        {notice && (
          <motion.div
            initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
            className={`px-4 py-2.5 rounded-xl text-xs font-medium border ${
              notice.ok
                ? "bg-emerald-500/10 border-emerald-500/25 text-emerald-300"
                : "bg-red-500/10 border-red-500/25 text-red-300"
            }`}
          >
            {notice.text}
          </motion.div>
        )}
      </AnimatePresence>

      {/* create user */}
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }} className="pp-card p-5">
        <h3 className="font-display font-semibold text-sm mb-4 flex items-center gap-2">
          <UserPlus size={15} className="text-blue-400" /> Create New User
        </h3>
        <form onSubmit={createUser} className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <input
            required
            value={nu.username}
            onChange={(e) => setNu({ ...nu, username: e.target.value })}
            placeholder="Username"
            autoComplete="off"
          />
          <input
            required
            type="password"
            value={nu.password}
            onChange={(e) => setNu({ ...nu, password: e.target.value })}
            placeholder="Password"
            autoComplete="new-password"
          />
          <select value={nu.role} onChange={(e) => setNu({ ...nu, role: e.target.value })}>
            <option value="user">user</option>
            <option value="admin">admin</option>
          </select>
          <button type="submit" className="pp-btn py-2.5 text-sm" disabled={creating}>
            {creating ? "Creating…" : "Create User"}
          </button>
        </form>
      </motion.div>

      {/* users table */}
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="pp-card overflow-hidden">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 border-b border-border-subtle">
          <h3 className="font-display font-semibold text-sm flex items-center gap-2">
            <Users size={15} className="text-blue-400" />
            All Users
            {users && <span className="font-mono text-[11px] text-muted-foreground">({users.length})</span>}
          </h3>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search users…"
                className="!pl-9 !py-2 !text-xs !w-full sm:!w-56"
              />
            </div>
            <button
              onClick={() => setSortDesc(!sortDesc)}
              className="pp-btn-ghost px-2.5 py-2"
              title={sortDesc ? "Sort A→Z" : "Sort Z→A"}
            >
              {sortDesc ? <ChevronDown size={13} /> : <ChevronUp size={13} />}
            </button>
          </div>
        </div>

        {filtered === null ? (
          <div className="p-4 space-y-2">
            {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}
          </div>
        ) : (
          <div className="overflow-x-auto custom-scrollbar">
            <table className="w-full text-left min-w-[680px]">
              <thead>
                <tr className="text-[10px] uppercase tracking-wider text-muted-foreground border-b border-border-subtle">
                  <th className="px-4 py-3 font-semibold">User</th>
                  <th className="px-4 py-3 font-semibold">Role</th>
                  <th className="px-4 py-3 font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((u, i) => (
                  <motion.tr
                    key={u.id}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: Math.min(i * 0.03, 0.3) }}
                    className="border-b border-border-subtle last:border-0 hover:bg-muted/25 transition-colors"
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-lg flex items-center justify-center text-[11px] font-bold text-white flex-shrink-0"
                          style={{ background: "linear-gradient(135deg,#2563eb,#22d3ee)" }}>
                          {u.username?.[0]?.toUpperCase() || "U"}
                        </div>
                        <div>
                          <p className="text-xs font-semibold text-foreground">
                            {u.username}
                            {u.id === me?.id && <span className="ml-1.5 text-[10px] text-blue-400">(you)</span>}
                          </p>
                          {u.googleId && <p className="text-[10px] text-muted-foreground">Google-linked</p>}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">{roleBadge(u.role)}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        {u.role !== "owner" && (
                          <button
                            onClick={() => setRoleTarget({ user: u, role: u.role === "admin" ? "user" : "admin" })}
                            className="pp-btn-ghost px-2.5 py-1.5 text-[11px] gap-1.5"
                            title={u.role === "admin" ? "Demote to user" : "Promote to admin"}
                          >
                            <Shield size={11} /> {u.role === "admin" ? "Demote" : "Promote"}
                          </button>
                        )}
                        <button
                          onClick={() => { setPwTarget(u); setNewPw(""); }}
                          className="pp-btn-ghost px-2.5 py-1.5 text-[11px] gap-1.5"
                          title="Set new password"
                        >
                          <KeyRound size={11} /> Password
                        </button>
                        {u.id !== me?.id && (
                          <button
                            onClick={() => setConfirmDelete(u)}
                            className="p-2 rounded-lg text-muted-foreground hover:text-red-400 hover:bg-red-500/10 transition-colors"
                            title="Delete user"
                          >
                            <Trash2 size={13} />
                          </button>
                        )}
                      </div>
                    </td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </motion.div>

      {/* dialogs */}
      <ConfirmDialog
        open={!!confirmDelete}
        title="Delete user"
        message={<>Permanently delete <span className="font-semibold text-foreground">{confirmDelete?.username}</span>? Their sessions become invalid immediately.</>}
        confirmLabel="Delete"
        danger
        busy={busy}
        onCancel={() => setConfirmDelete(null)}
        onConfirm={doDelete}
      />
      <ConfirmDialog
        open={!!roleTarget}
        title={roleTarget?.role === "admin" ? "Demote to user" : "Promote to admin"}
        message={<>Change <span className="font-semibold text-foreground">{roleTarget?.user.username}</span> to <span className="font-mono text-blue-300">{roleTarget?.role}</span>?</>}
        confirmLabel="Change role"
        busy={busy}
        onCancel={() => setRoleTarget(null)}
        onConfirm={doRole}
      />

      {/* password dialog */}
      <AnimatePresence>
        {pwTarget && (
          <motion.div
            className="fixed inset-0 z-[100] flex items-center justify-center p-4"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          >
            <div className="absolute inset-0 bg-[rgba(2,4,10,0.72)] backdrop-blur-sm" onClick={() => setPwTarget(null)} />
            <motion.div
              initial={{ opacity: 0, scale: 0.94, y: 12 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 8 }}
              className="relative w-full max-w-sm pp-card p-6 !bg-[#0c1224]/95"
            >
              <h3 className="font-display font-bold text-[15px] mb-1">Set password</h3>
              <p className="text-xs text-muted-foreground mb-4">
                New password for <span className="font-semibold text-foreground">{pwTarget.username}</span>. Their old sessions are invalidated.
              </p>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newPw}
                  onChange={(e) => setNewPw(e.target.value)}
                  placeholder="New password"
                  className="font-mono"
                  autoFocus
                />
                <button onClick={genPw} className="pp-btn-ghost px-3 text-xs whitespace-nowrap" title="Generate strong password">
                  Generate
                </button>
              </div>
              <div className="mt-5 flex justify-end gap-2.5">
                <button className="pp-btn-ghost px-4 py-2 text-sm" onClick={() => setPwTarget(null)}>Cancel</button>
                <button className="pp-btn px-4 py-2 text-sm" disabled={!newPw || busy} onClick={doPassword}>
                  {busy ? "Saving…" : "Save"}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
