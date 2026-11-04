-- ============================================================================
-- PROTO HOSTING BOT — schema v1
-- SQLite (node:sqlite / better-sqlite3 compatible)
-- All hosting state lives here: users, petro account links, invite tracking,
-- plans (editable by admins — never hardcoded in bot code), servers,
-- deployment/audit logs, settings and the RBAC tables.
-- ============================================================================

CREATE TABLE IF NOT EXISTS users (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  discord_id        TEXT    NOT NULL UNIQUE,             -- one account per Discord user
  account_id        TEXT    NOT NULL UNIQUE,             -- public id (PROTO-XXXXXX)
  username          TEXT    NOT NULL,                    -- panel username
  email             TEXT    NOT NULL UNIQUE,             -- panel email
  password_hash     TEXT    NOT NULL,                    -- scrypt$N$salt$hash (never plaintext)
  status            TEXT    NOT NULL DEFAULT 'active'
                    CHECK (status IN ('active','suspended','banned')),
  registered_via    TEXT,                                -- guild id of registration
  created_at        TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at        TEXT    NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_users_discord ON users(discord_id);

CREATE TABLE IF NOT EXISTS petro_accounts (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id           INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  petro_user_id     INTEGER NOT NULL,
  email             TEXT    NOT NULL,
  external_id       TEXT,                                -- discord id stored on the panel
  existed           INTEGER NOT NULL DEFAULT 0,          -- 1 = linked pre-existing panel account
  synced_at         TEXT    NOT NULL DEFAULT (datetime('now')),
  created_at        TEXT    NOT NULL DEFAULT (datetime('now')),
  UNIQUE(user_id),
  UNIQUE(petro_user_id)
);

CREATE TABLE IF NOT EXISTS plans (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  name              TEXT    NOT NULL,
  runtime           TEXT    NOT NULL CHECK (runtime IN ('node.js','python')),
  cpu               INTEGER NOT NULL,                    -- % (100 = 1 core)
  memory            INTEGER NOT NULL,                    -- MiB
  disk              INTEGER NOT NULL,                    -- MiB
  required_invites  INTEGER NOT NULL DEFAULT 0,          -- valid invites needed to deploy
  available         INTEGER NOT NULL DEFAULT 1,          -- 0 = hidden from !HYdeploy
  description       TEXT    NOT NULL DEFAULT '',
  sort_order        INTEGER NOT NULL DEFAULT 100,
  created_at        TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at        TEXT    NOT NULL DEFAULT (datetime('now')),
  UNIQUE(name, runtime)
);

CREATE TABLE IF NOT EXISTS servers (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  owner_discord_id  TEXT    NOT NULL,
  name              TEXT    NOT NULL,
  plan_id           INTEGER REFERENCES plans(id) ON DELETE SET NULL,
  plan_name         TEXT    NOT NULL DEFAULT '',
  runtime           TEXT    NOT NULL,
  petro_server_id   INTEGER,                             -- numeric panel id
  petro_uuid        TEXT,                                -- short identifier used by client API
  status            TEXT    NOT NULL DEFAULT 'unknown',
  created_at        TEXT    NOT NULL DEFAULT (datetime('now')),
  deleted_at        TEXT
);
CREATE INDEX IF NOT EXISTS idx_servers_owner ON servers(owner_discord_id);

CREATE TABLE IF NOT EXISTS invite_tracking (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id          TEXT    NOT NULL,
  code              TEXT    NOT NULL,
  inviter_discord_id TEXT,
  uses              INTEGER NOT NULL DEFAULT 0,          -- last seen uses on the panel
  max_uses          INTEGER,
  status            TEXT    NOT NULL DEFAULT 'active'    -- active/revoked
                    CHECK (status IN ('active','revoked')),
  created_at        TEXT,
  last_seen_at      TEXT    NOT NULL DEFAULT (datetime('now')),
  UNIQUE(guild_id, code)
);
CREATE INDEX IF NOT EXISTS idx_invites_inviter ON invite_tracking(inviter_discord_id);

CREATE TABLE IF NOT EXISTS invite_joins (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id          TEXT    NOT NULL,
  code              TEXT,
  member_discord_id TEXT    NOT NULL,
  inviter_discord_id TEXT,
  is_bot            INTEGER NOT NULL DEFAULT 0,
  credited          INTEGER NOT NULL DEFAULT 1,
  joined_at         TEXT    NOT NULL DEFAULT (datetime('now')),
  left_at           TEXT
);
CREATE INDEX IF NOT EXISTS idx_joins_member ON invite_joins(member_discord_id);
CREATE INDEX IF NOT EXISTS idx_joins_inviter ON invite_joins(inviter_discord_id);

CREATE TABLE IF NOT EXISTS deployment_logs (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  discord_id        TEXT    NOT NULL,
  server_id         INTEGER REFERENCES servers(id) ON DELETE SET NULL,
  server_name       TEXT,
  runtime           TEXT,
  plan_name         TEXT,
  action            TEXT    NOT NULL,                    -- deploy/delete/reinstall/...
  status            TEXT    NOT NULL CHECK (status IN ('success','failed')),
  detail            TEXT,
  created_at        TEXT    NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_deplogs_discord ON deployment_logs(discord_id);

CREATE TABLE IF NOT EXISTS audit_logs (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  actor_discord_id  TEXT,
  actor_name        TEXT,
  action            TEXT    NOT NULL,
  target            TEXT,
  detail            TEXT,
  created_at        TEXT    NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_logs(created_at);

CREATE TABLE IF NOT EXISTS settings (
  key               TEXT PRIMARY KEY,
  value             TEXT
);

CREATE TABLE IF NOT EXISTS roles (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  name              TEXT    NOT NULL UNIQUE,
  description       TEXT
);

CREATE TABLE IF NOT EXISTS permissions (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  role_id           INTEGER NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  permission        TEXT    NOT NULL,
  UNIQUE(role_id, permission)
);

CREATE TABLE IF NOT EXISTS user_roles (
  user_discord_id   TEXT    NOT NULL,
  role_id           INTEGER NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  granted_by        TEXT,
  granted_at        TEXT    NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (user_discord_id, role_id)
);

-- ---------------------------------------------------------------------------
-- Seeds (idempotent). Plans live in the DATABASE so admins can edit them
-- with !admin plan create|edit|delete without touching code.
-- ---------------------------------------------------------------------------
INSERT OR IGNORE INTO roles (id, name, description) VALUES
  (1, 'admin',     'Bot administrators — manage plans, users, servers, maintenance'),
  (2, 'moderator', 'Moderators — view stats and audit logs');

INSERT OR IGNORE INTO permissions (role_id, permission) VALUES
  (1, 'manage_plans'), (1, 'manage_users'), (1, 'manage_servers'),
  (1, 'view_stats'), (1, 'view_audit'), (1, 'maintenance'),
  (2, 'view_stats'), (2, 'view_audit');

INSERT OR IGNORE INTO settings (key, value) VALUES
  ('maintenance', 'off'),
  ('maintenance_message', '');

INSERT OR IGNORE INTO plans (name, runtime, cpu, memory, disk, required_invites, available, description, sort_order) VALUES
  ('Micro',   'node.js',  50,  512,  1024, 1, 1, 'Entry tier — needs 1 valid invite', 10),
  ('Starter', 'node.js', 100, 1024,  4096, 3, 1, 'Most popular tier', 20),
  ('Pro',     'node.js', 200, 2048, 10240, 6, 1, 'Power tier for busy bots', 30),
  ('Micro',   'python',   50,  512,  1024, 1, 1, 'Entry tier — needs 1 valid invite', 10),
  ('Starter', 'python',  100, 1024,  4096, 3, 1, 'Most popular tier', 20),
  ('Pro',     'python',  200, 2048, 10240, 6, 1, 'Power tier for busy bots', 30);
