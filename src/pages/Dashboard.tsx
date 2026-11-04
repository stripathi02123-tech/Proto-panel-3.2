import React, { useState, useMemo } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import {
  Server, Activity, Square, Cpu, MemoryStick, HardDrive, Network,
  ArrowUpRight, ArrowDownRight, ShieldCheck, Clock, Zap, Plus,
  ScrollText, Boxes, Gauge as GaugeIcon,
} from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { useDashboardData } from "../hooks/useDashboardData";
import {
  StatCard, LiveAreaChart, Gauge, StatusPill, Skeleton, AnimatedNumber,
  fmtBytes, fmtMB, timeAgo,
} from "../components/ui/Premium";

/**
 * PROTO PANEL — premium dashboard.
 *
 * Every number on this page comes from real backend data:
 *  · /api/system/stats → host CPU / RAM / disk / network / container counts
 *  · /api/servers      → fleet state, allocated resources per server
 *  · /api/audit        → recent operations (administrators only)
 * No random values, no fake uptime percentages.
 */

interface AuditEntry {
  id: string;
  timestamp: string;
  actorName: string;
  actorRole: string;
  action: string;
  outcome: "success" | "denied" | "failure";
  details: string;
  ip: string;
}

export default function Dashboard() {
  const { user } = useAuth();
  const { stats, statsHistory, servers, state } = useDashboardData();
  const isAdmin = user?.role === "admin" || user?.role === "owner";
  const [audit, setAudit] = useState<AuditEntry[] | null>(null);

  // Recent operations — real audit trail (admins), own fleet activity (users)
  React.useEffect(() => {
    if (!isAdmin) return;
    let alive = true;
    const load = async () => {
      try {
        const res = await fetch("/api/audit?limit=12", {
          headers: { Authorization: `Bearer ${localStorage.getItem("proto_token")}` },
        });
        if (!res.ok) throw new Error();
        const data = await res.json();
        if (alive) setAudit(data.entries || []);
      } catch {
        if (alive) setAudit([]);
      }
    };
    void load();
    const t = setInterval(load, 15000);
    return () => { alive = false; clearInterval(t); };
  }, [isAdmin]);

  const cpuHistory = useMemo(() => statsHistory.map((s) => s.cpuUsage ?? 0), [statsHistory]);
  const ramHistory = useMemo(() => statsHistory.map((s) => s.ramUsage ?? 0), [statsHistory]);
  const netInHistory = useMemo(
    () => statsHistory.map((s) => Math.round(((s.netIn ?? 0) / 1024 / 1024) * 10) / 10),
    [statsHistory]
  );
  const netOutHistory = useMemo(
    () => statsHistory.map((s) => Math.round(((s.netOut ?? 0) / 1024 / 1024) * 10) / 10),
    [statsHistory]
  );

  const totalServers = servers.length;
  const running = servers.filter((s) => s.status === "running" || s.status === "online").length;
  const stopped = totalServers - running;
  const allocRam = servers.reduce((a, s) => a + (s.memory || 0), 0);
  const allocDisk = servers.reduce((a, s) => a + (s.disk || 0), 0);

  const recentServers = useMemo(
    () => [...servers].sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt)).slice(0, 6),
    [servers]
  );

  const loading = state === "loading" && !stats;

  return (
    <div className="p-4 md:p-6 lg:p-8 max-w-[1600px] mx-auto w-full space-y-6">
      {/* ---- header --------------------------------------------------------- */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="flex flex-col md:flex-row md:items-end justify-between gap-4"
      >
        <div>
          <p className="pp-section-label">Command Center</p>
          <h1 className="mt-1 font-display text-2xl md:text-[28px] font-bold tracking-tight">
            Welcome back, <span className="pp-gradient-text">{user?.username || "operator"}</span>
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Live fleet status · sampled every 5 seconds from the host
          </p>
        </div>
        <div className="flex items-center gap-2.5">
          {isAdmin && (
            <Link to="/servers/create" className="pp-btn px-4 py-2.5 text-sm">
              <Plus size={15} /> Deploy VPS
            </Link>
          )}
          <Link to="/monitoring" className="pp-btn-ghost px-4 py-2.5 text-sm">
            <GaugeIcon size={15} /> Monitoring
          </Link>
        </div>
      </motion.div>

      {/* ---- overview stat cards -------------------------------------------- */}
      <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-8 gap-3.5">
        <StatCard icon={<Boxes size={17} />} label="Total VPS" value={loading ? null : totalServers} accent="#60a5fa" delay={0.0} />
        <StatCard icon={<Activity size={17} />} label="Running" value={loading ? null : running} accent="#34d399" delay={0.05} />
        <StatCard icon={<Square size={17} />} label="Stopped" value={loading ? null : stopped} accent="#94a3b8" delay={0.1} />
        <StatCard icon={<MemoryStick size={17} />} label="Allocated RAM" value={loading ? null : allocRam} unit="MB" accent="#a78bfa" delay={0.15} footer={loading ? undefined : `${(allocRam / 1024).toFixed(1)} GB across fleet`} />
        <StatCard icon={<HardDrive size={17} />} label="Allocated Storage" value={loading ? null : allocDisk} unit="MB" accent="#fbbf24" delay={0.2} footer={loading ? undefined : `${(allocDisk / 1024).toFixed(1)} GB across fleet`} />
        <StatCard icon={<Cpu size={17} />} label="CPU Usage" value={loading ? null : stats?.cpuUsage ?? 0} unit="%" decimals={1} accent="#22d3ee" spark={cpuHistory} delay={0.25} footer={loading ? undefined : `${stats?.cores ?? "?"} cores`} />
        <StatCard icon={<MemoryStick size={17} />} label="Memory Usage" value={loading ? null : stats?.ramUsage ?? 0} unit="%" decimals={1} accent="#818cf8" spark={ramHistory} delay={0.3} footer={loading ? undefined : `${fmtBytes((stats?.totalMemory ?? 0) - (stats?.freeMemory ?? 0))} / ${fmtBytes(stats?.totalMemory ?? 0)}`} />
        <StatCard icon={<HardDrive size={17} />} label="Storage Usage" value={loading ? null : stats?.diskUsage ?? 0} unit="%" decimals={1} accent="#f472b6" delay={0.35} footer={loading ? undefined : `${fmtBytes(stats?.diskUsed ?? 0)} / ${fmtBytes(stats?.diskTotal ?? 0)}`} />
      </div>

      {/* ---- charts row ------------------------------------------------------ */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-3.5">
        <motion.div
          initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45, delay: 0.15 }}
          className="pp-card p-5 xl:col-span-2"
        >
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-cyan-500/12 text-cyan-400 flex items-center justify-center shadow-[inset_0_0_0_1px_rgba(34,211,238,0.25)]">
                <Cpu size={15} />
              </div>
              <div>
                <h3 className="font-display font-semibold text-sm">CPU & Memory</h3>
                <p className="text-[11px] text-muted-foreground">Live host utilisation</p>
              </div>
            </div>
            <div className="flex items-center gap-3 text-[11px] font-mono">
              <span className="flex items-center gap-1.5 text-cyan-400">
                <span className="w-2 h-0.5 rounded-full bg-cyan-400" /> CPU {stats ? `${stats.cpuUsage.toFixed(1)}%` : "—"}
              </span>
              <span className="flex items-center gap-1.5 text-indigo-400">
                <span className="w-2 h-0.5 rounded-full bg-indigo-400" /> RAM {stats ? `${stats.ramUsage.toFixed(1)}%` : "—"}
              </span>
            </div>
          </div>
          {loading ? (
            <Skeleton className="w-full h-[150px]" />
          ) : (
            <>
              <LiveAreaChart data={cpuHistory} accent="#22d3ee" unit="%" height={150} max={100} />
              <div className="mt-2 border-t border-border-subtle pt-2">
                <LiveAreaChart data={ramHistory} accent="#818cf8" unit="%" height={120} max={100} />
              </div>
            </>
          )}
        </motion.div>

        {/* system health gauges */}
        <motion.div
          initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45, delay: 0.2 }}
          className="pp-card p-5"
        >
          <div className="flex items-center gap-2.5 mb-4">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/12 text-emerald-400 flex items-center justify-center shadow-[inset_0_0_0_1px_rgba(52,211,153,0.25)]">
              <ShieldCheck size={15} />
            </div>
            <div>
              <h3 className="font-display font-semibold text-sm">System Health</h3>
              <p className="text-[11px] text-muted-foreground">Host resource saturation</p>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <Gauge value={stats?.cpuUsage ?? 0} label="CPU" accent="#22d3ee" size={92} />
            <Gauge value={stats?.ramUsage ?? 0} label="Memory" accent="#818cf8" size={92} />
            <Gauge value={stats?.diskUsage ?? 0} label="Disk" accent="#f472b6" size={92} />
          </div>
          <div className="mt-4 space-y-2 text-[11px]">
            <div className="flex items-center justify-between px-3 py-2 rounded-lg bg-muted/40">
              <span className="text-muted-foreground flex items-center gap-1.5"><Clock size={12} /> Uptime</span>
              <span className="font-mono text-foreground-muted">
                {stats?.uptime ? `${Math.floor(stats.uptime / 86400)}d ${Math.floor((stats.uptime % 86400) / 3600)}h` : "—"}
              </span>
            </div>
            <div className="flex items-center justify-between px-3 py-2 rounded-lg bg-muted/40">
              <span className="text-muted-foreground flex items-center gap-1.5"><Boxes size={12} /> Containers</span>
              <span className="font-mono text-foreground-muted">
                {stats ? `${stats.activeContainers ?? 0} / ${stats.totalContainers ?? 0} active` : "—"}
              </span>
            </div>
            <div className="flex items-center justify-between px-3 py-2 rounded-lg bg-muted/40">
              <span className="text-muted-foreground flex items-center gap-1.5"><Activity size={12} /> Fleet</span>
              <span className="font-mono text-emerald-400">{running} up</span>
            </div>
          </div>
        </motion.div>
      </div>

      {/* ---- network + activity row ------------------------------------------ */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-3.5">
        {/* network traffic */}
        <motion.div
          initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45, delay: 0.25 }}
          className="pp-card p-5"
        >
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-blue-500/12 text-blue-400 flex items-center justify-center shadow-[inset_0_0_0_1px_rgba(59,130,246,0.25)]">
                <Network size={15} />
              </div>
              <div>
                <h3 className="font-display font-semibold text-sm">Network Traffic</h3>
                <p className="text-[11px] text-muted-foreground">Cumulative host I/O</p>
              </div>
            </div>
          </div>
          {loading ? (
            <Skeleton className="w-full h-[130px]" />
          ) : (
            <LiveAreaChart
              data={netInHistory}
              accent="#3b82f6"
              height={130}
              labelFormatter={(v) => `${v.toFixed(0)} MB`}
            />
          )}
          <div className="mt-3 grid grid-cols-2 gap-2">
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-muted/40">
              <ArrowDownRight size={13} className="text-blue-400" />
              <div className="min-w-0">
                <p className="text-[10px] text-muted-foreground">Received</p>
                <p className="text-xs font-mono font-semibold text-foreground-muted truncate">{fmtBytes(stats?.netIn)}</p>
              </div>
            </div>
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-muted/40">
              <ArrowUpRight size={13} className="text-cyan-400" />
              <div className="min-w-0">
                <p className="text-[10px] text-muted-foreground">Sent</p>
                <p className="text-xs font-mono font-semibold text-foreground-muted truncate">{fmtBytes(stats?.netOut)}</p>
              </div>
            </div>
          </div>
        </motion.div>

        {/* activity timeline */}
        <motion.div
          initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45, delay: 0.3 }}
          className="pp-card p-5 xl:col-span-2"
        >
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-orange-500/12 text-orange-400 flex items-center justify-center shadow-[inset_0_0_0_1px_rgba(251,146,60,0.25)]">
                <ScrollText size={15} />
              </div>
              <div>
                <h3 className="font-display font-semibold text-sm">
                  {isAdmin ? "Recent Operations" : "Your Fleet"}
                </h3>
                <p className="text-[11px] text-muted-foreground">
                  {isAdmin ? "Audit trail · security events included" : "Latest instances"}
                </p>
              </div>
            </div>
            {isAdmin && (
              <Link to="/activity" className="text-[11px] font-semibold text-blue-400 hover:text-cyan-300 transition-colors">
                View all →
              </Link>
            )}
          </div>

          {isAdmin ? (
            audit === null ? (
              <div className="space-y-2.5">
                {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
              </div>
            ) : audit.length === 0 ? (
              <div className="py-8 text-center text-sm text-muted-foreground">
                No operations recorded yet — actions will appear here.
              </div>
            ) : (
              <div className="space-y-1.5 max-h-[290px] overflow-y-auto custom-scrollbar pr-1">
                {audit.map((e, i) => (
                  <motion.div
                    key={e.id}
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.04 }}
                    className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-muted/40 transition-colors"
                  >
                    <span
                      className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                      style={{
                        background: e.outcome === "success" ? "#34d399" : e.outcome === "denied" ? "#f87171" : "#fbbf24",
                        boxShadow: `0 0 8px ${e.outcome === "success" ? "#34d39999" : e.outcome === "denied" ? "#f8717199" : "#fbbf2499"}`,
                      }}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-xs truncate">
                        <span className="font-semibold text-foreground-muted">{e.actorName}</span>
                        <span className="text-muted-foreground"> · {e.details || e.action}</span>
                      </p>
                      <p className="text-[10px] font-mono text-muted-foreground/70">
                        {e.action} · {timeAgo(e.timestamp)}
                      </p>
                    </div>
                    {e.outcome !== "success" && (
                      <span className="text-[9px] font-bold tracking-wider px-1.5 py-0.5 rounded bg-red-500/12 text-red-400">
                        {e.outcome.toUpperCase()}
                      </span>
                    )}
                  </motion.div>
                ))}
              </div>
            )
          ) : (
            <div className="space-y-1.5">
              {recentServers.length === 0 ? (
                <div className="py-8 text-center">
                  <p className="text-sm text-muted-foreground mb-3">No instances assigned to you yet.</p>
                </div>
              ) : (
                recentServers.map((s, i) => (
                  <motion.div
                    key={s.id}
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.05 }}
                  >
                    <Link
                      to={`/servers/${s.id}`}
                      className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-muted/40 transition-colors group"
                    >
                      <div className="w-8 h-8 rounded-lg bg-blue-500/10 text-blue-400 flex items-center justify-center flex-shrink-0 group-hover:scale-105 transition-transform">
                        <Server size={14} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-semibold text-foreground-muted truncate group-hover:text-white transition-colors">
                          {s.name}
                        </p>
                        <p className="text-[10px] font-mono text-muted-foreground truncate">
                          {s.software || "server"} {s.version || ""} · {fmtMB(s.memory)}
                        </p>
                      </div>
                      <StatusPill status={s.status} />
                    </Link>
                  </motion.div>
                ))
              )}
            </div>
          )}
        </motion.div>
      </div>

      {/* ---- fleet table ------------------------------------------------------ */}
      <motion.div
        initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45, delay: 0.35 }}
        className="pp-card p-5"
      >
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-violet-500/12 text-violet-400 flex items-center justify-center shadow-[inset_0_0_0_1px_rgba(167,139,250,0.25)]">
              <Zap size={15} />
            </div>
            <div>
              <h3 className="font-display font-semibold text-sm">VPS Instances</h3>
              <p className="text-[11px] text-muted-foreground">{totalServers} total · {running} running</p>
            </div>
          </div>
          <Link to="/servers" className="text-[11px] font-semibold text-blue-400 hover:text-cyan-300 transition-colors">
            Manage fleet →
          </Link>
        </div>

        {loading ? (
          <div className="space-y-2">
            {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}
          </div>
        ) : servers.length === 0 ? (
          <div className="py-10 text-center">
            <Server size={28} className="mx-auto text-muted-foreground/50 mb-3" />
            <p className="text-sm text-muted-foreground">
              {isAdmin ? "No servers deployed yet." : "No instances assigned to you yet."}
            </p>
            {isAdmin && (
              <Link to="/servers/create" className="pp-btn px-4 py-2 text-xs mt-4 inline-flex">
                <Plus size={13} /> Deploy your first VPS
              </Link>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto custom-scrollbar">
            <table className="w-full text-left">
              <thead>
                <tr className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  <th className="pb-2.5 pr-4 font-semibold">Name</th>
                  <th className="pb-2.5 pr-4 font-semibold">Status</th>
                  <th className="pb-2.5 pr-4 font-semibold">Runtime</th>
                  <th className="pb-2.5 pr-4 font-semibold hidden md:table-cell">Resources</th>
                  <th className="pb-2.5 pr-4 font-semibold hidden lg:table-cell">Created</th>
                  <th className="pb-2.5 font-semibold hidden sm:table-cell">Port</th>
                </tr>
              </thead>
              <tbody>
                {recentServers.map((s) => (
                  <tr key={s.id} className="border-t border-border-subtle hover:bg-muted/30 transition-colors">
                    <td className="py-2.5 pr-4">
                      <Link to={`/servers/${s.id}`} className="flex items-center gap-2.5 group">
                        <span
                          className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                          style={{
                            background: s.status === "running" || s.status === "online" ? "#34d399" : "#64748b",
                            boxShadow: s.status === "running" || s.status === "online" ? "0 0 8px #34d39988" : undefined,
                          }}
                        />
                        <span className="text-xs font-semibold text-foreground-muted group-hover:text-blue-300 transition-colors truncate max-w-[180px]">
                          {s.name}
                        </span>
                      </Link>
                    </td>
                    <td className="py-2.5 pr-4"><StatusPill status={s.status} /></td>
                    <td className="py-2.5 pr-4 text-[11px] font-mono text-muted-foreground">
                      {s.software || "—"}
                    </td>
                    <td className="py-2.5 pr-4 text-[11px] font-mono text-muted-foreground hidden md:table-cell">
                      {fmtMB(s.memory)} · {s.cpu ?? "—"}% · {fmtMB(s.disk)}
                    </td>
                    <td className="py-2.5 pr-4 text-[11px] text-muted-foreground hidden lg:table-cell">
                      {timeAgo(s.createdAt)}
                    </td>
                    <td className="py-2.5 text-[11px] font-mono text-muted-foreground hidden sm:table-cell">
                      {s.port ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </motion.div>
    </div>
  );
}
