import React, { useEffect, useState, useCallback, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Bot, Users, Boxes, Package, ScrollText, RefreshCw, Plus, Pencil, Trash2,
  Power, PowerOff, ShieldCheck, Ban, CheckCircle2, XCircle, Terminal,
  Gauge, UserCheck, AlertTriangle, Zap, Server as ServerIcon,
} from "lucide-react";
import { Skeleton, StatCard, StatusPill, ConfirmDialog, timeAgo } from "../components/ui/Premium";

/**
 * PROTO PANEL — Bot Hosting administration (administrators only; backend
 * proxies to the PROTO HOSTING Discord bot's local API and enforces 403 for
 * everyone else).
 *
 * Everything shown here is REAL data from the bot's SQLite database:
 * registered users, editable plans, hosted servers, deployment & audit logs.
 * If the bot service is offline the page says so honestly — no fake numbers.
 */

interface HostingPlan {
  id: number;
  name: string;
  runtime: "node.js" | "python";
  cpu: number;
  memory: number;
  disk: number;
  required_invites: number;
  available: number;
  description: string;
  sort_order: number;
}

interface HostingUser {
  id: number;
  discord_id: string;
  account_id: string;
  username: string;
  email: string;
  status: string;
  created_at: string;
  servers: number;
  invites: { valid: number; total: number; pending: number; departed: number };
}

interface HostingServer {
  id: number;
  owner_discord_id: string;
  owner_account: string | null;
  owner_name: string | null;
  name: string;
  plan_name: string;
  runtime: string;
  status: string;
  created_at: string;
  petro_server_id: number | null;
}

interface HostingStats {
  users: number;
  activeUsers: number;
  suspendedUsers: number;
  servers: number;
  deploysOk: number;
  deploysFailed: number;
  activeInviteCodes: number;
  validJoins: number;
}

type Tab = "overview" | "users" | "plans" | "servers" | "audit";

const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
  { id: "overview", label: "Overview", icon: <Gauge size={14} /> },
  { id: "users", label: "Users", icon: <Users size={14} /> },
  { id: "plans", label: "Plans", icon: <Package size={14} /> },
  { id: "servers", label: "Servers", icon: <Boxes size={14} /> },
  { id: "audit", label: "Logs", icon: <ScrollText size={14} /> },
];

const auth = (): HeadersInit => ({ Authorization: `Bearer ${localStorage.getItem("proto_token")}` || "" });

const fmtMem = (mb: number) => (mb >= 1024 ? `${(mb / 1024).toFixed(mb % 1024 === 0 ? 0 : 1)} GB` : `${mb} MB`);

export default function HostingPage() {
  const [tab, setTab] = useState<Tab>("overview");
  const [health, setHealth] = useState<{ ok: boolean; version: string; uptime: number; maintenance: boolean; petroConfigured: boolean } | null>(null);
  const [stats, setStats] = useState<HostingStats | null>(null);
  const [users, setUsers] = useState<HostingUser[] | null>(null);
  const [plans, setPlans] = useState<HostingPlan[] | null>(null);
  const [servers, setServers] = useState<HostingServer[] | null>(null);
  const [audit, setAudit] = useState<any[] | null>(null);
  const [deploys, setDeploys] = useState<any[] | null>(null);
  const [offline, setOffline] = useState<string | null>(null);
  const [editor, setEditor] = useState<HostingPlan | "new" | null>(null);
  const [deleting, setDeleting] = useState<HostingPlan | null>(null);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<{ ok: boolean; text: string } | null>(null);

  const api = useCallback(async <T,>(path: string, init?: RequestInit): Promise<T | null> => {
    try {
      const res = await fetch(`/api/hosting${path}`, {
        ...init,
        headers: { ...auth(), "Content-Type": "application/json", ...(init?.headers || {}) },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setOffline(data.error || `HTTP ${res.status}`);
        return null;
      }
      setOffline(null);
      return data as T;
    } catch {
      setOffline("The hosting bot API is unreachable.");
      return null;
    }
  }, []);

  const loadAll = useCallback(async () => {
    setHealth(null);
    setStats(null);
    const h = await api<any>("/health");
    if (h) setHealth(h);
    const s = await api<HostingStats>("/stats");
    if (s) setStats(s);
  }, [api]);

  useEffect(() => { void loadAll(); }, [loadAll]);

  useEffect(() => {
    if (tab === "users" && !users) void api<{ users: HostingUser[] }>("/users").then((d) => d && setUsers(d.users));
    if (tab === "plans" && !plans) void api<{ plans: HostingPlan[] }>("/plans").then((d) => d && setPlans(d.plans));
    if (tab === "servers" && !servers) void api<{ servers: HostingServer[] }>("/servers").then((d) => d && setServers(d.servers));
    if (tab === "audit" && !audit) {
      void api<{ logs: any[] }>("/audit?limit=80").then((d) => d && setAudit(d.logs));
      void api<{ logs: any[] }>("/deployment-logs?limit=40").then((d) => d && setDeploys(d.logs));
    }
  }, [tab]); // eslint-disable-line react-hooks/exhaustive-deps

  const flash = (ok: boolean, text: string) => {
    setToast({ ok, text });
    setTimeout(() => setToast(null), 3500);
  };

  const toggleMaintenance = async () => {
    if (!health) return;
    setBusy(true);
    const r = await api<any>("/maintenance", {
      method: "POST",
      body: JSON.stringify({ enabled: !health.maintenance }),
    });
    setBusy(false);
    if (r) {
      setHealth({ ...health, maintenance: r.maintenance.on });
      flash(true, `Maintenance ${r.maintenance.on ? "enabled" : "disabled"}`);
    }
  };

  const suspendUser = async (u: HostingUser, suspend: boolean) => {
    setBusy(true);
    await api(`/users/${u.discord_id}/${suspend ? "suspend" : "unsuspend"}`, { method: "POST" });
    setBusy(false);
    setUsers((prev) => prev ? prev.map((x) => (x.discord_id === u.discord_id ? { ...x, status: suspend ? "suspended" : "active" } : x)) : prev);
    flash(true, `${u.account_id} ${suspend ? "suspended" : "re-activated"}`);
  };

  const savePlan = async (plan: HostingPlan, isNew: boolean) => {
    setBusy(true);
    const body = JSON.stringify({
      name: plan.name,
      runtime: plan.runtime,
      cpu: plan.cpu,
      memory: plan.memory,
      disk: plan.disk,
      required_invites: plan.required_invites,
      available: plan.available,
      description: plan.description,
      sort_order: plan.sort_order,
    });
    const r = isNew
      ? await api<{ plan: HostingPlan }>("/plans", { method: "POST", body })
      : await api<{ plan: HostingPlan }>(`/plans/${plan.id}`, { method: "PATCH", body });
    setBusy(false);
    if (r?.plan) {
      setPlans((prev) => {
        if (!prev) return [r.plan];
        return isNew ? [...prev, r.plan] : prev.map((p) => (p.id === r.plan.id ? r.plan : p));
      });
      setEditor(null);
      flash(true, `Plan "${r.plan.name}" saved`);
    } else {
      flash(false, "Could not save the plan — check the values");
    }
  };

  const deletePlan = async () => {
    if (!deleting) return;
    setBusy(true);
    const r = await api(`/plans/${deleting.id}`, { method: "DELETE" });
    setBusy(false);
    setDeleting(null);
    if (r !== null) {
      setPlans((prev) => prev ? prev.filter((p) => p.id !== deleting.id) : prev);
      flash(true, "Plan deleted");
    }
  };

  const online = !offline && health !== null;
  const plansNode = useMemo(() => (plans ?? []).slice().sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name)), [plans]);

  return (
    <div className="p-4 md:p-6 lg:p-8 max-w-[1300px] mx-auto w-full space-y-5">
      {/* header */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col md:flex-row md:items-end justify-between gap-3">
        <div>
          <p className="pp-section-label">Administration</p>
          <h1 className="mt-1 font-display text-2xl md:text-[26px] font-bold tracking-tight">
            Bot <span className="pp-gradient-text">Hosting</span>
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            PROTO HOSTING Discord platform · users, plans, servers & logs from the bot database
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-mono font-semibold"
            style={
              online
                ? { color: "#34d399", background: "rgba(52,211,153,0.1)", boxShadow: "inset 0 0 0 1px rgba(52,211,153,0.25)" }
                : { color: "#f87171", background: "rgba(248,113,113,0.1)", boxShadow: "inset 0 0 0 1px rgba(248,113,113,0.25)" }
            }
          >
            {online ? <CheckCircle2 size={12} /> : <XCircle size={12} />}
            {online ? `BOT v${health!.version} · UP ${Math.floor(health!.uptime / 60)}m` : "BOT OFFLINE"}
          </span>
          <button onClick={loadAll} className="pp-btn-ghost px-3.5 py-2 text-xs gap-2">
            <RefreshCw size={13} /> Refresh
          </button>
        </div>
      </motion.div>

      {/* offline banner — honest state, includes setup steps */}
      {offline && (
        <motion.div
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          className="qx-glass rounded-xl p-4 border border-amber-500/25 flex gap-3"
          style={{ background: "rgba(245,158,11,0.06)" }}
        >
          <AlertTriangle size={18} className="text-amber-400 flex-shrink-0 mt-0.5" />
          <div className="text-sm">
            <p className="font-semibold text-amber-200">Hosting bot service unavailable</p>
            <p className="mt-1 text-muted-foreground text-xs leading-relaxed">{offline}</p>
            <p className="mt-2 text-[11px] text-muted-foreground font-mono leading-relaxed">
              cd discord-bot && npm install && cp .env.example .env<br />
              # fill in DISCORD_BOT_TOKEN, BOT_OWNER_IDS, PETRO_* and BOT_API_SECRET<br />
              pm2 start ecosystem.config.cjs && pm2 save
            </p>
          </div>
        </motion.div>
      )}

      {/* tabs */}
      <div className="flex gap-1.5 flex-wrap">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-3.5 py-2 rounded-xl text-xs font-semibold transition-all flex items-center gap-1.5 ${
              tab === t.id
                ? "bg-blue-500/15 text-blue-200 shadow-[inset_0_0_0_1px_rgba(59,130,246,0.35)]"
                : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
            }`}
          >
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {/* toast */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="fixed bottom-5 right-5 z-50 px-4 py-2.5 rounded-xl text-xs font-semibold shadow-2xl"
            style={{
              background: toast.ok ? "rgba(16,185,129,0.15)" : "rgba(239,68,68,0.15)",
              color: toast.ok ? "#6ee7b7" : "#fca5a5",
              boxShadow: `inset 0 0 0 1px ${toast.ok ? "rgba(16,185,129,0.3)" : "rgba(239,68,68,0.3)"}`,
              backdropFilter: "blur(12px)",
            }}
          >
            {toast.ok ? <CheckCircle2 size={13} className="inline mr-1.5 -mt-0.5" /> : <XCircle size={13} className="inline mr-1.5 -mt-0.5" />}
            {toast.text}
          </motion.div>
        )}
      </AnimatePresence>

      {/* ---------------------------------------------------------- overview */}
      {tab === "overview" && (
        <div className="space-y-5">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
            {!stats ? (
              Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-[118px] rounded-2xl" />)
            ) : (
              <>
                <StatCard label="Registered users" value={stats.users} footer={`${stats.activeUsers} active · ${stats.suspendedUsers} suspended`} icon={<UserCheck size={15} />} accent="#3b82f6" />
                <StatCard label="Hosted servers" value={stats.servers} footer="active deployments" icon={<ServerIcon size={15} />} accent="#22d3ee" />
                <StatCard label="Successful deploys" value={stats.deploysOk} footer={`${stats.deploysFailed} failed`} icon={<Zap size={15} />} accent="#34d399" />
                <StatCard label="Valid invites" value={stats.validJoins} footer={`${stats.activeInviteCodes} tracked codes`} icon={<Users size={15} />} accent="#8b5cf6" />
              </>
            )}
          </div>

          <div className="grid md:grid-cols-2 gap-3.5">
            <div className="pp-card rounded-2xl p-5">
              <div className="flex items-center gap-2 mb-3">
                <Bot size={16} className="text-blue-400" />
                <h3 className="font-display font-bold text-sm">Bot service</h3>
              </div>
              {health ? (
                <div className="space-y-2 text-xs">
                  <Row k="Version" v={`proto-hosting-bot v${health.version}`} />
                  <Row k="Uptime" v={`${Math.floor(health.uptime / 3600)}h ${Math.floor((health.uptime % 3600) / 60)}m`} />
                  <Row k="Petro Panel" v={health.petroConfigured ? "connected" : "not configured"} ok={health.petroConfigured} />
                  <Row k="Maintenance mode" v={health.maintenance ? "ON" : "off"} ok={!health.maintenance} />
                </div>
              ) : (
                <Skeleton className="h-24 rounded-xl" />
              )}
            </div>
            <div className="pp-card rounded-2xl p-5 flex flex-col">
              <div className="flex items-center gap-2 mb-3">
                <Terminal size={16} className="text-cyan-400" />
                <h3 className="font-display font-bold text-sm">Discord commands</h3>
              </div>
              <div className="text-[11px] font-mono leading-relaxed text-muted-foreground">
                <p><span className="text-blue-300">!register</span> — one account per Discord user</p>
                <p><span className="text-blue-300">!HYdeploy node.js | python</span> — plan select → invite check</p>
                <p><span className="text-blue-300">!invites</span> / <span className="text-blue-300">!invites top</span></p>
                <p><span className="text-blue-300">!servers</span> · <span className="text-blue-300">!server start|stop|restart|console|command &lt;name&gt;</span></p>
                <p><span className="text-blue-300">!admin</span> — full admin suite (plans editable)</p>
              </div>
              <button
                onClick={toggleMaintenance}
                disabled={busy || !health}
                className="pp-btn mt-4 py-2 text-xs"
                style={health?.maintenance ? { background: "linear-gradient(135deg,#f59e0b,#ef4444)" } : undefined}
              >
                {health?.maintenance ? <><PowerOff size={13} /> DISABLE MAINTENANCE</> : <><Power size={13} /> ENABLE MAINTENANCE</>}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ---------------------------------------------------------- users */}
      {tab === "users" && (
        <PanelTable
          title="Registered users"
          count={users?.length}
          head={["Account", "Discord", "Status", "Invites (valid/pending)", "Servers", "Registered", ""]}
          loading={!users}
          rows={(users ?? []).map((u) => ({
            key: u.discord_id,
            cells: [
              <div key="a"><span className="font-mono text-[11px] text-blue-300">{u.account_id}</span><p className="text-[11px] text-muted-foreground">{u.username} · {u.email}</p></div>,
              <span key="d" className="font-mono text-[11px]">{u.discord_id}</span>,
              <StatusPill key="s" status={u.status === "active" ? "running" : "stopped"} />,
              <span key="i" className="font-mono text-[11px]"><span className="text-emerald-400">{u.invites.valid}</span> / <span className="text-amber-400">{u.invites.pending}</span> <span className="text-muted-foreground">({u.invites.departed} left)</span></span>,
              <span key="sv" className="font-mono text-[11px]">{u.servers}</span>,
              <span key="c" className="text-[11px] text-muted-foreground">{timeAgo(u.created_at)}</span>,
              <button
                key="b"
                onClick={() => suspendUser(u, u.status === "active")}
                disabled={busy}
                className="px-2.5 py-1 rounded-lg text-[10px] font-bold transition-all"
                style={
                  u.status === "active"
                    ? { color: "#f87171", background: "rgba(239,68,68,0.1)", boxShadow: "inset 0 0 0 1px rgba(239,68,68,0.25)" }
                    : { color: "#34d399", background: "rgba(52,211,153,0.1)", boxShadow: "inset 0 0 0 1px rgba(52,211,153,0.25)" }
                }
              >
                {u.status === "active" ? <><Ban size={10} className="inline -mt-0.5 mr-1" />SUSPEND</> : <><CheckCircle2 size={10} className="inline -mt-0.5 mr-1" />ACTIVATE</>}
              </button>,
            ],
          }))}
        />
      )}

      {/* ---------------------------------------------------------- plans */}
      {tab === "plans" && (
        <div className="space-y-3.5">
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground">
              Plans live in the bot database — edits apply instantly, no restart. Offered by <span className="font-mono text-blue-300">!HYdeploy</span>.
            </p>
            <button onClick={() => setEditor("new")} className="pp-btn px-3.5 py-2 text-xs">
              <Plus size={13} /> New plan
            </button>
          </div>
          <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-3.5">
            {!plans ? (
              Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-44 rounded-2xl" />)
            ) : (
              plansNode.map((p, i) => (
                <motion.div
                  key={p.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.04 }}
                  className="pp-card rounded-2xl p-4 flex flex-col gap-2.5"
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className="font-display font-bold text-sm">
                        {p.name}
                        <span className="ml-2 text-[10px] font-mono px-1.5 py-0.5 rounded" style={{ color: "#22d3ee", background: "rgba(34,211,238,0.1)" }}>
                          {p.runtime}
                        </span>
                      </h3>
                      {p.description && <p className="text-[11px] text-muted-foreground mt-0.5">{p.description}</p>}
                    </div>
                    {p.available ? (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded" style={{ color: "#34d399", background: "rgba(52,211,153,0.1)" }}>LIVE</span>
                    ) : (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded" style={{ color: "#94a3b8", background: "rgba(148,163,184,0.1)" }}>HIDDEN</span>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px] font-mono text-muted-foreground">
                    <span>CPU ······ <span className="text-foreground">{p.cpu}%</span></span>
                    <span>RAM ······ <span className="text-foreground">{fmtMem(p.memory)}</span></span>
                    <span>DISK ····· <span className="text-foreground">{fmtMem(p.disk)}</span></span>
                    <span>INVITES ·· <span className="text-cyan-300">{p.required_invites}</span></span>
                  </div>
                  <div className="flex gap-2 mt-auto pt-1">
                    <button onClick={() => setEditor(p)} className="pp-btn-ghost flex-1 py-1.5 text-[11px] justify-center gap-1.5">
                      <Pencil size={11} /> Edit
                    </button>
                    <button
                      onClick={() => setDeleting(p)}
                      className="px-3 py-1.5 rounded-lg text-[11px] font-semibold text-red-400 transition-all hover:bg-red-500/10 flex items-center gap-1.5"
                    >
                      <Trash2 size={11} /> Delete
                    </button>
                  </div>
                </motion.div>
              ))
            )}
          </div>

          {/* plan editor */}
          <AnimatePresence>
            {editor && (
              <PlanEditor
                key={editor === "new" ? "new" : editor.id}
                plan={editor === "new" ? null : editor}
                busy={busy}
                onCancel={() => setEditor(null)}
                onSave={savePlan}
              />
            )}
          </AnimatePresence>
        </div>
      )}

      {/* ---------------------------------------------------------- servers */}
      {tab === "servers" && (
        <PanelTable
          title="Hosted servers"
          count={servers?.length}
          head={["Server", "Owner", "Plan / runtime", "Status", "Petro", "Created"]}
          loading={!servers}
          rows={(servers ?? []).map((s) => ({
            key: String(s.id),
            cells: [
              <div key="n"><span className="font-semibold text-[12px]">{s.name}</span><p className="text-[10px] text-muted-foreground font-mono">#{s.id}</p></div>,
              <div key="o"><span className="text-[11px]">{s.owner_name || "—"}</span><p className="text-[10px] text-muted-foreground font-mono">{s.owner_account || s.owner_discord_id}</p></div>,
              <span key="p" className="text-[11px]">{s.plan_name || "—"} · <span className="font-mono text-cyan-300">{s.runtime}</span></span>,
              <StatusPill key="s" status={s.status === "running" ? "running" : s.status === "deleted" ? "stopped" : "installing"} />,
              <span key="pv" className="font-mono text-[11px] text-muted-foreground">{s.petro_server_id ? `#${s.petro_server_id}` : "—"}</span>,
              <span key="c" className="text-[11px] text-muted-foreground">{timeAgo(s.created_at)}</span>,
            ],
          }))}
        />
      )}

      {/* ---------------------------------------------------------- audit */}
      {tab === "audit" && (
        <div className="space-y-3.5">
          <PanelTable
            title="Deployment history"
            count={deploys?.length}
            head={["When", "Discord user", "Action", "Plan", "Outcome", "Detail"]}
            loading={!deploys}
            compact
            rows={(deploys ?? []).map((d) => ({
              key: `d${d.id}`,
              cells: [
                <span key="w" className="text-[11px] text-muted-foreground">{timeAgo(d.created_at)}</span>,
                <span key="u" className="font-mono text-[11px]">{d.discord_id}</span>,
                <span key="a" className="text-[11px] font-semibold">{d.action}</span>,
                <span key="p" className="text-[11px]">{d.plan_name || "—"}{d.runtime ? ` (${d.runtime})` : ""}</span>,
                <StatusPill key="s" status={d.status === "success" ? "running" : "stopped"} />,
                <span key="dt" className="text-[11px] text-muted-foreground">{(d.detail || "—").slice(0, 60)}</span>,
              ],
            }))}
          />
          <PanelTable
            title="Bot audit trail"
            count={audit?.length}
            head={["When", "Actor", "Action", "Target", "Detail"]}
            loading={!audit}
            compact
            rows={(audit ?? []).map((a) => ({
              key: `a${a.id}`,
              cells: [
                <span key="w" className="text-[11px] text-muted-foreground">{timeAgo(a.created_at)}</span>,
                <span key="ac" className="font-mono text-[11px]">{a.actor_discord_id}</span>,
                <span key="at" className="text-[11px] font-semibold">{a.action}</span>,
                <span key="tg" className="text-[11px] font-mono text-blue-300">{a.target || "—"}</span>,
                <span key="dt" className="text-[11px] text-muted-foreground">{(a.detail || "—").slice(0, 70)}</span>,
              ],
            }))}
          />
        </div>
      )}

      {/* delete confirm */}
      <ConfirmDialog
        open={deleting !== null}
        title="Delete hosting plan?"
        message={`"${deleting?.name}" will no longer be offered. Existing servers are not affected.`}
        confirmLabel="Delete plan"
        danger
        onConfirm={deletePlan}
        onCancel={() => setDeleting(null)}
      />
    </div>
  );
}

function Row({ k, v, ok }: { k: string; v: string; ok?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground">{k}</span>
      <span className={`font-mono ${ok === undefined ? "" : ok ? "text-emerald-400" : "text-amber-400"}`}>{v}</span>
    </div>
  );
}

function PanelTable({
  title, count, head, rows, loading, compact,
}: {
  title: string;
  count?: number;
  head: string[];
  rows: { key: string; cells: React.ReactNode[] }[];
  loading: boolean;
  compact?: boolean;
}) {
  return (
    <div className="pp-card rounded-2xl overflow-hidden">
      <div className="px-4 py-3 border-b border-[rgba(148,163,184,0.08)] flex items-center justify-between">
        <h3 className="font-display font-bold text-sm">{title}</h3>
        {count !== undefined && <span className="text-[11px] font-mono text-muted-foreground">{count} total</span>}
      </div>
      {loading ? (
        <div className="p-4 space-y-2">
          {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className={`rounded-xl ${compact ? "h-9" : "h-12"}`} />)}
        </div>
      ) : rows.length === 0 ? (
        <p className="p-6 text-center text-xs text-muted-foreground">Nothing here yet.</p>
      ) : (
        <div className="overflow-x-auto custom-scrollbar">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-[rgba(148,163,184,0.08)]">
                {head.map((h, i) => (
                  <th key={i} className={`px-4 ${compact ? "py-2" : "py-2.5"} text-[10px] font-bold uppercase tracking-wider text-muted-foreground whitespace-nowrap`}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.key} className="border-b border-[rgba(148,163,184,0.05)] hover:bg-[rgba(59,130,246,0.04)] transition-colors">
                  {r.cells.map((c, i) => (
                    <td key={i} className={`px-4 ${compact ? "py-1.5" : "py-2.5"} align-middle`}>{c}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function PlanEditor({
  plan, busy, onSave, onCancel,
}: {
  plan: HostingPlan | null;
  busy: boolean;
  onSave: (p: HostingPlan, isNew: boolean) => void;
  onCancel: () => void;
}) {
  const [form, setForm] = useState<HostingPlan>(
    plan ?? {
      id: 0, name: "", runtime: "node.js", cpu: 100, memory: 1024, disk: 4096,
      required_invites: 1, available: 1, description: "", sort_order: 100,
    }
  );
  const set = (patch: Partial<HostingPlan>) => setForm((f) => ({ ...f, ...patch }));

  const field = "w-full bg-[rgba(10,15,30,0.6)] border border-[rgba(148,163,184,0.15)] focus:border-blue-400/50 rounded-lg px-3 py-2 text-xs outline-none transition-colors";
  const label = "block text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1";

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      className="pp-card rounded-2xl p-5"
      style={{ boxShadow: "0 0 0 1px rgba(59,130,246,0.2), 0 20px 50px -20px rgba(59,130,246,0.3)" }}
    >
      <div className="flex items-center gap-2 mb-4">
        <Package size={15} className="text-blue-400" />
        <h3 className="font-display font-bold text-sm">{plan ? `Edit plan — ${plan.name}` : "Create a new plan"}</h3>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="col-span-2">
          <span className={label}>Name</span>
          <input className={field} value={form.name} onChange={(e) => set({ name: e.target.value })} placeholder="Starter" />
        </div>
        <div>
          <span className={label}>Runtime</span>
          <select className={field} value={form.runtime} onChange={(e) => set({ runtime: e.target.value as HostingPlan["runtime"] })}>
            <option value="node.js">node.js</option>
            <option value="python">python</option>
          </select>
        </div>
        <div>
          <span className={label}>CPU (%)</span>
          <input className={field} type="number" min={25} max={800} value={form.cpu} onChange={(e) => set({ cpu: parseInt(e.target.value) || 0 })} />
        </div>
        <div>
          <span className={label}>RAM (MiB)</span>
          <input className={field} type="number" min={128} max={32768} value={form.memory} onChange={(e) => set({ memory: parseInt(e.target.value) || 0 })} />
        </div>
        <div>
          <span className={label}>Disk (MiB)</span>
          <input className={field} type="number" min={256} max={262144} value={form.disk} onChange={(e) => set({ disk: parseInt(e.target.value) || 0 })} />
        </div>
        <div>
          <span className={label}>Required invites</span>
          <input className={field} type="number" min={0} max={100000} value={form.required_invites} onChange={(e) => set({ required_invites: parseInt(e.target.value) || 0 })} />
        </div>
        <div>
          <span className={label}>Sort order</span>
          <input className={field} type="number" min={0} max={9999} value={form.sort_order} onChange={(e) => set({ sort_order: parseInt(e.target.value) || 0 })} />
        </div>
        <div className="col-span-2">
          <span className={label}>Description</span>
          <input className={field} value={form.description} onChange={(e) => set({ description: e.target.value })} placeholder="Short marketing line" />
        </div>
        <div className="flex items-end">
          <label className="flex items-center gap-2 text-xs cursor-pointer select-none">
            <input
              type="checkbox"
              checked={form.available === 1}
              onChange={(e) => set({ available: e.target.checked ? 1 : 0 })}
              className="accent-blue-500 w-4 h-4"
            />
            Available in !HYdeploy
          </label>
        </div>
      </div>
      <div className="flex gap-2 mt-4 justify-end">
        <button onClick={onCancel} className="pp-btn-ghost px-4 py-2 text-xs">Cancel</button>
        <button
          onClick={() => onSave(form, !plan)}
          disabled={busy || !form.name || form.cpu < 25 || form.memory < 128 || form.disk < 256}
          className="pp-btn px-4 py-2 text-xs"
        >
          <ShieldCheck size={13} /> {plan ? "Save changes" : "Create plan"}
        </button>
      </div>
    </motion.div>
  );
}
