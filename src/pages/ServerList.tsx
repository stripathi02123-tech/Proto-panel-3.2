import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import axios from "axios";
import { Link } from "react-router-dom";
import {
  Server, Plus, Play, Square, RotateCw, Trash2, Terminal, Eye,
  RefreshCw, Lock, Network, ChevronRight, LayoutGrid, List,
} from "lucide-react";
import { motion } from "framer-motion";
import { useAuth } from "../context/AuthContext";
import ServerLiveStats from "../components/ServerLiveStats";
import { StatusPill, ConfirmDialog, Skeleton, fmtMB } from "../components/ui/Premium";

/* ── Types ──────────────────────────────────────────────────────────────── */
type ServerStatus = "online" | "offline" | "running" | (string & {});

interface ServerRecord {
  id: string;
  name: string;
  status: ServerStatus;
  cpu?: number;
  ram?: number;
  memory?: number;
  disk?: number;
  version?: string;
  software?: string;
  port?: number;
  ipAlias?: string;
  suspended?: boolean;
  owner?: string;
}

const isUp = (status?: ServerStatus): boolean =>
  status === "online" || status === "running";

/* ── Data hook (fetch + 5s poll) ────────────────────────────────────────── */
function useServers(pollIntervalMs = 5000) {
  const [servers, setServers] = useState<ServerRecord[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const fetchServers = useCallback(async (signal?: AbortSignal) => {
    try {
      const res = await axios.get<ServerRecord[]>("/api/servers", { signal });
      setServers(Array.isArray(res.data) ? res.data : []);
      setError(null);
    } catch (err) {
      if (axios.isCancel(err)) return;
      setError("Unable to load servers. Retrying…");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void fetchServers(controller.signal);
    const interval = window.setInterval(
      () => { if (document.visibilityState === "visible") void fetchServers(controller.signal); },
      pollIntervalMs,
    );
    return () => {
      controller.abort();
      window.clearInterval(interval);
    };
  }, [fetchServers, pollIntervalMs]);

  return { servers, error, isLoading, refetch: () => fetchServers() };
}

/* ── Metric cell ─────────────────────────────────────────────────────────── */
function Metric({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
        {label}
      </p>
      <div className="font-mono text-[13px] font-semibold text-foreground truncate">{children}</div>
    </div>
  );
}

/* ── VPS card ────────────────────────────────────────────────────────────── */
const VPSCard = memo(function VPSCard({
  server,
  onAction,
  onConfirmDelete,
  onConfirmReinstall,
  index,
}: {
  server: ServerRecord;
  onAction: (id: string, action: "start" | "stop" | "restart") => void;
  onConfirmDelete: (s: ServerRecord) => void;
  onConfirmReinstall: (s: ServerRecord) => void;
  index: number;
}) {
  const up = isUp(server.status);
  const ramLimit = server.ram ?? server.memory;
  const [acting, setActing] = useState(false);

  const handle = (action: "start" | "stop" | "restart") => {
    setActing(true);
    onAction(server.id, action);
    setTimeout(() => setActing(false), 2500);
  };

  return (
    <motion.article
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: Math.min(index * 0.05, 0.4), ease: [0.22, 1, 0.36, 1] }}
      className={`pp-card p-5 group ${server.suspended ? "opacity-75" : ""}`}
    >
      {/* header */}
      <div className="flex items-start justify-between gap-3">
        <Link to={`/servers/${server.id}`} className="flex min-w-0 items-center gap-3.5">
          <div
            className="relative w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 transition-transform duration-300 group-hover:scale-105"
            style={{
              background: up ? "rgba(52,211,153,0.1)" : "rgba(148,163,184,0.08)",
              boxShadow: up
                ? "inset 0 0 0 1px rgba(52,211,153,0.28), 0 0 22px -8px rgba(52,211,153,0.5)"
                : "inset 0 0 0 1px rgba(148,163,184,0.2)",
            }}
          >
            <Server size={19} className={up ? "text-emerald-400" : "text-slate-400"} />
            {up && (
              <span className="absolute -top-0.5 -right-0.5 flex w-2.5 h-2.5">
                <span className="absolute inline-flex w-full h-full rounded-full bg-emerald-400 opacity-60 animate-ping" />
                <span className="relative inline-flex w-2.5 h-2.5 rounded-full bg-emerald-400 border-2 border-[#0a0f1e]" />
              </span>
            )}
          </div>
          <div className="min-w-0">
            <h2 className="truncate text-[15px] font-semibold tracking-tight text-foreground group-hover:text-blue-200 transition-colors">
              {server.name}
            </h2>
            <div className="mt-1.5 flex items-center gap-2 flex-wrap">
              <StatusPill status={server.status} />
              {server.suspended && (
                <span className="inline-flex items-center gap-1 rounded-md bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold tracking-wide text-amber-400 uppercase shadow-[inset_0_0_0_1px_rgba(251,191,36,0.25)]">
                  <Lock className="h-3 w-3" /> Suspended
                </span>
              )}
              <span className="text-[10px] font-mono text-muted-foreground">
                {server.software || "minecraft"} {server.version || ""}
              </span>
            </div>
          </div>
        </Link>
        <Link
          to={`/servers/${server.id}`}
          className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-all group-hover:translate-x-0.5"
          title="View details"
        >
          <ChevronRight size={17} />
        </Link>
      </div>

      {/* metrics */}
      <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 rounded-xl border border-border-subtle bg-muted/25 px-4 py-3.5 sm:grid-cols-4">
        <Metric label="CPU Limit">{server.cpu ?? "—"}<span className="ml-0.5 text-muted-foreground">%</span></Metric>
        <Metric label="RAM Usage">
          <ServerLiveStats serverId={server.id} limitRam={ramLimit ?? 2048} status={String(server.status)} />
        </Metric>
        <Metric label="Disk Limit">{fmtMB(server.disk)}</Metric>
        <Metric label="Network">
          <span className="flex items-center gap-1">
            <Network size={11} className="text-blue-400/80" />
            <span className="truncate">{server.ipAlias || "host"}:{server.port ?? "—"}</span>
          </span>
        </Metric>
      </div>

      {/* actions */}
      {!server.suspended && (
        <div className="mt-4 flex items-center gap-2 flex-wrap">
          <button
            onClick={() => handle("start")}
            disabled={acting || up}
            className="pp-btn-ghost px-3 py-1.5 text-xs !text-emerald-300 hover:!bg-emerald-500/10"
            title="Start"
          >
            <Play size={13} /> Start
          </button>
          <button
            onClick={() => handle("stop")}
            disabled={acting || !up}
            className="pp-btn-ghost px-3 py-1.5 text-xs !text-amber-300 hover:!bg-amber-500/10"
            title="Stop"
          >
            <Square size={12} /> Stop
          </button>
          <button
            onClick={() => handle("restart")}
            disabled={acting || !up}
            className="pp-btn-ghost px-3 py-1.5 text-xs !text-blue-300 hover:!bg-blue-500/10"
            title="Restart"
          >
            <RotateCw size={12} /> Restart
          </button>
          <div className="flex-1" />
          <button
            onClick={() => onConfirmReinstall(server)}
            className="pp-btn-ghost px-3 py-1.5 text-xs !text-violet-300 hover:!bg-violet-500/10"
            title="Re-install server software"
          >
            <RefreshCw size={12} /> Reinstall
          </button>
          <Link
            to={`/servers/${server.id}`}
            className="pp-btn-ghost px-3 py-1.5 text-xs"
            title="Open console"
          >
            <Terminal size={12} /> Console
          </Link>
          <Link
            to={`/servers/${server.id}/properties`}
            className="pp-btn-ghost px-3 py-1.5 text-xs"
            title="Details"
          >
            <Eye size={12} />
          </Link>
          <button
            onClick={() => onConfirmDelete(server)}
            className="pp-btn-ghost px-3 py-1.5 text-xs !text-red-400 hover:!bg-red-500/10"
            title="Delete"
          >
            <Trash2 size={12} />
          </button>
        </div>
      )}
    </motion.article>
  );
});

/* ── Page ────────────────────────────────────────────────────────────────── */
export default function ServerList() {
  const { user } = useAuth();
  const { servers, error, isLoading, refetch } = useServers();
  const [confirmDelete, setConfirmDelete] = useState<ServerRecord | null>(null);
  const [confirmReinstall, setConfirmReinstall] = useState<ServerRecord | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ text: string; ok: boolean } | null>(null);

  const isAdmin = !!user && (user.role === "admin" || user.role === "owner");
  const onlineCount = useMemo(() => servers.reduce((n, s) => n + (isUp(s.status) ? 1 : 0), 0), [servers]);

  const flash = (text: string, ok: boolean) => {
    setNotice({ text, ok });
    setTimeout(() => setNotice(null), 4000);
  };

  const runAction = useCallback(async (id: string, action: "start" | "stop" | "restart") => {
    try {
      await axios.post(`/api/servers/${id}/${action}`);
      flash(`${action.charAt(0).toUpperCase() + action.slice(1)} sent.`, true);
      setTimeout(refetch, 800);
    } catch {
      flash(`${action} failed — check permissions.`, false);
    }
  }, [refetch]);

  const doDelete = async () => {
    if (!confirmDelete) return;
    setBusy(true);
    try {
      await axios.delete(`/api/servers/${confirmDelete.id}`);
      flash(`Deleted ${confirmDelete.name}.`, true);
      setConfirmDelete(null);
      refetch();
    } catch {
      flash("Delete failed — administrator rights required.", false);
    } finally {
      setBusy(false);
    }
  };

  const doReinstall = async () => {
    if (!confirmReinstall) return;
    setBusy(true);
    try {
      // reinstall = re-provision the current software version (re-downloads
      // the server jar) via the existing, ownership-checked version endpoint
      await axios.put(`/api/servers/${confirmReinstall.id}/version`, {
        version: confirmReinstall.version,
      });
      flash(`Reinstalling ${confirmReinstall.name} (${confirmReinstall.version})…`, true);
      setConfirmReinstall(null);
      refetch();
    } catch {
      flash("Reinstall failed — check permissions.", false);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="p-4 md:p-6 lg:p-8 max-w-[1400px] mx-auto w-full">
      {/* header */}
      <motion.div
        initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
        className="flex flex-col md:flex-row md:items-end justify-between gap-3 mb-6"
      >
        <div>
          <p className="pp-section-label">Main</p>
          <h1 className="mt-1 font-display text-2xl md:text-[26px] font-bold tracking-tight">
            VPS <span className="pp-gradient-text">Instances</span>
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {servers.length > 0 || !isLoading ? (
              <>
                <span className="font-mono text-emerald-400">{onlineCount}</span> of{" "}
                <span className="font-mono">{servers.length}</span> running
              </>
            ) : "loading…"}
          </p>
        </div>
        {isAdmin && (
          <Link to="/servers/create" className="pp-btn px-4 py-2.5 text-sm self-start md:self-auto">
            <Plus size={15} /> Create VPS
          </Link>
        )}
      </motion.div>

      {/* error / notice */}
      {error && (
        <div role="alert" className="mb-5 rounded-xl border border-red-500/25 bg-red-500/[0.08] px-4 py-3 text-sm text-red-300">
          {error}
        </div>
      )}
      {notice && (
        <motion.div
          initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }}
          className={`mb-5 rounded-xl border px-4 py-2.5 text-xs font-medium ${
            notice.ok
              ? "border-emerald-500/25 bg-emerald-500/[0.08] text-emerald-300"
              : "border-red-500/25 bg-red-500/[0.08] text-red-300"
          }`}
        >
          {notice.text}
        </motion.div>
      )}

      {/* fleet */}
      {isLoading && servers.length === 0 ? (
        <div className="space-y-4">
          {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-44 w-full" />)}
        </div>
      ) : servers.length === 0 ? (
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }}
          className="pp-card col-span-full flex flex-col items-center justify-center px-6 py-20 text-center"
        >
          <div className="mb-5 w-14 h-14 rounded-2xl bg-blue-500/10 text-blue-400 flex items-center justify-center shadow-[inset_0_0_0_1px_rgba(59,130,246,0.25)]">
            <Server className="h-6 w-6" />
          </div>
          <h3 className="text-base font-semibold text-foreground">No instances yet</h3>
          <p className="mt-1.5 max-w-sm text-sm text-muted-foreground">
            {isAdmin
              ? "Deploy your first game server — Minecraft, Node.js or Python."
              : "No servers have been assigned to your account yet."}
          </p>
          {isAdmin && (
            <Link to="/servers/create" className="pp-btn px-4 py-2.5 text-sm mt-6">
              <Plus size={15} /> Create VPS
            </Link>
          )}
        </motion.div>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          {servers.map((server, i) => (
            <VPSCard
              key={server.id}
              server={server}
              index={i}
              onAction={runAction}
              onConfirmDelete={setConfirmDelete}
              onConfirmReinstall={setConfirmReinstall}
            />
          ))}
        </div>
      )}

      {/* dialogs */}
      <ConfirmDialog
        open={!!confirmDelete}
        title="Delete instance"
        message={<>Permanently delete <span className="font-semibold text-foreground">{confirmDelete?.name}</span> including its container, files and backups? This action is irreversible.</>}
        confirmLabel="Delete permanently"
        danger
        busy={busy}
        onCancel={() => setConfirmDelete(null)}
        onConfirm={doDelete}
      />
      <ConfirmDialog
        open={!!confirmReinstall}
        title="Reinstall server software"
        message={<>Re-download the server software for <span className="font-semibold text-foreground">{confirmReinstall?.name}</span> ({confirmReinstall?.version})? Your world files and configuration are preserved.</>}
        confirmLabel="Reinstall"
        busy={busy}
        onCancel={() => setConfirmReinstall(null)}
        onConfirm={doReinstall}
      />
    </div>
  );
}
