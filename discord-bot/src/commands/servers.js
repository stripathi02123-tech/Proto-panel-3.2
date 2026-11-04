// PROTO HOSTING BOT — !servers and !server <action> <name>
// Every operation verifies OWNERSHIP first (anti-IDOR): users can only ever
// touch their own servers, even when guessing names or ids.
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
} from "discord.js";
import { brandEmbed, errorEmbed, warnEmbed, successEmbed, serverCard, COLORS } from "../embeds.js";
import { consoleSession } from "../services/console.js";
import { logDeployment, audit } from "../permissions.js";

export function delId(uid, sid) {
  return `srv:del:${uid}:${sid}`;
}
export function reiId(uid, sid) {
  return `srv:rei:${uid}:${sid}`;
}
export function cancelId(uid) {
  return `srv:stop:${uid}`;
}

const ACTIONS = ["info", "start", "stop", "restart", "reinstall", "delete", "console", "command"];

function findOwnServer(db, discordId, query) {
  const q = String(query || "").trim();
  if (!q) return null;
  if (q.startsWith("#")) {
    return db
      .prepare("SELECT * FROM servers WHERE owner_discord_id = ? AND deleted_at IS NULL AND id = ?")
      .get(String(discordId), parseInt(q.slice(1), 10) || 0);
  }
  return db
    .prepare(
      "SELECT * FROM servers WHERE owner_discord_id = ? AND deleted_at IS NULL AND LOWER(name) = LOWER(?)"
    )
    .get(String(discordId), q);
}

async function requirePetro(ctx, message) {
  if (ctx.petro.configured) return true;
  await message.reply({
    embeds: [errorEmbed("Hosting is not configured", "The Petro Panel integration is currently unavailable.")],
  });
  return false;
}

/** `!servers` — list the user's own servers. */
export const serversCommand = {
  name: "servers",
  aliases: ["myserver", "list"],
  description: "List your hosted servers",
  usage: "!servers",
  requiresActive: true,

  async handle(ctx, message) {
    const rows = ctx.db
      .prepare("SELECT * FROM servers WHERE owner_discord_id = ? AND deleted_at IS NULL ORDER BY id DESC")
      .all(String(message.author.id));
    if (rows.length === 0) {
      await message.reply({
        embeds: [
          brandEmbed(
            "🖥️ Your servers",
            "You don't host any servers yet.\nDeploy one with `!HYdeploy node.js` or `!HYdeploy python`!"
          ),
        ],
      });
      return;
    }
    const eb = brandEmbed(
      "🖥️ Your servers",
      `You host **${rows.length}/${ctx.cfg.serverLimitPerUser}** servers. Manage them here or on the [panel](${ctx.petro.configured ? ctx.cfg.petro.url : "https://pterodactyl.io"}).`
    );
    for (const s of rows) {
      eb.addFields({
        name: `${s.status === "running" ? "🟢" : s.status === "offline" || s.status === "stopped" ? "🔴" : "🟡"} ${s.name}`,
        value: `Plan: **${s.plan_name || "—"}** · Runtime: **${s.runtime}** · Status: \`${s.status}\`\n\`!server info ${s.name}\` · \`!server console ${s.name}\``,
      });
    }
    await message.reply({ embeds: [eb] });
  },
};

/** `!server <action> <name>` — manage one of the user's own servers. */
export const serverCommand = {
  name: "server",
  aliases: ["srv"],
  description: "Manage one of your servers",
  usage: "!server info|start|stop|restart|reinstall|delete|console|command <name>",
  requiresActive: true,

  async handle(ctx, message, args) {
    const action = args[0]?.toLowerCase();
    if (!action || !ACTIONS.includes(action)) {
      await message.reply({
        embeds: [
          warnEmbed(
            "Server management",
            `Usage: \`!server <action> <name>\`\nActions: ${ACTIONS.map((a) => `\`${a}\``).join(" · ")}\n\nSee \`!servers\` for your server names.`
          ),
        ],
      });
      return;
    }
    const name = args[1];
    if (!name) {
      await message.reply({
        embeds: [warnEmbed("Missing server name", `Usage: \`!server ${action} <name>\``)],
      });
      return;
    }
    const server = findOwnServer(ctx.db, message.author.id, name);
    if (!server) {
      await message.reply({
        embeds: [
          errorEmbed(
            "Server not found",
            `No server named **${name}** belongs to you. Check \`!servers\` — you can only manage your own servers.`
          ),
        ],
      });
      return;
    }
    const plan = server.plan_id
      ? ctx.db.prepare("SELECT * FROM plans WHERE id = ?").get(server.plan_id)
      : null;

    switch (action) {
      case "info": {
        let resources = null;
        if (ctx.petro.configured && server.petro_uuid) {
          try {
            resources = await ctx.petro.resources(server.petro_uuid);
          } catch {
            resources = null;
          }
        }
        const eb = serverCard(server, plan, resources);
        eb.addFields({
          name: "Manage",
          value: `\`!server start ${server.name}\` · \`!server stop ${server.name}\` · \`!server restart ${server.name}\`\n\`!server console ${server.name}\` · \`!server command ${server.name} <cmd>\``,
        });
        await message.reply({ embeds: [eb] });
        return;
      }

      case "start":
      case "stop":
      case "restart": {
        if (!(await requirePetro(ctx, message))) return;
        try {
          await ctx.petro.power(server.petro_uuid, action);
          ctx.db.prepare("UPDATE servers SET status = ? WHERE id = ?").run(
            action === "start" ? "starting" : action === "stop" ? "stopping" : "restarting",
            server.id
          );
          await message.reply({
            embeds: [successEmbed(`Power: ${action}`, `**${server.name}** → \`${action}\` signal sent.`)],
          });
        } catch (err) {
          await message.reply({ embeds: [errorEmbed("Power action failed", err.message)] });
        }
        return;
      }

      case "reinstall": {
        if (!(await requirePetro(ctx, message))) return;
        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId(reiId(message.author.id, server.id)).setLabel("♻️ Reinstall now").setStyle(ButtonStyle.Danger),
          new ButtonBuilder().setCustomId(cancelId(message.author.id)).setLabel("Cancel").setStyle(ButtonStyle.Secondary)
        );
        await message.reply({
          embeds: [
            warnEmbed(
              "Reinstall server?",
              `**${server.name}** will be wiped and reinstalled from the runtime image.\n**All files on the server are deleted.** This cannot be undone.`
            ),
          ],
          components: [row],
        });
        return;
      }

      case "delete": {
        if (!(await requirePetro(ctx, message))) return;
        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId(delId(message.author.id, server.id)).setLabel("🗑️ Delete forever").setStyle(ButtonStyle.Danger),
          new ButtonBuilder().setCustomId(cancelId(message.author.id)).setLabel("Cancel").setStyle(ButtonStyle.Secondary)
        );
        await message.reply({
          embeds: [
            warnEmbed(
              "Delete server?",
              `**${server.name}** and **all of its files** will be permanently destroyed on the Petro Panel.\nThis cannot be undone.`
            ),
          ],
          components: [row],
        });
        return;
      }

      case "console": {
        if (!(await requirePetro(ctx, message))) return;
        await message.reply({ embeds: [brandEmbed("📺 Connecting to console…", `\`${server.name}\` — capturing live output.`)] });
        const session = await consoleSession(ctx.petro, server.petro_uuid, { durationMs: 12000 });
        if (!session.ok) {
          await message.channel.send({
            embeds: [errorEmbed("Console unavailable", `${session.error}\n\nYou can always open the live console on the panel: ${ctx.cfg.petro.url}`)],
          });
          return;
        }
        const out = (session.lines.slice(-25).join("\n") || "*no output in the last 12s — server may be idle or offline*").slice(0, 1800);
        await message.channel.send({
          embeds: [brandEmbed(`📺 ${server.name} — console (last 12s)`, `\`\`\`\n${out}\n\`\`\``)],
        });
        return;
      }

      case "command": {
        if (!(await requirePetro(ctx, message))) return;
        const cmd = args.slice(2).join(" ").trim();
        if (!cmd) {
          await message.reply({ embeds: [warnEmbed("Missing command", `Usage: \`!server command ${server.name} <command>\``)] });
          return;
        }
        const session = await consoleSession(ctx.petro, server.petro_uuid, { durationMs: 8000, command: cmd });
        if (!session.ok) {
          await message.reply({ embeds: [errorEmbed("Console unavailable", session.error)] });
          return;
        }
        const out = (session.lines.slice(-15).join("\n") || "*no output*").slice(0, 1500);
        await message.reply({
          embeds: [brandEmbed(`⌨️ ${server.name} → \`${cmd.slice(0, 60)}\``, `\`\`\`\n${out}\n\`\`\``)],
        });
        return;
      }

      default:
        return;
    }
  },
};

// ---- destructive confirmations (invoked from index.js interaction handler) --

export async function confirmDelete(ctx, interaction, serverId) {
  const server = ctx.db
    .prepare("SELECT * FROM servers WHERE id = ? AND deleted_at IS NULL")
    .get(parseInt(serverId, 10));
  if (!server || server.owner_discord_id !== String(interaction.user.id)) {
    await interaction.update({ embeds: [errorEmbed("Server not found", "It is not yours or no longer exists.")], components: [] });
    return;
  }
  try {
    await ctx.petro.deleteServer(server.petro_server_id, true);
    ctx.db.prepare("UPDATE servers SET deleted_at = datetime('now'), status = 'deleted' WHERE id = ?").run(server.id);
    logDeployment(ctx.db, {
      discordId: server.owner_discord_id,
      serverId: server.id,
      serverName: server.name,
      runtime: server.runtime,
      action: "delete",
      status: "success",
      detail: `petro server #${server.petro_server_id} destroyed`,
    });
    audit(ctx.db, interaction.user.id, "server.delete", `server:${server.name}`, "owner-initiated", interaction.user.username);
    await interaction.update({ embeds: [successEmbed("Server deleted", `**${server.name}** was permanently destroyed.`)], components: [] });
  } catch (err) {
    await interaction.update({ embeds: [errorEmbed("Delete failed", `${err.message}\n\nThe server still exists — nothing was deleted.`)], components: [] });
  }
}

export async function confirmReinstall(ctx, interaction, serverId) {
  const server = ctx.db
    .prepare("SELECT * FROM servers WHERE id = ? AND deleted_at IS NULL")
    .get(parseInt(serverId, 10));
  if (!server || server.owner_discord_id !== String(interaction.user.id)) {
    await interaction.update({ embeds: [errorEmbed("Server not found", "It is not yours or no longer exists.")], components: [] });
    return;
  }
  try {
    await ctx.petro.reinstall(server.petro_uuid);
    ctx.db.prepare("UPDATE servers SET status = 'installing' WHERE id = ?").run(server.id);
    logDeployment(ctx.db, {
      discordId: server.owner_discord_id,
      serverId: server.id,
      serverName: server.name,
      runtime: server.runtime,
      action: "reinstall",
      status: "success",
      detail: "reinstall triggered from Discord",
    });
    await interaction.update({
      embeds: [successEmbed("Reinstalling", `**${server.name}** is being wiped and reinstalled from its image.`)],
      components: [],
    });
  } catch (err) {
    await interaction.update({ embeds: [errorEmbed("Reinstall failed", err.message)], components: [] });
  }
}
