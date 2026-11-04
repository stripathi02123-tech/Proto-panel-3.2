import React from "react";
import { Link, useLocation } from "react-router-dom";
import {
  Server,
  LayoutDashboard,
  Plus,
  LogOut,
  X,
  Settings,
  Key,
  User,
  Activity,
  Box,
  ChevronLeft,
  ChevronRight,
  Zap,
  Network,
  ShieldCheck,
  Gauge,
  ScrollText,
  Users,
  HardDrive,
  ChevronDown,
  Bot,
} from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { useSettings } from "../context/SettingsContext";
import { motion, AnimatePresence } from "framer-motion";

interface SidebarProps {
  onClose?: () => void;
  isCollapsed?: boolean;
  toggleCollapse?: () => void;
}

interface NavItem {
  name: string;
  path: string;
  icon: React.ReactNode;
  /** hex accent used for the active glow */
  accent: string;
  badge?: string;
}

interface NavSection {
  title: string;
  items: NavItem[];
}

export function Sidebar({ onClose, isCollapsed, toggleCollapse }: SidebarProps) {
  const location = useLocation();
  const { user, logout } = useAuth();
  const { panelName, panelLogo } = useSettings();

  const isOwnerOrAdmin = user?.role === "admin" || user?.role === "owner";

  const pName = panelName || "PROTO PANEL";
  const nameParts = pName.split(" ");
  const firstWord = nameParts[0].toUpperCase();
  const restWords = nameParts.slice(1).join(" ").toUpperCase() || "PANEL";

  /**
   * Navigation is grouped into logical sections and filtered by the logged-in
   * user's role. Ordinary users never see node administration, fleet or
   * system configuration entries (the backend enforces the same rules).
   */
  const sections: NavSection[] = [
    {
      title: "Main",
      items: [
        { name: "Overview", path: "/", icon: <LayoutDashboard size={18} />, accent: "#22d3ee" },
        { name: "VPS Instances", path: "/servers", icon: <Server size={18} />, accent: "#34d399" },
        ...(isOwnerOrAdmin
          ? [{
              name: "Create VPS",
              path: "/servers/create",
              icon: <Plus size={18} />,
              accent: "#a78bfa",
              badge: "NEW",
            } as NavItem]
          : []),
      ],
    },
    {
      title: "Management",
      items: [
        ...(isOwnerOrAdmin
          ? [{
              name: "Networking",
              path: "/nodes",
              icon: <Network size={18} />,
              accent: "#38bdf8",
            } as NavItem]
          : []),
        {
          name: "Backups",
          path: "/backups",
          icon: <HardDrive size={18} />,
          accent: "#fbbf24",
        },
      ],
    },
    {
      title: "System",
      items: [
        { name: "Monitoring", path: "/monitoring", icon: <Gauge size={18} />, accent: "#f472b6" },
        ...(isOwnerOrAdmin
          ? [{
              name: "Activity Logs",
              path: "/activity",
              icon: <ScrollText size={18} />,
              accent: "#fb923c",
            } as NavItem]
          : []),
        { name: "Settings", path: "/account", icon: <Settings size={18} />, accent: "#2dd4bf" },
      ],
    },
  ];

  if (isOwnerOrAdmin) {
    sections.push({
      title: "Administration",
      items: [
        { name: "Users", path: "/admin/users", icon: <Users size={18} />, accent: "#60a5fa" },
        { name: "Bot Hosting", path: "/hosting", icon: <Bot size={18} />, accent: "#22d3ee", badge: "NEW" },
        { name: "API Keys", path: "/api-keys", icon: <Key size={18} />, accent: "#eab308" },
        { name: "Fleet Overview", path: "/admin/servers", icon: <Box size={18} />, accent: "#f97316" },
        { name: "System Configuration", path: "/admin/settings", icon: <ShieldCheck size={18} />, accent: "#818cf8" },
      ],
    });
  }

  const isActive = (path: string) =>
    location.pathname === path || (path !== "/" && location.pathname.startsWith(path));

  return (
    <aside
      className={`h-full flex flex-col bg-[#070b18]/95 backdrop-blur-xl text-white border-r border-[rgba(148,163,255,0.1)] transition-[width] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] z-30 select-none ${
        isCollapsed ? "w-[72px]" : "w-64"
      }`}
    >
      {/* ---- Brand header ------------------------------------------------ */}
      <div className="h-16 px-3.5 flex items-center justify-between border-b border-[rgba(148,163,255,0.08)] flex-shrink-0 bg-[rgba(15,22,40,0.35)]">
        <Link to="/" className="flex items-center gap-2.5 min-w-0 group" onClick={onClose}>
          {panelLogo ? (
            <img src={panelLogo} alt="Logo" className="w-9 h-9 rounded-xl object-contain flex-shrink-0 group-hover:scale-105 transition-transform" />
          ) : (
            <div
              className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 shadow-[0_8px_22px_-8px_rgba(37,99,235,0.8)] group-hover:scale-105 transition-transform"
              style={{ background: "linear-gradient(135deg,#2563eb 0%,#3b82f6 45%,#22d3ee 130%)" }}
            >
              <Zap size={18} strokeWidth={2.5} className="text-white" />
            </div>
          )}
          {!isCollapsed && (
            <div className="truncate">
              <div className="font-display font-bold text-[13px] tracking-wide uppercase truncate flex items-center gap-1.5">
                <span className="pp-gradient-text">{firstWord}</span>
                <span className="text-[#8b96b3] font-medium">{restWords}</span>
              </div>
              <div className="flex items-center gap-1.5 font-mono text-[9px] text-[#8b96b3] tracking-wider mt-0.5">
                <span className="relative flex w-1.5 h-1.5">
                  <span className="absolute inline-flex w-full h-full rounded-full bg-emerald-400 opacity-60 animate-ping" />
                  <span className="relative inline-flex w-1.5 h-1.5 rounded-full bg-emerald-400" />
                </span>
                <span>ALL SYSTEMS GO</span>
              </div>
            </div>
          )}
        </Link>

        {onClose && (
          <button
            onClick={onClose}
            className="md:hidden p-1.5 text-[#8b96b3] hover:text-white hover:bg-[rgba(148,163,255,0.1)] rounded-lg transition-colors"
            title="Close menu"
          >
            <X size={18} />
          </button>
        )}

        <button
          onClick={toggleCollapse}
          className="hidden md:flex p-1.5 text-[#8b96b3] hover:text-white hover:bg-[rgba(148,163,255,0.1)] rounded-lg transition-colors"
          title={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {isCollapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
        </button>
      </div>

      {/* ---- Quick deploy CTA --------------------------------------------- */}
      {!isCollapsed && isOwnerOrAdmin && (
        <div className="px-3 pt-3 pb-1">
          <Link
            to="/servers/create"
            onClick={onClose}
            className="pp-btn w-full py-2 px-3 text-xs font-semibold tracking-wider"
          >
            <Plus size={14} className="group-hover:rotate-90 transition-transform duration-300" />
            DEPLOY SERVER
          </Link>
        </div>
      )}
      {isCollapsed && isOwnerOrAdmin && (
        <div className="pt-3 pb-1 px-3 flex justify-center">
          <Link
            to="/servers/create"
            onClick={onClose}
            title="Deploy a new server"
            className="pp-btn w-10 h-10 !rounded-xl"
          >
            <Plus size={16} />
          </Link>
        </div>
      )}

      {/* ---- Navigation ---------------------------------------------------- */}
      <nav className="flex-1 w-full px-2.5 py-3 space-y-4 overflow-y-auto custom-scrollbar">
        {sections.map((section, sIdx) => (
          <div key={sIdx} className="space-y-0.5">
            {!isCollapsed ? (
              <p className="pp-section-label px-2.5 pb-1.5">{section.title}</p>
            ) : (
              <div className="mx-auto my-2 h-px w-8 bg-[rgba(148,163,255,0.12)]" />
            )}
            {section.items.map((item) => {
              const active = isActive(item.path);
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  onClick={onClose}
                  title={isCollapsed ? item.name : undefined}
                  className={`sidebar-nav-item relative flex items-center ${
                    isCollapsed ? "justify-center px-0 py-2.5" : "px-3 py-2"
                  } rounded-xl transition-all duration-200 group ${
                    active ? "text-white" : "text-[#8b96b3] hover:text-white hover:bg-[rgba(148,163,255,0.07)]"
                  }`}
                  style={
                    active
                      ? {
                          background: `linear-gradient(90deg, ${item.accent}1f, ${item.accent}0a)`,
                          boxShadow: `inset 0 0 0 1px ${item.accent}2e`,
                        }
                      : undefined
                  }
                >
                  {/* animated active indicator pill */}
                  {active && (
                    <motion.span
                      layoutId="sidebarActivePill"
                      className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-6 rounded-r-full"
                      style={{
                        background: item.accent,
                        boxShadow: `0 0 12px ${item.accent}aa`,
                      }}
                      transition={{ type: "spring", stiffness: 380, damping: 32 }}
                    />
                  )}

                  {/* icon */}
                  <span
                    className="flex items-center justify-center flex-shrink-0 transition-all duration-200 group-hover:scale-110"
                    style={{ color: active ? item.accent : undefined }}
                  >
                    {item.icon}
                  </span>

                  {/* label */}
                  {!isCollapsed && (
                    <span className="ml-3 text-[13px] font-medium tracking-wide truncate flex-1">
                      {item.name}
                    </span>
                  )}

                  {/* badge */}
                  {!isCollapsed && item.badge && (
                    <span
                      className="ml-auto font-mono text-[9px] px-1.5 py-0.5 rounded-md font-bold tracking-wider"
                      style={{
                        color: item.accent,
                        background: `${item.accent}1a`,
                        boxShadow: `inset 0 0 0 1px ${item.accent}38`,
                      }}
                    >
                      {item.badge}
                    </span>
                  )}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      {/* ---- Footer: user profile ----------------------------------------- */}
      <div className="w-full p-3 border-t border-[rgba(148,163,255,0.08)] mt-auto bg-[rgba(15,22,40,0.35)]">
        {!isCollapsed ? (
          <div className="space-y-2">
            <div className="flex items-center justify-between px-1 font-mono text-[10px] text-[#8b96b3]">
              <span className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                <span className="tracking-wider">v3.2.0</span>
              </span>
              <span className="tracking-widest uppercase">Proto Panel</span>
            </div>

            <div className="flex items-center justify-between p-2 rounded-xl bg-[rgba(15,22,40,0.7)] border border-[rgba(148,163,255,0.1)] hover:border-[rgba(148,163,255,0.22)] transition-colors">
              <Link to="/account" onClick={onClose} className="flex items-center gap-2.5 min-w-0 group">
                <div
                  className="w-8 h-8 rounded-lg flex items-center justify-center font-display font-bold text-xs text-white flex-shrink-0"
                  style={{
                    background: "linear-gradient(135deg,#2563eb,#22d3ee)",
                    boxShadow: "0 6px 16px -6px rgba(37,99,235,0.7)",
                  }}
                >
                  {user?.username?.[0]?.toUpperCase() || "U"}
                </div>
                <div className="truncate text-left">
                  <p className="text-xs font-semibold text-white truncate group-hover:text-[#93c5fd] transition-colors">
                    {user?.username || "User"}
                  </p>
                  <p className="font-mono text-[9px] text-[#8b96b3] uppercase tracking-widest truncate flex items-center gap-1">
                    {(user?.role === "owner" || user?.role === "admin") && (
                      <ShieldCheck size={9} className="text-emerald-400" />
                    )}
                    {user?.role || "user"}
                  </p>
                </div>
              </Link>

              <button
                onClick={logout}
                className="p-1.5 text-[#8b96b3] hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors flex-shrink-0"
                title="Logout"
              >
                <LogOut size={15} />
              </button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2">
            <Link
              to="/account"
              onClick={onClose}
              title={`${user?.username || "User"} · ${user?.role || "user"}`}
              className="w-8 h-8 rounded-lg flex items-center justify-center font-display font-bold text-xs text-white hover:scale-105 transition-transform"
              style={{ background: "linear-gradient(135deg,#2563eb,#22d3ee)" }}
            >
              {user?.username?.[0]?.toUpperCase() || "U"}
            </Link>
            <button
              onClick={logout}
              title="Logout"
              className="p-2 text-[#8b96b3] hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
            >
              <LogOut size={16} />
            </button>
          </div>
        )}
      </div>
    </aside>
  );
}
