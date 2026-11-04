// PROTO HOSTING BOT — entry point
// Wires Discord client + SQLite + Petro Panel + invite tracking + admin API.
import {
  Client,
  GatewayIntentBits,
  Partials,
  Events,
  ActivityType,
} from "discord.js";
import { loadConfig, validateConfig } from "./config.js";
import { createLogger } from "./logger.js";
import { openDatabase } from "./db.js";
import { PetroAPI } from "./services/petro.js";
import { InviteService } from "./services/invites.js";
import { makeDispatcher } from "./dispatcher.js";
import { startAdminApi } from "./api/server.js";

import helpCommand from "./commands/help.js";
import registerCommand from "./commands/register.js";
import deployCommand from "./commands/deploy.js";
import invitesCommand from "./commands/invites.js";
import { serversCommand, serverCommand } from "./commands/servers.js";
import adminCommand from "./commands/admin.js";

// ---------------------------------------------------------------- bootstrapping
const cfg = loadConfig();
const logger = createLogger(cfg);

if (!cfg.testMode) {
  const problems = validateConfig(cfg);
  for (const problem of problems) {
    logger.warn(`config: ${problem}`);
  }
  if (!cfg.token) {
    console.error(
      [
        "",
        "==========================================================",
        " PROTO HOSTING BOT — cannot start",
        "==========================================================",
        " DISCORD_BOT_TOKEN is missing.",
        "  1. copy discord-bot/.env.example to discord-bot/.env",
        "  2. fill in DISCORD_BOT_TOKEN, BOT_OWNER_IDS,",
        "     PETRO_PANEL_URL and PETRO_APP_KEY",
        "  3. start again:  npm start",
        "==========================================================",
        "",
      ].join("\n")
    );
    process.exit(1);
  }
}

const db = openDatabase(cfg.dbPath);
logger.info(`database ready at ${cfg.dbPath}`);

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers, // privileged — enable in the developer portal
    GatewayIntentBits.GuildInvites,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent, // privileged — enable in the developer portal
    GatewayIntentBits.DirectMessages,
  ],
  partials: [Partials.Channel, Partials.Message],
});

const petro = new PetroAPI(cfg.petro, logger);
const invites = new InviteService(db, client, logger);

const ctx = {
  cfg,
  db,
  client,
  logger,
  petro,
  invites,
  startedAt: Date.now(),
};

const registry = [
  helpCommand,
  registerCommand,
  deployCommand,
  invitesCommand,
  serversCommand,
  serverCommand,
  adminCommand,
];

const { dispatchMessage, dispatchInteraction } = makeDispatcher(registry);

// ---------------------------------------------------------------- events
client.on(Events.MessageCreate, (message) => dispatchMessage(ctx, message));
client.on(Events.InteractionCreate, (interaction) => dispatchInteraction(ctx, interaction));

client.on(Events.GuildMemberAdd, async (member) => {
  try {
    const inviterId = await invites.onMemberAdd(member);
    if (inviterId) logger.info(`join: ${member.user.tag} via invite of ${inviterId}`);
  } catch (err) {
    logger.error(`guildMemberAdd failed: ${err.message}`);
  }
});

client.on(Events.GuildMemberRemove, async (member) => {
  try {
    await invites.onMemberRemove(member);
  } catch (err) {
    logger.error(`guildMemberRemove failed: ${err.message}`);
  }
});

client.on(Events.InviteCreate, async (invite) => {
  try {
    await invites.snapshotGuild(invite.guild);
  } catch (err) {
    logger.error(`inviteCreate sync failed: ${err.message}`);
  }
});

client.on(Events.InviteDelete, async (invite) => {
  try {
    await invites.snapshotGuild(invite.guild);
  } catch (err) {
    logger.error(`inviteDelete sync failed: ${err.message}`);
  }
});

// ---------------------------------------------------------------- lifecycle
let reconcileTimer = null;

client.once(Events.ClientReady, async (c) => {
  logger.info(`logged in as ${c.user.tag} — serving ${c.guilds.cache.size} guild(s)`);
  c.user.setPresence({
    status: "online",
    activities: [{ name: "PROTO HOSTING · !help", type: ActivityType.Watching }],
  });
  try {
    const n = await invites.syncAll();
    logger.info(`invite snapshots refreshed for ${n} guild(s)`);
  } catch (err) {
    logger.error(`initial invite sync failed: ${err.message}`);
  }
  reconcileTimer = setInterval(
    () => {
      invites.reconcile().catch((err) => logger.error(`reconcile failed: ${err.message}`));
    },
    10 * 60 * 1000
  );
});

// admin API (panel integration)
let apiServer = null;
if (cfg.api.enabled) {
  apiServer = startAdminApi(ctx);
}

function shutdown(signal) {
  logger.info(`${signal} received — shutting down`);
  try {
    if (reconcileTimer) clearInterval(reconcileTimer);
    if (apiServer) apiServer.close();
    client.destroy();
  } catch {
    /* ignore */
  }
  try {
    db.close();
  } catch {
    /* ignore */
  }
  process.exit(0);
}
process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

process.on("unhandledRejection", (reason) => {
  logger.error(`unhandled rejection: ${reason?.stack || reason}`);
});

// test mode exports the wired context instead of logging in
if (cfg.testMode) {
  logger.info("PROTO_BOT_TEST=1 — test mode, Discord login skipped");
} else {
  client.login(cfg.token).catch((err) => {
    console.error(`login failed: ${err.message}`);
    console.error("Check DISCORD_BOT_TOKEN in discord-bot/.env");
    process.exit(1);
  });
}

export { ctx, registry, client, dispatchMessage, dispatchInteraction };
