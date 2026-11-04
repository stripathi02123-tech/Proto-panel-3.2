import React, { useEffect, useRef, useState, useMemo } from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { AlertTriangle, X } from "lucide-react";

/* ============================================================================
   PROTO PANEL — premium UI primitives
   Animated counters · stat cards · SVG charts · gauges · dialogs · skeletons
   All real-data driven; every animation honours prefers-reduced-motion.
   ============================================================================ */

/** Smoothly counts from previous value to the next. */
export function AnimatedNumber({
  value,
  duration = 900,
  decimals = 0,
  suffix = "",
  className = "",
}: {
  value: number;
  duration?: number;
  decimals?: number;
  suffix?: string;
  className?: string;
}) {
  const reduce = useReducedMotion();
  const [display, setDisplay] = useState(value);
  const fromRef = useRef(value);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    if (reduce) {
      setDisplay(value);
      fromRef.current = value;
      return;
    }
    const from = fromRef.current;
    const start = performance.now();
    const step = (now: number) => {
      const t = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - t, 3); // easeOutCubic
      setDisplay(from + (value - from) * eased);
      if (t < 1) rafRef.current = requestAnimationFrame(step);
      else fromRef.current = value;
    };
    rafRef.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(rafRef.current);
  }, [value, duration, reduce]);

  return (
    <span className={className}>
      {display.toLocaleString(undefined, {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
      })}
      {suffix}
    </span>
  );
}

/** Shimmer skeleton block used while real data loads. */
export function Skeleton({ className = "", style }: { className?: string; style?: React.CSSProperties }) {
  return <div className={`pp-skeleton ${className}`} style={style} aria-hidden="true" />;
}

/** Premium stat card: icon chip, animated value, unit, sparkline slot. */
export function StatCard({
  icon,
  label,
  value,
  unit,
  accent = "#3b82f6",
  decimals = 0,
  spark,          // optional number[] history
  footer,         // optional footer line
  delay = 0,
}: {
  icon: React.ReactNode;
  label: string;
  value: number | null;
  unit?: string;
  accent?: string;
  decimals?: number;
  spark?: number[];
  footer?: React.ReactNode;
  delay?: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, delay, ease: [0.22, 1, 0.36, 1] }}
      className="pp-card p-4 group"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="pp-section-label truncate">{label}</p>
          <div className="mt-1.5 flex items-baseline gap-1.5">
            {value === null ? (
              <Skeleton className="h-8 w-20 mt-1" />
            ) : (
              <AnimatedNumber
                value={value}
                decimals={decimals}
                className="font-display text-[26px] leading-none font-bold text-foreground tabular-nums"
              />
            )}
            {unit && <span className="text-xs text-muted-foreground font-medium">{unit}</span>}
          </div>
        </div>
        <div
          className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 transition-transform duration-300 group-hover:scale-110"
          style={{
            color: accent,
            background: `${accent}14`,
            boxShadow: `inset 0 0 0 1px ${accent}2b`,
          }}
        >
          {icon}
        </div>
      </div>
      {spark && spark.length > 1 && (
        <Sparkline data={spark} accent={accent} className="mt-3 h-9" />
      )}
      {footer && <div className="mt-3 text-[11px] text-muted-foreground">{footer}</div>}
    </motion.div>
  );
}

/** Lightweight gradient-filled SVG sparkline. */
export function Sparkline({
  data,
  accent = "#3b82f6",
  className = "",
  strokeWidth = 1.6,
}: {
  data: number[];
  accent?: string;
  className?: string;
  strokeWidth?: number;
}) {
  const id = useMemo(() => `sp${Math.random().toString(36).slice(2, 9)}`, []);
  const W = 100;
  const H = 30;
  const { path, area } = useMemo(() => {
    if (!data || data.length < 2) return { path: "", area: "" };
    const min = Math.min(...data);
    const max = Math.max(...data);
    const range = max - min || 1;
    const pts = data.map((v, i) => {
      const x = (i / (data.length - 1)) * W;
      const y = H - 3 - ((v - min) / range) * (H - 6);
      return [x, y] as const;
    });
    // smooth polyline
    let d = `M ${pts[0][0]},${pts[0][1]}`;
    for (let i = 1; i < pts.length; i++) {
      const [x0, y0] = pts[i - 1];
      const [x1, y1] = pts[i];
      const mx = (x0 + x1) / 2;
      d += ` Q ${x0},${y0} ${mx},${(y0 + y1) / 2} Q ${x1},${y1} ${x1},${y1}`;
    }
    return { path: d, area: `${d} L ${W},${H} L 0,${H} Z` };
  }, [data]);

  if (!path) return null;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className={`w-full ${className}`} aria-hidden="true">
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={accent} stopOpacity="0.35" />
          <stop offset="100%" stopColor={accent} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${id})`} />
      <path d={path} fill="none" stroke={accent} strokeWidth={strokeWidth} strokeLinecap="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

/** Full-width live area chart with grid + hover crosshair. */
export function LiveAreaChart({
  data,
  accent = "#3b82f6",
  unit = "%",
  height = 150,
  max,
  labelFormatter,
}: {
  data: number[];
  accent?: string;
  unit?: string;
  height?: number;
  max?: number;
  labelFormatter?: (v: number) => string;
}) {
  const id = useMemo(() => `lc${Math.random().toString(36).slice(2, 9)}`, []);
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const W = 600;
  const H = height;
  const PAD = { l: 38, r: 12, t: 12, b: 20 };

  const resolvedMax = Math.max(max ?? 0, ...data, 1) * 1.15 || 1;

  const pts = useMemo(() => {
    if (!data || data.length < 2) return [];
    return data.map((v, i) => {
      const x = PAD.l + (i / (data.length - 1)) * (W - PAD.l - PAD.r);
      const y = PAD.t + (1 - v / resolvedMax) * (H - PAD.t - PAD.b);
      return [x, y] as const;
    });
  }, [data, resolvedMax, H]);

  const { path, area } = useMemo(() => {
    if (pts.length < 2) return { path: "", area: "" };
    let d = `M ${pts[0][0]},${pts[0][1]}`;
    for (let i = 1; i < pts.length; i++) {
      const [x0, y0] = pts[i - 1];
      const [x1, y1] = pts[i];
      const mx = (x0 + x1) / 2;
      d += ` Q ${x0},${y0} ${mx},${(y0 + y1) / 2} Q ${x1},${y1} ${x1},${y1}`;
    }
    return {
      path: d,
      area: `${d} L ${pts[pts.length - 1][0]},${H - PAD.b} L ${pts[0][0]},${H - PAD.b} Z`,
    };
  }, [pts, H]);

  const fmt = labelFormatter ?? ((v: number) => `${v.toFixed(0)}${unit}`);

  if (pts.length < 2) {
    return <Skeleton className="w-full" style={{ height: H }} />;
  }

  const hover = hoverIdx !== null ? pts[hoverIdx] : null;

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="w-full select-none"
      style={{ height }}
      onMouseLeave={() => setHoverIdx(null)}
      onMouseMove={(e) => {
        const rect = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
        const relX = ((e.clientX - rect.left) / rect.width) * W;
        let best = 0;
        let bestDist = Infinity;
        pts.forEach(([x], i) => {
          const d = Math.abs(x - relX);
          if (d < bestDist) { bestDist = d; best = i; }
        });
        setHoverIdx(best);
      }}
      role="img"
    >
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={accent} stopOpacity="0.32" />
          <stop offset="100%" stopColor={accent} stopOpacity="0.02" />
        </linearGradient>
      </defs>

      {/* horizontal gridlines */}
      {[0, 0.25, 0.5, 0.75, 1].map((f) => {
        const y = PAD.t + f * (H - PAD.t - PAD.b);
        const val = resolvedMax * (1 - f);
        return (
          <g key={f}>
            <line x1={PAD.l} y1={y} x2={W - PAD.r} y2={y} stroke="rgba(148,163,255,0.08)" strokeWidth="1" />
            <text x={PAD.l - 6} y={y + 3} textAnchor="end" fontSize="9" fill="#64748b" fontFamily="var(--font-mono)">
              {fmt(val)}
            </text>
          </g>
        );
      })}

      <path d={area} fill={`url(#${id})`} />
      <path d={path} fill="none" stroke={accent} strokeWidth="2" strokeLinecap="round" vectorEffect="non-scaling-stroke" />

      {/* last point pulse */}
      <circle cx={pts[pts.length - 1][0]} cy={pts[pts.length - 1][1]} r="3" fill={accent} />

      {/* hover crosshair */}
      {hover && (
        <g>
          <line x1={hover[0]} y1={PAD.t} x2={hover[0]} y2={H - PAD.b} stroke={accent} strokeOpacity="0.4" strokeDasharray="3 3" />
          <circle cx={hover[0]} cy={hover[1]} r="4" fill={accent} stroke="#04060d" strokeWidth="1.5" />
          <g transform={`translate(${Math.min(Math.max(hover[0], PAD.l + 30), W - PAD.r - 30)}, ${PAD.t + 4})`}>
            <rect x="-30" y="0" width="60" height="16" rx="4" fill="#0f1628" stroke="rgba(148,163,255,0.25)" />
            <text x="0" y="11.5" textAnchor="middle" fontSize="9" fill="#dbe3f4" fontFamily="var(--font-mono)">
              {fmt(data[hoverIdx!])}
            </text>
          </g>
        </g>
      )}
    </svg>
  );
}

/** Circular usage gauge with animated arc. */
export function Gauge({
  value,
  label,
  sub,
  accent = "#22d3ee",
  size = 120,
  warn = 75,
}: {
  value: number;         // 0..100
  label: string;
  sub?: string;
  accent?: string;
  size?: number;
  warn?: number;
}) {
  const id = useMemo(() => `gg${Math.random().toString(36).slice(2, 9)}`, []);
  const r = 42;
  const c = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(100, value));
  const color = pct >= warn ? "#f59e0b" : accent;
  return (
    <div className="flex flex-col items-center">
      <div className="relative" style={{ width: size, height: size }}>
        <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
          <defs>
            <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor={color} />
              <stop offset="100%" stopColor={color} stopOpacity="0.55" />
            </linearGradient>
          </defs>
          <circle cx="50" cy="50" r={r} fill="none" stroke="rgba(148,163,255,0.1)" strokeWidth="8" />
          <circle
            cx="50" cy="50" r={r} fill="none"
            stroke={`url(#${id})`}
            strokeWidth="8"
            strokeLinecap="round"
            strokeDasharray={c}
            strokeDashoffset={c - (pct / 100) * c}
            style={{ transition: "stroke-dashoffset 0.9s cubic-bezier(0.22,1,0.36,1), stroke 0.4s ease" }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <AnimatedNumber value={pct} decimals={1} suffix="%" className="font-display font-bold text-lg tabular-nums" />
        </div>
      </div>
      <p className="mt-1.5 text-xs font-semibold text-foreground-muted">{label}</p>
      {sub && <p className="text-[10px] text-muted-foreground font-mono">{sub}</p>}
    </div>
  );
}

/** Status pill with animated dot. */
export function StatusPill({ status }: { status: string }) {
  const map: Record<string, { cls: string; dot: string }> = {
    running: { cls: "pp-pill-running", dot: "#34d399" },
    online: { cls: "pp-pill-running", dot: "#34d399" },
    starting: { cls: "pp-pill-stopped", dot: "#fbbf24" },
    stopping: { cls: "pp-pill-stopped", dot: "#fbbf24" },
    offline: { cls: "pp-pill-stopped", dot: "#94a3b8" },
    exited: { cls: "pp-pill-stopped", dot: "#94a3b8" },
    error: { cls: "pp-pill-error", dot: "#f87171" },
    dead: { cls: "pp-pill-error", dot: "#f87171" },
  };
  const s = map[status] || map.offline;
  return (
    <span className={`pp-pill ${s.cls}`}>
      <span className="relative flex w-1.5 h-1.5">
        {(status === "running" || status === "online") && (
          <span className="absolute inline-flex w-full h-full rounded-full opacity-60 animate-ping" style={{ background: s.dot }} />
        )}
        <span className="relative inline-flex w-1.5 h-1.5 rounded-full" style={{ background: s.dot }} />
      </span>
      {status.toUpperCase()}
    </span>
  );
}

/** Confirmation dialog for dangerous actions. */
export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  danger = false,
  onConfirm,
  onCancel,
  busy = false,
}: {
  open: boolean;
  title: string;
  message: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  busy?: boolean;
}) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[100] flex items-center justify-center p-4"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        >
          <div className="absolute inset-0 bg-[rgba(2,4,10,0.72)] backdrop-blur-sm" onClick={busy ? undefined : onCancel} />
          <motion.div
            initial={{ opacity: 0, scale: 0.94, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 8 }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            className="relative w-full max-w-md pp-card p-6 !bg-[#0c1224]/95"
            role="alertdialog"
          >
            <div className="flex items-start gap-3.5">
              <div
                className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
                  danger
                    ? "bg-red-500/12 text-red-400 shadow-[inset_0_0_0_1px_rgba(239,68,68,0.3)]"
                    : "bg-blue-500/12 text-blue-400 shadow-[inset_0_0_0_1px_rgba(59,130,246,0.3)]"
                }`}
              >
                <AlertTriangle size={19} />
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="font-display font-bold text-[15px] text-foreground">{title}</h3>
                <div className="mt-1.5 text-sm text-muted-foreground leading-relaxed">{message}</div>
              </div>
              <button onClick={busy ? undefined : onCancel} className="p-1 text-muted-foreground hover:text-foreground rounded-md transition-colors" aria-label="Close">
                <X size={16} />
              </button>
            </div>
            <div className="mt-5 flex items-center justify-end gap-2.5">
              <button className="pp-btn-ghost px-4 py-2 text-sm" onClick={onCancel} disabled={busy}>
                {cancelLabel}
              </button>
              <button
                className={`px-4 py-2 text-sm ${danger ? "" : "pp-btn"}`}
                onClick={onConfirm}
                disabled={busy}
                style={
                  danger
                    ? {
                        background: "linear-gradient(135deg,#dc2626,#ef4444)",
                        color: "#fff",
                        fontWeight: 600,
                        borderRadius: 12,
                        boxShadow: "0 10px 26px -10px rgba(220,38,38,0.7)",
                      }
                    : undefined
                }
              >
                {busy ? "Working…" : confirmLabel}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/** Formats bytes into a human readable string. */
export function fmtBytes(bytes?: number, decimals = 1): string {
  if (bytes === undefined || bytes === null || isNaN(bytes)) return "—";
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(decimals)} ${sizes[i]}`;
}

/** Formats MB (the panel's resource unit) into GB when large. */
export function fmtMB(mb?: number): string {
  if (mb === undefined || mb === null || isNaN(mb)) return "—";
  if (mb >= 1024) return `${(mb / 1024).toFixed(1)} GB`;
  return `${Math.round(mb)} MB`;
}

/** Relative time formatting for timelines. */
export function timeAgo(iso: string): string {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}
