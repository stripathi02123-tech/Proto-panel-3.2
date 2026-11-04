# Proto Panel — Changelog

## v3.2.0 — Installation Wizard, PROTO HOSTING Bot & Vercel-grade UI

### 🧙 Prism Wizard — proto-install.sh v2.0.0 (full redesign)
- **OS-install-style full-screen wizard** (alternate screen buffer): header with brand + version + **live connection chips** (net / root / docker / node / mode), a **9-stage checklist** with real state icons and per-stage durations, a **blue→cyan→purple gradient progress line** with a glowing tip, a status line (spinner · stage · label · elapsed), a **terminal-style live log pane** streaming real command output with timestamps, and a footer with percent · stage · elapsed.
- **Real progress, never premature 100 %**: the bar is derived exclusively from stage/sub-stage completion (checks passed, commands exited 0, polls answered). 100 % is reachable only after stage 8 verified the live `/api/health` **and a real owner login test (JWT issued)**.
- **9 stages**: system requirements → dependencies → environment → data store → backend → frontend build → services → final verification → complete. Data-store stage validates existing JSON stores and backs up corrupted ones to `.data/corrupt-backup/`.
- **Honest failure screen**: the real error, the failed stage (marked ✖ in the checklist), live diagnostics (disk/node/docker/mode), last 15 log lines and safe-retry instructions (stages are idempotent).
- **Graceful fallbacks**: non-TTY / CI / tiny terminals get a clean flowing mode (`--no-wizard` forces it); terminal resizes are detected and re-laid-out; `--demo` now includes a clearly-labelled wizard preview.
- **Bug fixes over v1.0.1**: `run_fx_live` used tee's exit status instead of the command's (PIPESTATUS); the log file silently split across directories after the installer `cd`'d into the source (log path is now absolute); health-check timeout message exaggerated the wait time.
- **Verified end-to-end on a live machine**: zip → unpack → npm install (streamed) → esbuild → vite → pm2 start → health check (`panel v3.2.0 answers`) → **owner login verified (JWT)** → success screen with live version, pid and credentials — 33 seconds, exit 0.

### 🤖 PROTO HOSTING — Discord bot hosting platform (new `discord-bot/`)
- **`!register`**: one account per Discord account (unique constraint) — creates or links a **Petro Panel** account, DMs credentials (**scrypt-hashed** storage, rollback when DMs are closed), repeats answered with **“account creation limit reached”**.
- **`!HYdeploy node.js|python`** (alias `!deploy`): interactive **plan cards from SQLite** → plan selection → **real invite verification** (insufficient → **“requirement not completed”**) → Petro provisioning (egg, docker image, startup, resource limits) → server details DM'd.
- **Server management from Discord**: `!servers`, `!server info|start|stop|restart|reinstall|delete|console` — ownership verified on every action, destructive actions need confirmation.
- **`!invites`**: valid / total / pending / departed with snapshot-based join attribution, departure debits, bot exclusion, deleted/vanity invite handling and 10-minute reconciliation.
- **Owner-only `!admin`**: dashboard, `stats`, `user`, `suspend`/`unsuspend`, **live-editable plans** (`plan create|edit|delete` — no code changes, no restart), `server`, `maintenance`, `audit`, `sync`.
- **SQLite** (`node:sqlite`, zero native deps): WAL, foreign keys, transactional migrations, 9 tables incl. `plans`, `petro_accounts`, `invite_tracking`, `deployment_logs`, `audit_logs`.
- **Panel integration**: local key-protected admin API (default `127.0.0.1:6790`) + admin-only proxy route → the new **Bot Hosting** page in the panel manages users, plans, servers, deployments and audit logs with full RBAC.
- **88 automated tests** (`PROTO_BOT_TEST=1 node test/run-tests.js`) — registration uniqueness, invite gating, plan CRUD, ownership, maintenance, API auth, unconfigured-integration honesty.

### 🎨 Panel UI — Vercel-grade redesign
- **Design system**: deep-midnight background, dark-navy surfaces, electric-blue→cyan→purple gradients, glassmorphism cards with gradient borders that light up on hover, ambient glow — all as CSS variables, never over-neon.
- **Dashboard**: real-data stat cards (VPS total/running/stopped, RAM/storage allocation) with animated counters, live CPU/RAM/network charts (recharts), gauge, activity timeline and recent operations — **all from the real backend, no fake numbers**, with skeletons while loading.
- **Grouped collapsible sidebar** (Main / Management / System / Administration) filtered by role and backend support, Lucide icons, mobile-responsive with animation.
- **VPS cards** redesigned with name/OS/status/CPU/RAM/disk/IP and Start/Stop/Restart/Shutdown/Reinstall/Delete/Console/Details actions; destructive actions ask for confirmation.
- Framer Motion page transitions, hover lifts, skeleton loaders — **all respecting `prefers-reduced-motion`**.
- **Only the pre-login intro animation was removed**; the post-login explainer/tutorial overlay is untouched (and admin-toggleable).

### 🔒 Security — node administration lockdown (highest priority)
- **Node management is admin-only at the API layer**: every `/api/nodes` route is behind `requireAuth` + `requireNodeAdmin` — ordinary users receive **403** even when calling the API directly; every denied attempt is written to the **audit log** with identity, role and IP.
- Frontend: nodes (and all other admin surfaces) are wrapped in `AdminRoute` and hidden from the sidebar for non-admins — the backend remains the enforcement point.
- Bot-hosting proxy route applies the same 403 + audit pattern.

### 🧰 Other fixes & improvements
- `.env.example` documents the bot integration variables (`BOT_API_URL`, `BOT_API_SECRET`).
- New `discord-bot/README.md` (full command & configuration reference) and an expanded root README (wizard + bot sections).
- Legacy installer preserved at `works/proto-install-v1.0.1.sh` for reference.

## v3.1.0 — Branding, Admin Customization & Deep Security Audit

### New Features
- **Default panel identity**: the Proto logo (isometric "P" arrow) now ships with the panel and shows in the sidebar, header, login screen and browser favicon until replaced.
- **Logo editing** (admin → Branding): upload/crop a custom logo (ImageCropper), one-click remove restores the default.
- **Panel info editing** (admin → Branding): new "Panel Info / Description" field (300 chars) shown live on the login card.
- **Animated README** with wave header, typing animation, badges and tech icons.
- **`.github/` suite**: CI workflow (typecheck + build + boot smoke test + Docker image build, Node 20/22), bug/feature issue templates, PR template and Dependabot config.

### Critical Security Fixes (deep bug audit — 29 issues triaged)
- **JWT secret**: removed the forgeable hardcoded fallback `"proto-panel-super-secret"`; a strong random secret is now auto-generated and persisted in `.data/.jwt-secret` when `JWT_SECRET` is unset.
- **Dev-mode auto-login**: no longer active when `NODE_ENV` is merely unset — requires the real dev panel (NODE_ENV=development + PORT=3000) or `PROTO_DEV_LOGIN=true`. Previously any unknown username got an admin/owner account on a default install.
- **Google login**: removed username-prefix matching that allowed logging in as an existing admin; collision-safe usernames on first registration.
- **Upload path traversal**: `originalname` is now `basename()`-ed and confined to the server directory.
- **Zip-slip & shell injection in extraction**: tar/unzip/python3 now run via `execFile` (no shell); zip entries are pre-scanned and `..` escapes rejected; safe `extract-zip` tried first.
- **World endpoints**: added per-server authorization (was: ANY user could read/replace ANY server's world) + zipPath traversal guards.
- **restoreBackup**: `basename()` on the filename, real server object for the running-check (previously always "not running" — a live server's dir could be wiped), and whitelisted config-snapshot fields.
- **Docker image injection**: `dockerImage`/`startupCommand` are admin-only and the image name must match a strict charset; `docker pull` uses `execFile`.
- **SSRF**: plugin/mod downloads restricted to an allowlist of known distribution hosts.
- **API keys of deleted users** no longer authenticate as admin (was: 401-bypass with elevated role).
- **Socket.IO rooms**: `joinServer` now enforces server ownership/sub-user/admin; the `/:id/logs` endpoint too.
- **Stale admin roles**: role changes take effect immediately (DB role re-checked on every request).
- **User enumeration**: `/api/auth/users` is now admin-only.

### High-Priority Bug Fixes
- **Boot error fixed**: `getDocker is not a function` — the module-scope health check ran before `getDocker` was initialized; it now runs after all definitions.
- **Custom nodes**: node API now writes to `nodes.json` (normalized `ip/port/key`), and `getDocker()` consults both node stores instead of silently falling back to the local daemon.
- **Remote-node consoles**: `nodeId` is now passed to log fetch/attach everywhere (server.ts, routes).
- **Console output**: lazily-attached command streams now emit to the real `server_<id>` room (was: lost until HTTP poll).
- **Settings live-reload & update overlay**: frontend read the wrong localStorage key (`token` vs `proto_token`) — both fixed.
- **JSON store**: atomic temp-file+rename writes with per-file serialization (no more corrupted `users.json`/`servers.json`, no revoked-key resurrection).
- **Request limits**: 50 GB JSON body limit reduced to 25 MB; multer uploads capped at 2 GB.
- **Resource leaks**: local-runtime log streams are closed on exit; Docker attach streams destroyed on container delete.
- **RCON**: random per-server password instead of `admin`, kept in sync between `server.properties` and container env.
- **SFTP port**: API now reports the actual listening port (6868 prod / 6869 dev).
- **crash.log**: appended with timestamps; process exits after uncaught exceptions.
- **Playit endpoints**: unknown server ids now 404 instead of feeding raw ids into shell commands.
- **package.json**: removed nonexistent `main: inspect_docker.js` and the deprecated `crypto` stub dependency.

## v3.0.0 Release (Master Production Update)
- **Version Upgrade to v3.0.0**:
  - Full project upgrade across `package.json`, `update.sh`, `generate_scripts.py`, backend routes (`/api/health`, `/api/settings`, `/api/system/version`), and frontend dashboards.
- **Docker Container Runtime & Lifecycle Hardening**:
  - Solved `ECONNREFUSED` / `EACCES` socket connection errors with active socket self-repair and permissions handling.
  - Eliminated premature Sandbox fallback on Linux systems when the Docker daemon is accessible.
  - Refactored container creation, start, stop, kill, restart, status, stats, and logs methods in `src/server/services/docker.ts` to seamlessly handle both real Docker containers and local simulation fallbacks.
  - Added host data directory path resolution (`resolveHostDataDir`) for Docker-in-Docker / volume mapping on production hosts.
- **Uninstaller & Cleanup Enhancements**:
  - Added comprehensive `delete_proto_directory` routine in `uninstall.sh` and `generate_scripts.py` to recursively and cleanly remove the `Proto` working directory upon panel uninstallation.
- **System Update Automation**:
  - Updated `update.sh` with seamless v3.0.0 migration logic and pre-update status validation.

## Session Changes & Master Stability Audit

### 1. Role Hierarchy & Authorization Fixes
- **Frontend API Keys Access (`src/pages/ApiKeysPage.tsx`)**:
  - Fixed permission gate from `user?.role !== "admin"` to `user?.role !== "admin" && user?.role !== "owner"`.
  - Owners now have full access to view, create, and revoke API keys.
- **Frontend User Management in Account Page (`src/pages/AccountPage.tsx`)**:
  - Fixed `fetchUsers` condition from `if (user.role !== "admin")` to `if (user.role !== "admin" && user.role !== "owner")`.
  - Updated default admin account checks from username-based comparison (`user.username === "admin"`) to immutable ID check (`user.id === "temp-admin"`), ensuring owners named "admin" are not blocked from updating their passwords.
- **Admin Controls Component (`src/components/AdminControls.tsx`)**:
  - Added visual Owner badge with gold shield (`Shield` icon with `text-amber-500`).
  - Allowed Owners to manage roles, reset passwords, and delete users regardless of their username (protecting only the fallback `temp-admin` ID).
  - Maintained strict RBAC: Admins cannot change roles or delete other admins or the owner.
- **Admin Settings Page (`src/pages/AdminSettingsPage.tsx`)**:
  - Explicitly grouped access condition `!user || (user.role !== "admin" && user.role !== "owner")`.
- **Sub-users & SFTP Route Authorization (`src/server/routes/servers.ts`)**:
  - Added authorization guards across subuser endpoints (`GET`, `POST`, `DELETE`) and SFTP endpoints (`GET`, `POST /create`, `POST /reset-password`, `DELETE`).
  - Ensured Owners and Admins have administrative oversight on all server subusers and SFTP configurations, while normal users can only manage their own servers.
- **Plugin & Mod Installation Endpoints (`src/server/controllers/servers.ts`)**:
  - Added server ownership checks on `installPlugin` and `installMod` allowing Owners and Admins to manage any server, and regular users only their assigned servers.
- **Initial Dev Login Role Assignment (`src/server/controllers/auth.ts`)**:
  - Updated auto-creation logic in dev mode to assign `role: "owner"` to the initial user if no owner exists in `users.json`, ensuring immediate administrative authority.
  - Promoted existing single dev user in `.data/users.json` to `"owner"`.

### 2. Works System Implementation
- Created `/works/README.md` with complete architectural documentation, port usage rules, role hierarchy matrix, runtime switching guard, and installer instructions.
- Created `/works/CHANGELOG.md` tracking all changes.
- Added comprehensive verification test suite in `/works/tests/`:
  - `owner_permissions.test.ts`
  - `admin_permissions.test.ts`
  - `user_permissions.test.ts`
  - `runtime_management.test.ts`
  - `port_isolation.test.ts`
