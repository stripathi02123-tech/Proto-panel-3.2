import React, { useEffect, useState, useMemo, useCallback } from "react";
import { Link } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { HardDrive, RefreshCw, Download, Trash2, RotateCcw, ArchiveRestore, ChevronDown, Server } from "lucide-react";
import axios from "axios";
import { useAuth } from "../context/AuthContext";
import { Skeleton, ConfirmDialog, fmtBytes, timeAgo } from "../components/ui/Premium";

/**
 * PROTO PANEL — backup center.
 * Aggregates the real per-server backups from GET /api/servers/:id/backups.
 * Users see their own instances; administrators see the whole fleet.
 * (Ownership is enforced server-side by checkServerFileAccess.)
 */

interface Backup {
  filename: string;
  size: number;
  createdAt: string;
}

interface ServerBackups {
  server: { id: string; name: string; status: string };
  backups: Backup[];
  error?: boolean;
}

export default function BackupsPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin" || user?.role === "owner";
  const [data, setData] = useState<ServerBackups[] | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [confirm, setConfirm] = useState<{ type: "delete" | "restore"; serverId: string; serverName: string; filename: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ text: string; ok: boolean } | null>(null);

  const load = useCallback(async () => {
    setData(null);
    try {
      const res = await axios.get("/api/servers");
      const servers: any[] = Array.isArray(res.data) ? res.data : [];
      const results = await Promise.all(
        servers.map(async (s) => {
          try {
            const b = await axios.get(`/api/servers/${s.id}/backups`);
            return { server: { id: s.id, name: s.name, status: s.status }, backups: b.data || [] };
          } catch {
            return { server: { id: s.id, name: s.name, status: s.status }, backups: [], error: true };
          }
        })
      );
      // servers with backups first, then by newest backup
      results.sort((a, b) => {
        const la = a.backups[0] ? +new Date(a.backups[0].createdAt) : 0;
        const lb = b.backups[0] ? +new Date(b.backups[0].createdAt) : 0;
        return lb - la;
      });
      setData(results);
    } catch {
      setData([]);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const totals = useMemo(() => {
    if (!data) return { count: 0, size: 0 };
    return {
      count: data.reduce((a, d) => a + d.backups.length, 0),
      size: data.reduce((a, d) => a + d.backups.reduce((x, b) => x + b.size, 0), 0),
    };
  }, [data]);

  const toggle = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const token = localStorage.getItem("proto_token");

  const doDelete = async () => {
    if (!confirm || confirm.type !== "delete") return;
    setBusy(true);
    try {
      await axios.delete(`/api/servers/${confirm.serverId}/backups/${encodeURIComponent(confirm.filename)}`);
      setNotice({ text: `Deleted ${confirm.filename}`, ok: true });
      setConfirm(null);
      await load();
    } catch {
      setNotice({ text: "Delete failed — check permissions.", ok: false });
    } finally {
      setBusy(false);
    }
  };

  const doRestore = async () => {
    if (!confirm || confirm.type !== "restore") return;
    setBusy(true);
    try {
      await axios.post(`/api/servers/${confirm.serverId}/backups/${encodeURIComponent(confirm.filename)}/restore`);
      setNotice({ text: `Restored ${confirm.filename} — server restarting.`, ok: true });
      setConfirm(null);
      await load();
    } catch {
      setNotice({ text: "Restore failed — the server must be stopped first.", ok: false });
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), 4000);
    return () => clearTimeout(t);
  }, [notice]);

  return (
    <div className="p-4 md:p-6 lg:p-8 max-w-[1200px] mx-auto w-full space-y-5">
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col md:flex-row md:items-end justify-between gap-3">
        <div>
          <p className="pp-section-label">Management</p>
          <h1 className="mt-1 font-display text-2xl md:text-[26px] font-bold tracking-tight">
            Backup <span className="pp-gradient-text">Center</span>
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {isAdmin ? "All fleet snapshots" : "Your instance snapshots"} ·{" "}
            {data ? <span className="font-mono">{totals.count} backups · {fmtBytes(totals.size)}</span> : "loading…"}
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

      {data === null ? (
        <div className="space-y-3">
          {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-20 w-full" />)}
        </div>
      ) : data.length === 0 ? (
        <div className="pp-card p-10 text-center">
          <Server size={26} className="mx-auto text-muted-foreground/40 mb-2" />
          <p className="text-sm text-muted-foreground">No servers available.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {data.map(({ server, backups }, i) => {
            const open = expanded.has(server.id);
            const totalSize = backups.reduce((a, b) => a + b.size, 0);
            return (
              <motion.div
                key={server.id}
                initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i * 0.05, 0.3) }}
                className="pp-card overflow-hidden"
              >
                <button
                  onClick={() => toggle(server.id)}
                  className="w-full flex items-center gap-3.5 p-4 hover:bg-muted/30 transition-colors text-left"
                >
                  <div className="w-9 h-9 rounded-xl bg-amber-500/12 text-amber-400 flex items-center justify-center flex-shrink-0 shadow-[inset_0_0_0_1px_rgba(251,191,36,0.25)]">
                    <HardDrive size={16} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-foreground truncate">{server.name}</p>
                    <p className="text-[11px] text-muted-foreground font-mono">
                      {backups.length} backup{backups.length !== 1 ? "s" : ""} · {fmtBytes(totalSize)}
                    </p>
                  </div>
                  <ChevronDown size={15} className={`text-muted-foreground transition-transform duration-300 ${open ? "rotate-180" : ""}`} />
                </button>

                <AnimatePresence>
                  {open && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
                      className="overflow-hidden border-t border-border-subtle"
                    >
                      {backups.length === 0 ? (
                        <p className="px-4 py-6 text-center text-xs text-muted-foreground">
                          No backups yet — create one from the server's Backup tab.
                        </p>
                      ) : (
                        <div className="divide-y divide-border-subtle">
                          {backups.map((b) => (
                            <div key={b.filename} className="flex items-center gap-3 px-4 py-2.5 hover:bg-muted/25 transition-colors">
                              <ArchiveRestore size={14} className="text-muted-foreground flex-shrink-0" />
                              <div className="min-w-0 flex-1">
                                <p className="text-xs font-mono text-foreground-muted truncate">{b.filename}</p>
                                <p className="text-[10px] text-muted-foreground">
                                  {fmtBytes(b.size)} · {timeAgo(b.createdAt)}
                                </p>
                              </div>
                              <div className="flex items-center gap-1">
                                <a
                                  href={`/api/servers/${server.id}/backups/${encodeURIComponent(b.filename)}?token=${token}`}
                                  className="p-2 rounded-lg text-muted-foreground hover:text-blue-300 hover:bg-blue-500/10 transition-colors"
                                  title="Download"
                                >
                                  <Download size={14} />
                                </a>
                                <button
                                  onClick={() => setConfirm({ type: "restore", serverId: server.id, serverName: server.name, filename: b.filename })}
                                  className="p-2 rounded-lg text-muted-foreground hover:text-emerald-300 hover:bg-emerald-500/10 transition-colors"
                                  title="Restore (stops the server)"
                                >
                                  <RotateCcw size={14} />
                                </button>
                                <button
                                  onClick={() => setConfirm({ type: "delete", serverId: server.id, serverName: server.name, filename: b.filename })}
                                  className="p-2 rounded-lg text-muted-foreground hover:text-red-400 hover:bg-red-500/10 transition-colors"
                                  title="Delete"
                                >
                                  <Trash2 size={14} />
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                      <div className="px-4 py-2.5 border-t border-border-subtle bg-muted/20">
                        <Link to={`/servers/${server.id}/backup`} className="text-[11px] font-semibold text-blue-400 hover:text-cyan-300 transition-colors">
                          Open backup manager →
                        </Link>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            );
          })}
        </div>
      )}

      <ConfirmDialog
        open={confirm?.type === "delete"}
        title="Delete backup"
        message={<>Permanently delete <span className="font-mono text-foreground">{confirm?.filename}</span> from <span className="font-semibold text-foreground">{confirm?.serverName}</span>? This cannot be undone.</>}
        confirmLabel="Delete"
        danger
        busy={busy}
        onCancel={() => setConfirm(null)}
        onConfirm={doDelete}
      />
      <ConfirmDialog
        open={confirm?.type === "restore"}
        title="Restore backup"
        message={<>Restore <span className="font-mono text-foreground">{confirm?.filename}</span> on <span className="font-semibold text-foreground">{confirm?.serverName}</span>? The server will be stopped, current world files replaced, then restarted.</>}
        confirmLabel="Restore"
        busy={busy}
        onCancel={() => setConfirm(null)}
        onConfirm={doRestore}
      />
    </div>
  );
}
