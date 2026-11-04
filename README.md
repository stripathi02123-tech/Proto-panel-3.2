<div align="center">

<img src="public/logo.png" alt="Proto Panel logo" width="140" />

# ⚡ Proto Panel

<!-- Animated header wave -->
<img src="https://capsule-render.vercel.app/api?type=waving&color=0:2563eb,50:3b82f6,100:60a5fa&height=180&section=header&text=Proto%20Panel&fontSize=60&fontColor=ffffff&animation=fadeIn&fontAlignY=32&desc=Game%20Server%20Management%2C%20Reimagined.&descAlignY=55&descSize=18" width="100%" />

<!-- Animated typing text -->
<a href="https://github.com/JishnuTheGamer/Jtg">
  <img src="https://readme-typing-svg.demolab.com?font=Fira+Code&weight=600&size=22&duration=3000&pause=1000&color=3B82F6&center=true&vCenter=true&multiline=true&repeat=true&width=700&height=90&lines=%F0%9F%9A%80+Deploy+Minecraft+servers+in+seconds;%F0%9F%90%B3+Docker+%2B+Local+runtimes;%F0%9F%94%8C+Live+console+%2B+SFTP+%2B+File+Manager;%F0%9F%A7%A9+Modrinth+plugins+%26+mods+built-in" alt="Typing animation" />
</a>

<!-- Badges -->
<p>
  <img src="https://img.shields.io/badge/version-3.2.0-blue?style=for-the-badge&logo=semanticrelease&logoColor=white" alt="version" />
  <img src="https://img.shields.io/badge/node-22%2B-339933?style=for-the-badge&logo=nodedotjs&logoColor=white" alt="node" />
  <img src="https://img.shields.io/badge/react-19-61DAFB?style=for-the-badge&logo=react&logoColor=black" alt="react" />
  <img src="https://img.shields.io/badge/typescript-5.8-3178C6?style=for-the-badge&logo=typescript&logoColor=white" alt="typescript" />
  <img src="https://img.shields.io/badge/docker-powered-2496ED?style=for-the-badge&logo=docker&logoColor=white" alt="docker" />
</p>
<p>
  <img src="https://img.shields.io/badge/license-ISC-green?style=flat-square" alt="license" />
  <img src="https://img.shields.io/badge/platform-linux%20%7C%20macos%20%7C%20windows-blueviolet?style=flat-square" alt="platform" />
  <img src="https://img.shields.io/badge/runtimes-docker%20%7C%20local%20java%20%7C%20wings-orange?style=flat-square" alt="runtimes" />
  <img src="https://img.shields.io/badge/security-hardened-brightgreen?style=flat-square" alt="security" />
</p>

**A modern, self-hosted game server management panel** — Minecraft, Node.js and Python servers with a real-time console, drag-and-drop file manager, one-click plugin installs, SFTP access, sub-users, playit.gg tunnels and multi-node support.

<br />

<img src="https://capsule-render.vercel.app/api?type=rect&color=gradient&height=3&section=divider" width="80%" />

</div>

## ✨ Features

| | Feature | Details |
|---|---|---|
| 🎮 | **Game server hosting** | Minecraft (Paper, Purpur, Spigot, Fabric, NeoForge, Vanilla…), Node.js & Python apps |
| 🐳 | **Multiple runtimes** | Docker containers, local Java processes or remote Wings-style nodes |
| 🖥️ | **Live console** | Real-time logs over Socket.IO with command input & history |
| 📂 | **File manager** | Upload, edit, rename, zip/unzip, permissions — with chunked large-file upload |
| 🧩 | **Mod & plugin manager** | One-click installs from Modrinth / Spiget with version browser |
| 🌍 | **World manager** | Import, analyze, backup & swap worlds with automatic safety backups |
| 💾 | **Backups** | Scheduled & manual snapshots with one-click restore |
| 👥 | **Users & sub-users** | Owner / admin / user roles, per-server sub-user permissions, API keys |
| 🔗 | **playit.gg tunnels** | Expose local servers to the internet without port forwarding |
| 🎨 | **Full branding control** | Edit panel name, info text, logo, login background & theme from the admin UI |
| 🤖 | **PROTO HOSTING bot** | Discord bot with `!register` (one account per Discord user), invite-gated `!HYdeploy`, Petro Panel provisioning, in-chat server management |
| 🧙 | **Installation wizard** | Full-screen OS-install-style installer: 9 real stages, live streamed logs, progress that never lies |
| 🔐 | **Hardened security** | Random JWT secrets, path-traversal & injection protection, SSRF allowlists, atomic DB writes, admin-only node management (403 + audit) |
| 🌙 | **Modern UI** | Dark theme, responsive layout, animated login, framer-motion everywhere |

<div align="center">

<img src="https://skillicons.dev/icons?i=react,ts,tailwind,nodejs,express,docker,socketio,vite,sqlite&perline=9" alt="Tech stack" width="70%" />

</div>

## 🚀 Quick Start

```bash
# 🧙 PRISM WIZARD — a full-screen OS-install-style installation wizard
#    9 real stages · live streamed logs · progress that never lies
bash proto-install.sh
```

The wizard shows a **header with live connection status** (root / docker / node /
mode), a **9-stage checklist** (system requirements → dependencies → environment →
data store → backend → frontend build → services → final verification → complete),
a **blue→cyan→purple gradient progress line** that only advances on events that
really happened, and a **terminal-style live log** streaming real command output
with timestamps. It reaches 100 % exclusively after the final verification passed
the live `/api/health` check **and** a real owner login (JWT) test. If anything
fails you get the real error, the failed stage, live diagnostics and safe-retry
instructions.

```bash
bash proto-install.sh --demo          # preview the wizard + all installer FX
bash proto-install.sh --dry-run       # rehearse the full pipeline, change nothing
bash proto-install.sh --mode=node     # force Node.js + PM2 deployment
bash proto-install.sh --update        # update an existing installation
bash proto-install.sh --no-wizard     # plain flowing output (CI / small terms)
bash proto-install.sh Proto-Panel.zip # install straight from a local zip archive
```

Prefer a classic interactive menu? The management console handles
**install, update, create admin users, restart or uninstall**:

```bash
bash install.sh
```

<details>
<summary><b>📦 Manual installation</b></summary>

```bash
git clone https://github.com/JishnuTheGamer/Jtg.git Proto
cd Proto
npm install
npm run build
npm run createuser   # create the first admin/owner account
npm run start        # panel on http://<your-ip>:6767
```

Development mode (hot reload, port 3000):

```bash
npm run dev
```
</details>

<details>
<summary><b>🐳 Docker Compose</b></summary>

```bash
docker compose up -d
# Main panel  -> http://<ip>:6767
# Dev panel   -> http://<ip>:3000
```
</details>

| Panel | Port | Purpose |
|:---:|:---:|---|
| 🏭 Main | **6767** | Production panel |
| 🛠️ Dev | **3000** | Development / admin builds |
| 📡 SFTP | **6868** (prod) / **6869** (dev) | Per-server SFTP access |

## 🤖 PROTO HOSTING — Discord Bot Hosting

The bundled **PROTO HOSTING bot** (`discord-bot/`) turns your panel into an
invite-rewarded bot hosting platform on top of a Petro / Pterodactyl panel:

| Command | What it does |
|---|---|
| `!register` | Creates a **Petro Panel account** for you (one per Discord account — repeats reply *“account creation limit reached”*). Credentials are DM'd; only a **scrypt hash** is stored. |
| `!HYdeploy node.js` / `!HYdeploy python` | Shows **plan cards from SQLite** → you pick a plan → the bot **verifies your real invites** → *“requirement not completed”* or provisions the server on Petro and DMs the details. |
| `!servers` / `!server info\|start\|stop\|restart\|reinstall\|delete\|console <name>` | Manage **your** hosted servers from Discord (ownership verified, destructive actions need confirmation). |
| `!invites` | Your invite score: valid / total / pending / departed — joins credited via invite snapshots, departures debited, bots excluded. |
| `!admin …` | **Owner-only**: `plan create\|edit\|delete`, `user`, `suspend`, `server`, `stats`, `maintenance` — plans editable live, no code changes. |

```bash
cd discord-bot
cp .env.example .env    # fill in DISCORD_BOT_TOKEN, PETRO_* , BOT_OWNER_IDS
npm install
npm start               # or: pm2 start ecosystem.config.cjs
```

The panel's **Bot Hosting** admin page (admin-only, 403 otherwise) proxies the
bot's local API — manage users, plans, servers, deployments and audit logs from
the web UI. See `discord-bot/README.md` for the full command & configuration
reference, and `node test/run-tests.js` for the 88-test suite.

## ⚙️ Environment Variables

| Variable | Default | Description |
|---|---|---|
| `PORT` | `6767` | HTTP port of the panel |
| `JWT_SECRET` | auto-generated | Sign your sessions — set this for multi-instance deployments |
| `ENABLE_DOCKER` | `true` | Set `false` to force local runtime |
| `DOCKER_SOCKET_PATH` | auto | Custom Docker socket path |
| `PROTO_HOST_DATA_PATH` | auto | Host path for server data (Docker bind mounts) |
| `PROTO_OWNER_USER` / `PROTO_OWNER_PASS` | – | Auto-provision the owner account at boot |
| `PROTO_DEV_LOGIN` | `false` | Set `true` ONLY for local development (auto-login) |
| `GEMINI_API_KEY` | – | Optional server-side Gemini AI features |

## 🏗️ Architecture

```
┌──────────────────────────────────────────────────┐
│                  React 19 SPA                     │
│   (Vite · Tailwind 4 · framer-motion · recharts)  │
└───────────────────────┬──────────────────────────┘
                        │ REST + Socket.IO
┌───────────────────────▼──────────────────────────┐
│            Express 4 API (server.ts)              │
│  auth · servers · system · nodes · api-keys      │
├──────────────────────────────────────────────────┤
│                 Runtime layer                     │
│   dockerode ── ssh2 ── local Java ── SFTP server  │
└───────────────────────┬──────────────────────────┘
                        │
        ┌───────────────┼────────────────┐
        ▼               ▼                ▼
   🐳 Docker       📁 .data/ JSON     🌐 Remote nodes
   containers      (users/servers)    (wings agents)
```

## 🛡️ Security

Proto Panel ships with a hardened backend: randomized RCON passwords, SSRF-protected downloads, zip-slip-safe extraction, per-server authorization on every socket room, atomic JSON database writes and shell-injection-proof command execution. Found something suspicious? Please open a security advisory instead of a public issue.

## 🤝 Contributing

```bash
git checkout -b feature/my-feature
npm run lint   # tsc --noEmit
```

Bug reports and feature requests are welcome — see the issue templates.

<div align="center">

<img src="https://capsule-render.vercel.app/api?type=waving&color=0:60a5fa,50:3b82f6,100:2563eb&height=120&section=footer" width="100%" />

**Proto Panel** · built with ⚡ and far too much ☕

<a href="https://github.com/JishnuTheGamer/Jtg">⬆ Back to top</a>

</div>
