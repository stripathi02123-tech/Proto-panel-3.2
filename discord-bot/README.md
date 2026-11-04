# 🤖 PROTO HOSTING — Discord Bot

Invite-rewarded **bot hosting** on top of a Petro / Pterodactyl panel.
Users register with `!register`, earn servers by bringing **real, verified
invites**, pick a plan with `!HYdeploy`, and manage their servers entirely
from Discord.

```
Node.js 22+ · discord.js v14 · SQLite (node:sqlite, zero native deps)
Petro / Pterodactyl Application API · local admin API for the panel UI
```

---

## ✨ Feature summary

| | Feature | How it works |
|---|---|---|
| 🔐 | **One account per Discord user** | `!register` creates (or links) a Petro Panel account. A second attempt replies **“account creation limit reached”**. Credentials are sent **via DM** — if DMs are closed the registration is rolled back. Only a **scrypt hash** of the password is stored, never plaintext. |
| 📦 | **Invite-gated deployments** | `!HYdeploy node.js` / `!HYdeploy python` (alias `!deploy`) shows **plan cards from SQLite**. The user picks a plan → the bot **verifies real invites** (joins attributed via invite snapshots, departures debited, bots excluded). Not enough → **“requirement not completed”**. Enough → the server is provisioned on Petro and the details DM'd. |
| 🖥️ | **Full server management** | `!servers` and `!server info\|start\|stop\|restart\|reinstall\|delete\|console <name>` — every action verifies **ownership**; destructive actions require an explicit confirmation. |
| 🎟️ | **Honest invite tracking** | `!invites` shows valid / total / pending / departed. Duplicate joins can't be credited twice, bots never count, deleted & vanity invites are re-synced, a reconciliation pass runs every 10 minutes. |
| 🛠️ | **Live-editable plans** | `!admin plans` — the server team creates / edits / deletes plans **without touching code or restarting** (also editable from the panel's Bot Hosting page). |
| 🧾 | **Audit log** | Every privileged or security-relevant action is written to `audit_logs` and surfaced in `!admin audit` and the panel UI. |
| 🔌 | **Panel integration** | A localhost admin API (key-protected) feeds the Proto Panel **Bot Hosting** admin page: users, plans, servers, deployments, audit, suspend, maintenance. |

---

## 🚀 Setup

```bash
cd discord-bot
cp .env.example .env     # then edit .env (see below)
npm install
npm start                # or: pm2 start ecosystem.config.cjs
```

**Privileged intents** — enable in the Discord Developer Portal → Bot:
`SERVER MEMBERS INTENT` and `MESSAGE CONTENT INTENT`. Invite tracking also
needs `MANAGE_GUILD` permissions in your server.

### Configuration (`.env`)

| Variable | Required | Description |
|---|:---:|---|
| `DISCORD_BOT_TOKEN` | ✅ | Bot token from the developer portal |
| `BOT_PREFIX` | – | Command prefix (default `!`) |
| `BOT_OWNER_IDS` | ✅ | Comma-separated Discord user IDs with `!admin` access |
| `PETRO_PANEL_URL` | ✅ | Base URL of your Petro / Pterodactyl panel |
| `PETRO_APP_KEY` | ✅ | **Application** API key (`ptla_…`) — server-side only, never shown to users |
| `PETRO_CLIENT_KEY` | – | Optional client key (`ptlc_…`) for power/console routes |
| `PETRO_LOCATION` | – | Location ID to deploy into (default `1`) |
| `PETRO_EGG_NODEJS` / `PETRO_EGG_PYTHON` | – | Egg IDs per runtime (defaults `5` / `6`) |
| `PETRO_IMAGE_NODEJS` / `PETRO_IMAGE_PYTHON` | – | Docker images (default pterodactyl yolks) |
| `PETRO_STARTUP_NODEJS` / `PETRO_STARTUP_PYTHON` | – | Startup commands (`{{STARTUP_FILE}}` substituted) |
| `PETRO_EGG_ENV_NODEJS` / `PETRO_EGG_ENV_PYTHON` | – | Extra egg environment JSON |
| `PETRO_EMAIL_DOMAIN` | – | Domain for generated account emails |
| `PETRO_SERVER_LIMIT_PER_USER` | – | Max hosted servers per user (default `2`) |
| `BOT_API_ENABLED` / `BOT_API_HOST` / `BOT_API_PORT` | – | Local admin API for the panel UI (default `127.0.0.1:6790`) |
| `BOT_API_SECRET` | ✅* | Shared secret — must match `BOT_API_SECRET` in the panel's `.env` |
| `BOT_DB_PATH` / `BOT_LOG_DIR` / `BOT_LOG_LEVEL` | – | Storage & logging (defaults `data/proto-hosting.db`, `logs/`) |

\* required only for the panel Bot Hosting page integration.

> **Security rules** — credentials only ever travel through environment
> variables; nothing sensitive is printed to Discord; passwords are stored
> exclusively as scrypt hashes; the admin API binds to localhost and requires
> the shared secret on every request.

---

## 📜 Command reference

### Everyone

| Command | Description |
|---|---|
| `!help` | Command overview with your registration status |
| `!register` | Create your PROTO HOSTING + Petro Panel account (once per Discord account) |
| `!invites` | Your invite score: valid · total · pending · departed |
| `!servers` | List your hosted servers with live status |
| `!server info <name>` | Full details of one server (plan, resources, panel id) |
| `!server start \| stop \| restart \| reinstall <name>` | Power actions (ownership verified) |
| `!server console <name> [N]` | Last N console lines from the panel |
| `!server delete <name>` | Delete a server — asks for confirmation first |
| `!HYdeploy node.js` / `!HYdeploy python` | Deploy flow: plan cards → invite verification → provisioning |

### Owner-only (`!admin`)

| Command | Description |
|---|---|
| `!admin` | Dashboard: users, servers, deploys, maintenance state |
| `!admin stats` | Extended statistics incl. invite tracking health |
| `!admin user <discord_id>` | Inspect a user (account, invites, servers) |
| `!admin suspend <discord_id> [reason]` | Suspend a user (blocks new deployments) |
| `!admin unsuspend <discord_id>` | Lift a suspension |
| `!admin plans` | List all plans with ids |
| `!admin plan create name:"Starter" runtime:node.js cpu:100 ram:1024 disk:4096 invites:3` | Create a plan live |
| `!admin plan edit <id> invites:2 available:false …` | Edit any field of a plan |
| `!admin plan delete <id>` | Delete a plan (existing servers keep running) |
| `!admin server <name>` | Inspect any hosted server |
| `!admin maintenance [on\|off] [message]` | Toggle maintenance mode (blocks deployments) |
| `!admin audit [N]` | Last N audit entries |
| `!admin sync` | Force an invite snapshot re-sync |

---

## 🗄️ Database (SQLite)

`migrations/001_init.sql` creates the full schema — applied automatically on
boot (WAL mode, foreign keys, busy timeout, transactional migrations):

`users` · `petro_accounts` · `invite_tracking` · `invite_joins` · `plans` ·
`servers` · `deployment_logs` · `audit_logs` · `settings`

Everything persists across restarts. The panel-side proxy never writes to
this database directly — it goes through the bot's validated admin API.

---

## 🧪 Tests

```bash
PROTO_BOT_TEST=1 node test/run-tests.js
```

88 tests cover: registration uniqueness (“account creation limit reached”),
DM rollback, plan CRUD + validation, invite join attribution & departure
debit, deployment gating (“requirement not completed”), server ownership,
suspend/unsuspend, maintenance mode, admin API auth (401 without key) and
the unconfigured-integration honesty paths.
