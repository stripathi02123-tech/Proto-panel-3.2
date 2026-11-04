// PROTO HOSTING BOT — permission helpers and shared gates

export function isBotOwner(cfg, discordId) {
  return cfg.ownerIds.includes(String(discordId));
}

/** Bot admin = env owner OR holder of the `admin` role in user_roles. */
export function isBotAdmin(ctx, discordId) {
  if (isBotOwner(ctx.cfg, discordId)) return true;
  const row = ctx.db
    .prepare(
      `SELECT 1 AS ok FROM user_roles ur
       JOIN roles r ON r.id = ur.role_id
       WHERE ur.user_discord_id = ? AND r.name = 'admin'`
    )
    .get(String(discordId));
  return Boolean(row);
}

export function getUserByDiscordId(db, discordId) {
  return db.prepare("SELECT * FROM users WHERE discord_id = ?").get(String(discordId));
}

export function getUserByAccountId(db, accountId) {
  return db.prepare("SELECT * FROM users WHERE account_id = ?").get(String(accountId));
}

export function isSuspended(user) {
  return Boolean(user && user.status !== "active");
}

export function getMaintenance(db) {
  const on = db.prepare("SELECT value FROM settings WHERE key = 'maintenance'").get();
  const msg = db.prepare("SELECT value FROM settings WHERE key = 'maintenance_message'").get();
  return {
    on: (on?.value || "off") === "on",
    message: msg?.value || "",
  };
}

export function setMaintenance(db, on, message = "") {
  db.prepare(
    `INSERT INTO settings (key, value) VALUES ('maintenance', ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`
  ).run(on ? "on" : "off");
  db.prepare(
    `INSERT INTO settings (key, value) VALUES ('maintenance_message', ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`
  ).run(message);
}

/** Append to the audit trail. */
export function audit(db, actorId, action, target, detail, actorName) {
  try {
    db.prepare(
      "INSERT INTO audit_logs (actor_discord_id, actor_name, action, target, detail) VALUES (?, ?, ?, ?, ?)"
    ).run(String(actorId ?? "system"), actorName ?? null, action, target ?? null, detail ?? null);
  } catch {
    /* auditing must never break a command */
  }
}

export function logDeployment(db, { discordId, serverId, serverName, runtime, planName, action, status, detail }) {
  db.prepare(
    `INSERT INTO deployment_logs (discord_id, server_id, server_name, runtime, plan_name, action, status, detail)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    String(discordId),
    serverId ?? null,
    serverName ?? null,
    runtime ?? null,
    planName ?? null,
    action,
    status,
    detail ?? null
  );
}

/**
 * Shared pre-command gate. Returns an embed payload to reply with, or null
 * when the command may proceed.
 */
export function commandGate(ctx, message, command) {
  // maintenance blocks everything except admin + help
  const m = getMaintenance(ctx.db);
  if (m.on && !command.bypassMaintenance && !isBotAdmin(ctx, message.author.id)) {
    return {
      embeds: [
        {
          title: "🛠️ Maintenance mode",
          description:
            (m.message || "The hosting platform is currently under maintenance. Please try again later.") +
            "\n\n*Follow our announcements for updates.*",
          color: 0xf59e0b,
        },
      ],
    };
  }
  if (command.requiresActive) {
    const user = getUserByDiscordId(ctx.db, message.author.id);
    if (!user) {
      return {
        embeds: [
          {
            title: "⛔ You are not registered",
            description:
              "You need a hosting account first.\nRun **`!register`** — it takes one command and creates your Petro Panel account.",
            color: 0xef4444,
          },
        ],
      };
    }
    if (isSuspended(user)) {
      return {
        embeds: [
          {
            title: "⛔ Account suspended",
            description:
              "Your hosting account is currently **suspended**. Contact a server administrator if you believe this is a mistake.",
            color: 0xef4444,
          },
        ],
      };
    }
  }
  return null;
}
