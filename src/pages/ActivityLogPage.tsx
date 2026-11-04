import React, { useEffect, useState, useMemo } from "react";
import { motion } from "framer-motion";
import { ScrollText, RefreshCw, ShieldAlert, CheckCircle2, XCircle, Search } from "lucide-react";
import { Skeleton, timeAgo } from "../components/ui/Premium";

/**
 * PROTO PANEL — activity log (administrators only; the backend rejects
 * ordinary users with 403 on /api/audit). Displays the real audit trail:
 * node management actions, denied unauthorized access attempts, etc.
 */

interface AuditEntry {
  id: string;
  timestamp: string;
  actorId: string;
  actorName: string;
  actorRole: string;
  action: string;
  resource: string;
  ip: string;
  userAgent: string;
  outcome: "success" | "denied" | "failure";
  details: string;
}

const OUTCOME_STYLE: Record<string, { color: string; bg: string; icon: React.ReactNode }> = {
  success: { color: "#34d399", bg: "rgba(52,211,153,0.1)", icon: <CheckCircle2 size={13} /> },
  denied: { color: "#f87171", bg: "rgba(248,113,113,0.1)", icon: <ShieldAlert size={13} /> },
  failure: { color: "#fbbf24", bg: "rgba(251,191,36,0.1)", icon: <XCircle size={13} /> },
};

export default function ActivityLogPage() {
  const [entries, setEntries] = useState<AuditEntry[] | null>(null);
  const [filter, setFilter] = useState<"all" | "success" | "denied" | "failure">("all");
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");

  const load = async () => {
    setEntries(null);
    setError("");
    try {
      const res = await fetch("/api/audit?limit=300", {
        headers: { Authorization: `Bearer ${localStorage.getItem("proto_token")}` },
      });
      if (!res.ok) throw new Error("failed");
      const data = await res.json();
      setEntries(data.entries || []);
    } catch {
      setError("Could not load the audit trail.");
    }
  };

  useEffect(() => { void load(); }, []);

  const filtered = useMemo(() => {
    if (!entries) return null;
    return entries.filter((e) => {
      if (filter !== "all" && e.outcome !== filter) return false;
      if (query && !`${e.actorName} ${e.action} ${e.details} ${e.ip}`.toLowerCase().includes(query.toLowerCase())) return false;
      return true;
    });
  }, [entries, filter, query]);

  const counts = useMemo(() => {
    if (!entries) return { success: 0, denied: 0, failure: 0 };
    return {
      success: entries.filter((e) => e.outcome === "success").length,
      denied: entries.filter((e) => e.outcome === "denied").length,
      failure: entries.filter((e) => e.outcome === "failure").length,
    };
  }, [entries]);

  return (
    <div className="p-4 md:p-6 lg:p-8 max-w-[1300px] mx-auto w-full space-y-5">
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col md:flex-row md:items-end justify-between gap-3">
        <div>
          <p className="pp-section-label">System</p>
          <h1 className="mt-1 font-display text-2xl md:text-[26px] font-bold tracking-tight">
            Activity <span className="pp-gradient-text">Logs</span>
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Security audit trail · administrative actions & unauthorized access attempts
          </p>
        </div>
        <button onClick={load} className="pp-btn-ghost px-3.5 py-2 text-xs gap-2 self-start md:self-auto">
          <RefreshCw size={13} /> Refresh
        </button>
      </motion.div>

      {/* summary + filters */}
      <div className="flex flex-col sm:flex-row gap-3 sm:items-center justify-between">
        <div className="flex gap-2">
          {(["all", "success", "denied", "failure"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-all ${
                filter === f
                  ? "bg-blue-500/15 text-blue-300 shadow-[inset_0_0_0_1px_rgba(59,130,246,0.35)]"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
              }`}
            >
              {f.toUpperCase()}
              {f !== "all" && entries && (
                <span className="ml-1.5 opacity-70">{counts[f]}</span>
              )}
            </button>
          ))}
        </div>
        <div className="relative">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search actor, action, IP…"
            className="!pl-9 !py-2 !text-xs !w-full sm:!w-64"
          />
        </div>
      </div>

      {/* entries */}
      <div className="pp-card overflow-hidden">
        {error && (
          <div className="p-6 text-center text-sm text-red-400">{error}</div>
        )}
        {!error && filtered === null && (
          <div className="p-4 space-y-2">
            {[...Array(8)].map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}
          </div>
        )}
        {!error && filtered && filtered.length === 0 && (
          <div className="p-10 text-center">
            <ScrollText size={26} className="mx-auto text-muted-foreground/40 mb-2" />
            <p className="text-sm text-muted-foreground">No matching entries.</p>
          </div>
        )}
        {!error && filtered && filtered.length > 0 && (
          <div className="overflow-x-auto custom-scrollbar">
            <table className="w-full text-left min-w-[760px]">
              <thead>
                <tr className="text-[10px] uppercase tracking-wider text-muted-foreground border-b border-border-subtle">
                  <th className="px-4 py-3 font-semibold">Time</th>
                  <th className="px-4 py-3 font-semibold">Actor</th>
                  <th className="px-4 py-3 font-semibold">Action</th>
                  <th className="px-4 py-3 font-semibold">Details</th>
                  <th className="px-4 py-3 font-semibold">Source IP</th>
                  <th className="px-4 py-3 font-semibold">Outcome</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((e, i) => {
                  const st = OUTCOME_STYLE[e.outcome] || OUTCOME_STYLE.failure;
                  return (
                    <motion.tr
                      key={e.id}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: Math.min(i * 0.02, 0.4) }}
                      className="border-b border-border-subtle last:border-0 hover:bg-muted/30 transition-colors"
                    >
                      <td className="px-4 py-2.5 text-[11px] font-mono text-muted-foreground whitespace-nowrap">
                        {timeAgo(e.timestamp)}
                      </td>
                      <td className="px-4 py-2.5">
                        <p className="text-xs font-semibold text-foreground-muted">{e.actorName}</p>
                        <p className="text-[10px] text-muted-foreground">{e.actorRole}</p>
                      </td>
                      <td className="px-4 py-2.5 text-[11px] font-mono text-blue-300 whitespace-nowrap">{e.action}</td>
                      <td className="px-4 py-2.5 text-xs text-muted-foreground max-w-[280px] truncate" title={e.details}>
                        {e.details || e.resource}
                      </td>
                      <td className="px-4 py-2.5 text-[11px] font-mono text-muted-foreground whitespace-nowrap">{e.ip}</td>
                      <td className="px-4 py-2.5">
                        <span
                          className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[10px] font-bold"
                          style={{ color: st.color, background: st.bg }}
                        >
                          {st.icon}
                          {e.outcome.toUpperCase()}
                        </span>
                      </td>
                    </motion.tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
