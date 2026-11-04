import React, { useMemo, useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Cpu, MemoryStick, HardDrive, Network, Server, RefreshCw } from "lucide-react";
import { useDashboardData } from "../hooks/useDashboardData";
import { LiveAreaChart, Gauge, Skeleton, StatusPill, fmtBytes, fmtMB } from "../components/ui/Premium";

/**
 * PROTO PANEL — monitoring center.
 * Deep-dive host metrics sampled from /api/system/stats every 5s, plus the
 * live per-server fleet state from /api/servers. All values are real.
 */
export default function MonitoringPage() {
  const { stats, statsHistory, servers, state, lastUpdated, refetch } = useDashboardData();
  const [showNet, setShowNet] = useState(true);

  const cpuH = useMemo(() => statsHistory.map((s) => s.cpuUsage ?? 0), [statsHistory]);
  const ramH = useMemo(() => statsHistory.map((s) => s.ramUsage ?? 0), [statsHistory]);
  const netInH = useMemo(() => statsHistory.map((s) => +(((s.netIn ?? 0) / 1048576).toFixed(1))), [statsHistory]);
  const netOutH = useMemo(() => statsHistory.map((s) => +(((s.netOut ?? 0) / 1048576).toFixed(1))), [statsHistory]);

  const diskPct = stats?.diskUsage ?? 0;

  const running = servers.filter((s) => s.status === "running" || s.status === "online");
  const loading = state === "loading" && !stats;

  return (
    <div className="p-4 md:p-6 lg:p-8 max-w-[1500px] mx-auto w-full space-y-6">
      <motion.div
        initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
        className="flex flex-col md:flex-row md:items-end justify-between gap-3"
      >
        <div>
          <p className="pp-section-label">System</p>
          <h1 className="mt-1 font-display text-2xl md:text-[26px] font-bold tracking-tight">
            Monitoring <span className="pp-gradient-text">Center</span>
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Host & fleet telemetry · {lastUpdated ? `updated ${lastUpdated.toLocaleTimeString()}` : "connecting…"}
          </p>
        </div>
        <button onClick={() => refetch()} className="pp-btn-ghost px-3.5 py-2 text-xs gap-2 self-start md:self-auto">
          <RefreshCw size={13} className={state === "loading" ? "animate-spin" : ""} /> Refresh
        </button>
      </motion.div>

      {/* gauges */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
        {[
          { icon: <Cpu size={15} />, label: "Processor", value: stats?.cpuUsage ?? 0, accent: "#22d3ee", sub: stats ? `${stats.cores ?? "?"} cores` : "" },
          { icon: <MemoryStick size={15} />, label: "Memory", value: stats?.ramUsage ?? 0, accent: "#818cf8", sub: stats ? `${fmtBytes(stats.totalMemory ?? 0)} total` : "" },
          { icon: <HardDrive size={15} />, label: "Storage", value: diskPct, accent: "#f472b6", sub: stats ? `${fmtBytes(stats.diskUsed ?? 0)} / ${fmtBytes(stats.diskTotal ?? 0)}` : "" },
          { icon: <Server size={15} />, label: "Containers", value: stats?.totalContainers ? (stats.activeContainers ?? 0) / stats.totalContainers * 100 : 0, accent: "#34d399", sub: stats ? `${stats.activeContainers ?? 0} of ${stats.totalContainers ?? 0} active` : "", displayOverride: `${stats?.activeContainers ?? 0}/${stats?.totalContainers ?? 0}` },
        ].map((g, i) => (
          <motion.div
            key={g.label}
            initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.06 }}
            className="pp-card p-4 flex items-center gap-4"
          >
            <Gauge value={g.value} label="" accent={g.accent} size={86} warn={80} />
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 text-muted-foreground">
                {g.icon}
                <p className="pp-section-label !text-[10px]">{g.label}</p>
              </div>
              <p className="mt-1 font-display font-bold text-lg tabular-nums text-foreground">
                {(g as any).displayOverride ?? (stats ? g.value.toFixed(1) : "—")}
                {!(g as any).displayOverride && stats ? "%" : ""}
              </p>
              <p className="text-[10px] font-mono text-muted-foreground truncate">{g.sub}</p>
            </div>
          </motion.div>
        ))}
      </div>

      {/* charts */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-3.5">
        <ChartPanel title="CPU Utilisation" desc="Host-wide processor load" accent="#22d3ee" icon={<Cpu size={15} />}>
          {loading ? <Skeleton className="w-full h-[170px]" /> : <LiveAreaChart data={cpuH} accent="#22d3ee" unit="%" height={170} max={100} />}
        </ChartPanel>
        <ChartPanel title="Memory Utilisation" desc="Host RAM saturation" accent="#818cf8" icon={<MemoryStick size={15} />}>
          {loading ? <Skeleton className="w-full h-[170px]" /> : <LiveAreaChart data={ramH} accent="#818cf8" unit="%" height={170} max={100} />}
        </ChartPanel>
        <ChartPanel
          title="Network I/O"
          desc="Cumulative traffic through the host interface"
          accent="#3b82f6"
          icon={<Network size={15} />}
          action={
            <div className="flex gap-1.5">
              {(["in", "out"] as const).map((d) => (
                <button
                  key={d}
                  onClick={() => setShowNet(d === "in")}
                  className={`px-2.5 py-1 text-[10px] font-semibold rounded-md transition-colors ${showNet === (d === "in") ? "bg-blue-500/15 text-blue-300 shadow-[inset_0_0_0_1px_rgba(59,130,246,0.3)]" : "text-muted-foreground hover:text-foreground"}`}
                >
                  {d.toUpperCase()}
                </button>
              ))}
            </div>
          }
        >
          {loading ? <Skeleton className="w-full h-[170px]" /> : (
            <LiveAreaChart
              data={showNet ? netInH : netOutH}
              accent={showNet ? "#3b82f6" : "#22d3ee"}
              height={170}
              labelFormatter={(v) => `${v.toFixed(0)} MB`}
            />
          )}
        </ChartPanel>
        <ChartPanel title="Fleet State" desc="Live per-instance status" accent="#34d399" icon={<Server size={15} />}>
          <div className="space-y-1.5 max-h-[190px] overflow-y-auto custom-scrollbar pr-1">
            {servers.length === 0 && <p className="text-xs text-muted-foreground py-6 text-center">No servers on this host.</p>}
            {servers.map((s) => (
              <div key={s.id} className="flex items-center gap-3 px-3 py-2 rounded-lg bg-muted/30">
                <Server size={13} className="text-emerald-400/80 flex-shrink-0" />
                <span className="text-xs font-medium text-foreground-muted truncate flex-1">{s.name}</span>
                <span className="text-[10px] font-mono text-muted-foreground hidden sm:block">{fmtMB(s.memory)}</span>
                <StatusPill status={s.status} />
              </div>
            ))}
          </div>
        </ChartPanel>
      </div>
    </div>
  );
}

function ChartPanel({
  title, desc, accent, icon, children, action,
}: {
  title: string; desc: string; accent: string; icon: React.ReactNode; children: React.ReactNode; action?: React.ReactNode;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
      className="pp-card p-5"
    >
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2.5">
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center"
            style={{ color: accent, background: `${accent}14`, boxShadow: `inset 0 0 0 1px ${accent}2b` }}
          >
            {icon}
          </div>
          <div>
            <h3 className="font-display font-semibold text-sm">{title}</h3>
            <p className="text-[11px] text-muted-foreground">{desc}</p>
          </div>
        </div>
        {action}
      </div>
      {children}
    </motion.div>
  );
}
