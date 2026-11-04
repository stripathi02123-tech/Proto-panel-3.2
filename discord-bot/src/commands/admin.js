// PROTO HOSTING BOT — !admin command family (bot owners / admin role)
// Plans are fully editable from Discord — no code changes, no restart needed.
import { MessageFlags } from "discord.js";
import { brandEmbed, successEmbed, errorEmbed, warnEmbed, fmtCpu, fmtMem, fmtDisk, runtimeLabel, COLORS } from "../embeds.js";
import {
  isBotAdmin,
  getUserByDiscordId,
  setMaintenance,
  getMaintenance,
  audit,
} from "../permissions.js";
import {
  parseKv,
  validatePlanFields,
  listPlans,
  getPlan,
  createPlan,
  updatePlan,
  deletePlan,
} from "../services/plans.js";

function fmtUserCard(u, stats, serverCount) {
  return [
    `Account: **${u.account_id}** · Status: **${u.status}**`,
    `Panel user: \`${u.username}\` · Email: \`${u.email}\``,
    `Registered: ${u.created_at.replace("T", " ").slice(0, 16)} UTC`,
    `Invites: ✅ ${stats.valid} valid · ⏳ ${stats.pending} pending · 👋 ${stats.departed} departed`,
    `Servers: ${serverCount}`,
  ].join("\n");
}

export default {
  name: "admin",
  aliases: [],
  description: "Hosting platform administration (owners only)",
  usage:
    "!admin [user|suspend|unsuspend|plans|plan|server|stats|maintenance|role|audit|sync] …",
  adminOnly: true,
  bypassMaintenance: true,

  async handle(ctx, message, args) {
    if (!isBotAdmin(ctx, message.author.id)) {
      await message.reply({
        embeds: [errorEmbed("Access denied", "Only hosting platform administrators can use `!admin`.")],
      });
      return;
    }
    const sub = args[0]?.toLowerCase();
    const p = ctx.cfg.prefix;

    switch (sub) {
      // ---- dashboard --------------------------------------------------------
      case undefined: {
        const users = ctx.db.prepare("SELECT COUNT(*) AS c FROM users").get().c;
        const active = ctx.db.prepare("SELECT COUNT(*) AS c FROM users WHERE status='active'").get().c;
        const suspended = ctx.db.prepare("SELECT COUNT(*) AS c FROM users WHERE status!='active'").get().c;
        const servers = ctx.db.prepare("SELECT COUNT(*) AS c FROM servers WHERE deleted_at IS NULL").get().c;
        const deploys = ctx.db.prepare("SELECT COUNT(*) AS c FROM deployment_logs WHERE action='deploy' AND status='success'").get().c;
        const maint = getMaintenance(ctx.db);
        const eb = brandEmbed("🛠️ PROTO HOSTING — admin", `Prefix: \`${p}\` · Panel: ${ctx.cfg.petro.configured ? ctx.cfg.petro.url : "⚠️ not configured"}`);
        eb.addFields(
          { name: "Users", value: `${users} (${active} active, ${suspended} suspended)`, inline: true },
          { name: "Servers", value: String(servers), inline: true },
          { name: "Deploys", value: String(deploys), inline: true },
          { name: "Maintenance", value: maint.on ? `**ON**${maint.message ? ` — ${maint.message}` : ""}` : "off", inline: true },
          {
            name: "Quick actions",
            value: `\`${p}admin plans\` — manage plans\n\`${p}admin user <discord_id>\`\n\`${p}admin suspend|unsuspend <discord_id>\`\n\`${p}admin stats\` · \`${p}admin audit\` · \`${p}admin maintenance on|off\` · \`${p}admin sync\``,
          }
        );
        await message.reply({ embeds: [eb] });
        return;
      }

      // ---- users -------------------------------------------------------------
      case "user": {
        const id = args[1]?.replace(/[<@!>]/g, "");
        const u = id ? getUserByDiscordId(ctx.db, id) : null;
        if (!u) {
          await message.reply({ embeds: [errorEmbed("User not found", `No registered account for Discord ID \`${id}\`.`)] });
          return;
        }
        const stats = ctx.invites.statsFor(u.discord_id);
        const cnt = ctx.db.prepare("SELECT COUNT(*) AS c FROM servers WHERE owner_discord_id = ? AND deleted_at IS NULL").get(u.discord_id).c;
        await message.reply({ embeds: [brandEmbed(`👤 ${u.username} (<@${u.discord_id}>)`, fmtUserCard(u, stats, cnt))] });
        return;
      }

      case "suspend":
      case "unsuspend": {
        const id = args[1]?.replace(/[<@!>]/g, "");
        const u = id ? getUserByDiscordId(ctx.db, id) : null;
        if (!u) {
          await message.reply({ embeds: [errorEmbed("User not found", `No registered account for Discord ID \`${id}\`.`)] });
          return;
        }
        const suspend = sub === "suspend";
        const reason = args.slice(2).join(" ");
        ctx.db.prepare("UPDATE users SET status = ?, updated_at = datetime('now') WHERE discord_id = ?").run(suspend ? "suspended" : "active", u.discord_id);
        // mirror on the panel so their servers actually stop being usable
        let panelNote = "";
        try {
          const link = ctx.db.prepare("SELECT * FROM petro_accounts WHERE user_id = ?").get(u.id);
          if (link && ctx.petro.configured) {
            await ctx.petro.setUserSuspended(link.petro_user_id, suspend);
            panelNote = suspend ? "\nPanel account suspended — their servers are frozen." : "\nPanel account re-enabled.";
          }
        } catch (err) {
          panelNote = `\n⚠️ Panel sync failed: ${err.message}`;
        }
        audit(ctx.db, message.author.id, `user.${sub}`, `user:${u.account_id}`, reason || null, message.author.username);
        await message.reply({
          embeds: [
            (suspend ? warnEmbed : successEmbed)(
              suspend ? "User suspended" : "User unsuspended",
              `<@${u.discord_id}> (${u.account_id}) is now **${suspend ? "suspended" : "active"}**.${panelNote}`
            ),
          ],
        });
        return;
      }

      // ---- plans ---------------------------------------------------------------
      case "plans":
      case "plan": {
        await handlePlanAdmin(ctx, message, args.slice(1));
        return;
      }

      // ---- servers ---------------------------------------------------------------
      case "server": {
        const q = args[1];
        if (!q) {
          await message.reply({ embeds: [errorEmbed("Usage", `\`${p}admin server <name|#id>\``)] });
          return;
        }
        const row = q.startsWith("#")
          ? ctx.db.prepare("SELECT * FROM servers WHERE id = ?").get(parseInt(q.slice(1), 10) || 0)
          : ctx.db.prepare("SELECT * FROM servers WHERE LOWER(name) = LOWER(?) ORDER BY deleted_at IS NOT NULL LIMIT 1").get(q);
        if (!row) {
          await message.reply({ embeds: [errorEmbed("Server not found", q)] });
          return;
        }
        const owner = getUserByDiscordId(ctx.db, row.owner_discord_id);
        const eb = brandEmbed(`🖥️ ${row.name}`, `Owner: <@${row.owner_discord_id}> (${owner?.account_id || "?"})`);
        eb.addFields(
          { name: "Plan", value: `${row.plan_name || "—"} · ${runtimeLabel(row.runtime)}`, inline: true },
          { name: "Status", value: `\`${row.status}\``, inline: true },
          { name: "Panel", value: row.petro_server_id ? `#${row.petro_server_id}\n\`${row.petro_uuid}\`` : "—", inline: true },
          { name: "Created", value: row.created_at.replace("T", " ").slice(0, 16) + " UTC", inline: true },
          { name: "Deleted", value: row.deleted_at ? row.deleted_at.replace("T", " ").slice(0, 16) + " UTC" : "no", inline: true }
        );
        if (args[2] === "delete") {
          try {
            await ctx.petro.deleteServer(row.petro_server_id, true);
            ctx.db.prepare("UPDATE servers SET deleted_at = datetime('now'), status='deleted' WHERE id = ?").run(row.id);
            audit(ctx.db, message.author.id, "server.admin-delete", `server:${row.name}`, `owner ${row.owner_discord_id}`, message.author.username);
            await message.reply({ embeds: [successEmbed("Deleted", `**${row.name}** was destroyed on the panel.`)] });
          } catch (err) {
            await message.reply({ embeds: [errorEmbed("Delete failed", err.message)] });
          }
          return;
        }
        if (args[2] === "power" && ["start", "stop", "restart"].includes(args[3])) {
          try {
            await ctx.petro.power(row.petro_uuid, args[3]);
            await message.reply({ embeds: [successEmbed("Power", `${row.name} → \`${args[3]}\``)] });
          } catch (err) {
            await message.reply({ embeds: [errorEmbed("Power failed", err.message)] });
          }
          return;
        }
        await message.reply({ embeds: [eb] });
        return;
      }

      case "stats": {
        const users = ctx.db.prepare("SELECT COUNT(*) AS c FROM users").get().c;
        const servers = ctx.db.prepare("SELECT COUNT(*) AS c FROM servers WHERE deleted_at IS NULL").get().c;
        const deleted = ctx.db.prepare("SELECT COUNT(*) AS c FROM servers WHERE deleted_at IS NOT NULL").get().c;
        const failed = ctx.db.prepare("SELECT COUNT(*) AS c FROM deployment_logs WHERE status='failed'").get().c;
        const joins = ctx.db.prepare("SELECT COUNT(*) AS c FROM invite_joins").get().c;
        const validJoins = ctx.db.prepare("SELECT COUNT(*) AS c FROM invite_joins WHERE left_at IS NULL AND is_bot = 0").get().c;
        const codes = ctx.db.prepare("SELECT COUNT(*) AS c FROM invite_tracking WHERE status='active'").get().c;
        const plans = ctx.db.prepare("SELECT COUNT(*) AS c FROM plans WHERE available=1").get().c;
        const eb = brandEmbed("📊 Platform statistics", "Live from the hosting database.");
        eb.addFields(
          { name: "Registered users", value: String(users), inline: true },
          { name: "Active servers", value: String(servers), inline: true },
          { name: "Deleted servers", value: String(deleted), inline: true },
          { name: "Successful deploys", value: String(ctx.db.prepare("SELECT COUNT(*) AS c FROM deployment_logs WHERE action='deploy' AND status='success'").get().c), inline: true },
          { name: "Failed deploys", value: String(failed), inline: true },
          { name: "Available plans", value: String(plans), inline: true },
          { name: "Tracked invites", value: `${codes} active codes`, inline: true },
          { name: "Joins observed", value: `${joins} (${validJoins} still present)`, inline: true }
        );
        await message.reply({ embeds: [eb] });
        return;
      }

      case "maintenance": {
        const mode = args[1]?.toLowerCase();
        if (mode !== "on" && mode !== "off") {
          const m = getMaintenance(ctx.db);
          await message.reply({
            embeds: [warnEmbed("Maintenance", `Current status: **${m.on ? "ON" : "off"}**\nUsage: \`${p}admin maintenance on [message]\` / \`${p}admin maintenance off\``)],
          });
          return;
        }
        const msg = args.slice(2).join(" ");
        setMaintenance(ctx.db, mode === "on", msg);
        audit(ctx.db, message.author.id, "maintenance", mode, msg || null, message.author.username);
        await message.reply({
          embeds: [successEmbed(`Maintenance ${mode === "on" ? "enabled" : "disabled"}`, mode === "on" && msg ? `Message: ${msg}` : "Non-admin commands are " + (mode === "on" ? "now blocked." : "available again."))],
        });
        return;
      }

      case "role": {
        const action = args[1]?.toLowerCase();
        const id = args[2]?.replace(/[<@!>]/g, "");
        const roleName = args[3]?.toLowerCase();
        if (!["add", "remove"].includes(action) || !id || !["admin", "moderator"].includes(roleName || "")) {
          await message.reply({ embeds: [errorEmbed("Usage", `\`${p}admin role add|remove <discord_id> admin|moderator\``)] });
          return;
        }
        const role = ctx.db.prepare("SELECT * FROM roles WHERE name = ?").get(roleName);
        if (action === "add") {
          ctx.db.prepare("INSERT OR IGNORE INTO user_roles (user_discord_id, role_id, granted_by) VALUES (?, ?, ?)").run(id, role.id, String(message.author.id));
        } else {
          ctx.db.prepare("DELETE FROM user_roles WHERE user_discord_id = ? AND role_id = ?").run(id, role.id);
        }
        audit(ctx.db, message.author.id, `role.${action}`, `user:${id}`, roleName, message.author.username);
        await message.reply({ embeds: [successEmbed(`Role ${action === "add" ? "granted" : "revoked"}`, `<@${id}> → **${roleName}**`)] });
        return;
      }

      case "audit": {
        const n = Math.min(parseInt(args[1], 10) || 10, 25);
        const rows = ctx.db.prepare("SELECT * FROM audit_logs ORDER BY id DESC LIMIT ?").all(n);
        const eb = brandEmbed("🧾 Recent audit entries", rows.length ? rows.map((r) => `\`[${r.created_at.slice(5, 16)}]\` **${r.action}** ${r.target ? `→ ${r.target}` : ""} — <@${r.actor_discord_id}>${r.detail ? ` · ${r.detail}` : ""}`).join("\n").slice(0, 3900) : "Nothing recorded yet.");
        await message.reply({ embeds: [eb] });
        return;
      }

      case "sync": {
        const guilds = await ctx.invites.reconcile();
        await message.reply({ embeds: [successEmbed("Invite sync complete", `Reconciled ${guilds} guild(s) — snapshots and departed members updated.`)] });
        return;
      }

      default:
        await message.reply({
          embeds: [warnEmbed("Unknown admin action", `Try \`${p}admin\` for the dashboard.`)],
        });
        return;
    }
  },
};

// ---- plan management ---------------------------------------------------------

async function handlePlanAdmin(ctx, message, args) {
  const p = ctx.cfg.prefix;
  const sub = args[0]?.toLowerCase();

  if (!sub || sub === "list" || sub === "plans") {
    const plans = listPlans(ctx.db);
    const eb = brandEmbed("📦 Hosting plans", `Edit plans live — no restart needed.\n\`${p}admin plan create name:"X" runtime:node.js cpu:100 ram:1024 disk:4096 invites:3\`\n\`${p}admin plan edit <id> invites:2\` · \`${p}admin plan delete <id>\``);
    if (plans.length === 0) {
      eb.setDescription("No plans yet — create the first one!");
    } else {
      for (const pl of plans) {
        eb.addFields({
          name: `#${pl.id} ${pl.name} [${runtimeLabel(pl.runtime)}]${pl.available ? "" : " 🔒"}`,
          value: `${fmtCpu(pl.cpu)} · ${fmtMem(pl.memory)} · ${fmtDisk(pl.disk)} · **${pl.required_invites}** invites${pl.description ? `\n*${pl.description}*` : ""}`,
        });
      }
    }
    await message.reply({ embeds: [eb] });
    return;
  }

  if (sub === "create") {
    const kv = parseKv(args.slice(1));
    const { errors, values } = validatePlanFields(kv);
    if (errors.length) {
      await message.reply({ embeds: [errorEmbed("Invalid plan", errors.join("\n"))] });
      return;
    }
    try {
      const plan = createPlan(ctx.db, values);
      audit(ctx.db, message.author.id, "plan.create", `plan:${plan.id}`, `${plan.name} (${plan.runtime})`, message.author.username);
      await message.reply({ embeds: [successEmbed("Plan created", `**#${plan.id} ${plan.name}** [${runtimeLabel(plan.runtime)}] — ${fmtCpu(plan.cpu)} · ${fmtMem(plan.memory)} · ${fmtDisk(plan.disk)} · ${plan.required_invites} invites`)] });
    } catch (err) {
      await message.reply({ embeds: [errorEmbed("Could not create plan", err.message.includes("UNIQUE") ? "A plan with this name already exists for that runtime." : err.message)] });
    }
    return;
  }

  if (sub === "edit") {
    const id = args[1];
    const plan = id ? getPlan(ctx.db, parseInt(id, 10)) : null;
    if (!plan) {
      await message.reply({ embeds: [errorEmbed("Plan not found", `Usage: \`${p}admin plan edit <id> key:value…\``)] });
      return;
    }
    const kv = parseKv(args.slice(2));
    if (Object.keys(kv).length === 0) {
      await message.reply({ embeds: [errorEmbed("Nothing to change", `Usage: \`${p}admin plan edit ${plan.id} invites:2 cpu:200 …\``)] });
      return;
    }
    const { errors, values } = validatePlanFields(kv, { partial: true, existing: plan });
    if (errors.length) {
      await message.reply({ embeds: [errorEmbed("Invalid values", errors.join("\n"))] });
      return;
    }
    const updated = updatePlan(ctx.db, plan.id, values);
    audit(ctx.db, message.author.id, "plan.edit", `plan:${plan.id}`, Object.entries(values).map(([k, v]) => `${k}=${v}`).join(", "), message.author.username);
    await message.reply({ embeds: [successEmbed("Plan updated", `**#${updated.id} ${updated.name}** is now ${fmtCpu(updated.cpu)} · ${fmtMem(updated.memory)} · ${fmtDisk(updated.disk)} · **${updated.required_invites}** invites${updated.available ? "" : " · 🔒 hidden"} — effective immediately.`)] });
    return;
  }

  if (sub === "delete") {
    const id = args[1];
    const plan = id ? getPlan(ctx.db, parseInt(id, 10)) : null;
    if (!plan) {
      await message.reply({ embeds: [errorEmbed("Plan not found", `Usage: \`${p}admin plan delete <id>\``)] });
      return;
    }
    try {
      deletePlan(ctx.db, plan.id);
      audit(ctx.db, message.author.id, "plan.delete", `plan:${plan.id}`, plan.name, message.author.username);
      await message.reply({ embeds: [successEmbed("Plan deleted", `**${plan.name}** [${runtimeLabel(plan.runtime)}] removed.`)] });
    } catch (err) {
      if (err.code === "IN_USE") {
        await message.reply({ embeds: [warnEmbed("Plan is in use", `${err.message}.\nUse \`${p}admin plan edit ${plan.id} available:no\` to hide it instead.`)] });
      } else {
        await message.reply({ embeds: [errorEmbed("Delete failed", err.message)] });
      }
    }
    return;
  }

  await message.reply({ embeds: [errorEmbed("Unknown plan action", `Try \`${p}admin plans\``)] });
}
