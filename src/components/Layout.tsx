import React, { useState, useEffect } from "react";
import { Sidebar } from "./Sidebar";
import { Menu, ChevronRight, Zap } from "lucide-react";
import { useLocation, matchPath, Link } from "react-router-dom";
import { useSettings } from "../context/SettingsContext";
import GlobalSearchModal from "./GlobalSearchModal";
import NotificationsDropdown from "./NotificationsDropdown";

export default function Layout({ children }: { children: React.ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const location = useLocation();
  const { panelName, panelLogo } = useSettings();

  const pName = panelName || 'PROTO PANEL';
  const nameParts = pName.split(' ');
  const firstWord = nameParts[0].toUpperCase();
  const restWords = nameParts.slice(1).join(' ').toUpperCase() || 'PANEL';

  useEffect(() => {
    const handleToggle = () => {
      if (window.innerWidth < 768) {
        setMobileOpen(prev => !prev);
      } else {
        setIsCollapsed(prev => !prev);
      }
    };
    window.addEventListener('toggle-sidebar', handleToggle);
    return () => window.removeEventListener('toggle-sidebar', handleToggle);
  }, []);

  const isServerView = matchPath("/servers/:id/*", location.pathname) && !matchPath("/servers/create", location.pathname);
  const isCreateServer = matchPath("/servers/create", location.pathname);
  const isAdminSettings = matchPath("/admin/settings", location.pathname);
  // pages that ship with their own padding + max-width
  const isSelfPadded =
    location.pathname === "/" ||
    matchPath("/servers", location.pathname) !== null ||
    matchPath("/monitoring", location.pathname) !== null ||
    matchPath("/activity", location.pathname) !== null ||
    matchPath("/admin/users", location.pathname) !== null ||
    matchPath("/backups", location.pathname) !== null;

  const getBreadcrumb = () => {
    const path = location.pathname;
    if (path === '/') return 'Overview';
    if (path === '/servers') return 'VPS Instances';
    if (path === '/servers/create') return 'Create VPS';
    if (path.startsWith('/servers/')) return 'Server Management';
    if (path === '/nodes') return 'Networking';
    if (path === '/monitoring') return 'Monitoring';
    if (path === '/activity') return 'Activity Logs';
    if (path === '/backups') return 'Backups';
    if (path === '/admin/servers') return 'Fleet';
    if (path === '/admin/users') return 'Users';
    if (path === '/account') return 'Settings';
    if (path === '/api-keys') return 'API Keys';
    if (path === '/admin/settings') return 'System Configuration';
    return '';
  };

  if (isServerView || isCreateServer || isAdminSettings) {
    return (
      <div className="flex h-[100dvh] w-full bg-transparent text-foreground font-sans overflow-hidden selection:bg-theme-600/30">
        <main className="flex-1 w-full h-full relative z-10 overflow-auto custom-scrollbar">
          {children}
        </main>
      </div>
    );
  }

  return (
    <div className={`flex h-[100dvh] w-full bg-transparent text-foreground font-sans overflow-hidden selection:bg-theme-600/30`}>
      {/* Mobile Sidebar Overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 bg-[rgba(2,4,10,0.7)] backdrop-blur-sm z-40 md:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Sidebar Container */}
      <div className={`fixed inset-y-0 left-0 z-50 transform flex-shrink-0 ${mobileOpen ? 'translate-x-0' : '-translate-x-full'} md:relative md:translate-x-0 transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]`}>
        <Sidebar onClose={() => setMobileOpen(false)} isCollapsed={isCollapsed} toggleCollapse={() => setIsCollapsed(!isCollapsed)} />
      </div>

      <div className="flex-1 flex flex-col min-w-0 h-full overflow-hidden relative bg-transparent">

        {/* Top bar */}
        <header className="sticky top-0 z-40 border-b border-[rgba(148,163,255,0.09)] bg-[rgba(7,11,24,0.75)] backdrop-blur-xl flex-shrink-0">
          <div className="px-4 sm:px-6 h-16 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <button
                onClick={() => window.dispatchEvent(new CustomEvent('toggle-sidebar'))}
                className="md:hidden p-2 -ml-2 text-[#8b96b3] hover:text-white hover:bg-[rgba(148,163,255,0.1)] rounded-lg transition-colors cursor-pointer flex items-center justify-center"
                title="Toggle sidebar"
                aria-label="Toggle sidebar"
              >
                <Menu className="w-5 h-5" />
              </button>

              {/* logo on mobile */}
              <div className="md:hidden">
                <Link to="/" className="flex items-center gap-2 group">
                  {panelLogo ? (
                    <img src={panelLogo} alt="Logo" className="w-7 h-7 object-contain" />
                  ) : (
                    <div
                      className="w-7 h-7 rounded-lg flex items-center justify-center"
                      style={{ background: "linear-gradient(135deg,#2563eb,#22d3ee)" }}
                    >
                      <Zap size={13} strokeWidth={2.5} className="text-white" />
                    </div>
                  )}
                  <span className="font-display font-bold text-sm tracking-wide uppercase text-white">
                    <span className="pp-gradient-text">{firstWord}</span> <span className="text-[#8b96b3] font-medium">{restWords}</span>
                  </span>
                </Link>
              </div>

              {/* breadcrumb on desktop */}
              <div className="hidden md:flex items-center gap-2 font-mono text-xs text-[#8b96b3]">
                <Link to="/" className="hover:text-white transition-colors">{firstWord}</Link>
                <ChevronRight className="w-3.5 h-3.5 text-[#4c5878]" />
                <span className="text-white font-semibold">{getBreadcrumb()}</span>
              </div>
            </div>

            <div className="flex items-center gap-2 sm:gap-3 ml-auto">
              {/* live system status badge */}
              <div className="hidden sm:flex items-center gap-2 font-mono text-[10px] tracking-wider px-3 py-1.5 rounded-full bg-emerald-500/10 shadow-[inset_0_0_0_1px_rgba(52,211,153,0.22),0_0_14px_-4px_rgba(52,211,153,0.25)]">
                <span className="relative flex w-1.5 h-1.5">
                  <span className="absolute inline-flex w-full h-full rounded-full bg-emerald-400 opacity-60 animate-ping" />
                  <span className="relative inline-flex w-1.5 h-1.5 rounded-full bg-emerald-400 shadow-[0_0_6px_#34d399]" />
                </span>
                <span className="font-semibold text-emerald-400">SYSTEM NOMINAL</span>
              </div>
              <GlobalSearchModal />
              <NotificationsDropdown />
            </div>
          </div>
        </header>

        {/* Main Content */}
        <main className={`flex-1 w-full h-full relative z-0 overflow-x-hidden overflow-y-auto custom-scrollbar`}>
          {isSelfPadded ? children : (
            <div className="p-4 sm:p-6 md:p-8 max-w-7xl mx-auto w-full">
              {children}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
