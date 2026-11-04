// PROTO HOSTING BOT — deployment pipeline
// Runs after plan selection + confirmation. Every step performs REAL work;
// any failure aborts with an honest error and is recorded in deployment_logs.
import {
  provisioningEmbed,
  successEmbed,
  errorEmbed,
  serverCard,
  fmtCpu,
  fmtMem,
  fmtDisk,
  COLORS,
} from "../embeds.js";
import { logDeployment, audit } from "../permissions.js";
import { PetroError } from "./petro.js";

const STEPS = [
  "Verifying account",
  "Verifying invite requirement",
  "Reserving server name",
  "Provisioning on Petro Panel",
  "Recording server",
  "Finalizing",
];

function sanitizeName(s) {
  return String(s || "user")
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, "")
    .slice(0, 16) || "user";
}

function planSlug(s) {
  return String(s || "srv")
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, "")
    .slice(0, 12) || "srv";
}

function generateServerName(db, user, plan) {
  const base = `${sanitizeName(user.username)}-${planSlug(plan.name)}`;
  let name = base;
  let i = 2;
  while (
    db
      .prepare("SELECT 1 FROM servers WHERE owner_discord_id = ? AND name = ? AND deleted_at IS NULL")
      .get(user.discord_id, name)
  ) {
    name = `${base}-${i++}`;
    if (i > 50) {
      name = `${base}-${Date.now().toString(36)}`;
      break;
    }
  }
  return name;
}

/**
 * Execute a deployment. Resolves with { ok, server? , error? }.
 * `progress` is an async callback receiving the embed payload at each step —
 * this lets both the interaction flow and tests observe progress.
 */
export async function runDeployment(ctx, { user, plan, guildId, progress }) {
  const log = ctx.logger.tag("deploy");
  const report = async (step, extra) => {
    if (progress) await progress(provisioningEmbed(STEPS, step, extra));
  };

  try {
    // ---- step 0: account ---------------------------------------------------
    await report(0);
    const fresh = ctx.db.prepare("SELECT * FROM users WHERE discord_id = ?").get(user.discord_id);
    if (!fresh || fresh.status !== "active") {
      throw new PetroError("Your account is not active.", { step: "account" });
    }
    const serverCount = ctx.db
      .prepare("SELECT COUNT(*) AS c FROM servers WHERE owner_discord_id = ? AND deleted_at IS NULL")
      .get(user.discord_id).c;
    if (serverCount >= ctx.cfg.serverLimitPerUser) {
      throw new PetroError(
        `You already host ${serverCount} server(s) — the per-user limit is ${ctx.cfg.serverLimitPerUser}. Delete one with \`!server delete <name>\` first.`
      );
    }

    // ---- step 1: invite requirement ---------------------------------------
    await report(1, `Plan **${plan.name}** requires **${plan.required_invites}** valid invites`);
    const stats = ctx.invites.statsFor(user.discord_id, guildId);
    if (stats.valid < plan.required_invites) {
      throw new PetroError(
        `Invite requirement not completed — you need **${plan.required_invites}** valid invites but have **${stats.valid}**.\nInvite real members with your invite link; invites only count while those members stay.`
      );
    }

    // ---- step 2: name ------------------------------------------------------
    await report(2);
    const name = generateServerName(ctx.db, fresh, plan);

    // ---- step 3: provision -------------------------------------------------
    await report(3, `Runtime image \`${ctx.cfg.petro.dockerImages[plan.runtime]}\``);
    const link = ctx.db
      .prepare("SELECT * FROM petro_accounts WHERE user_id = ?")
      .get(fresh.id);
    if (!link) {
      throw new PetroError(
        "Your Petro Panel account link is missing — please contact an administrator (re-register is not possible, one account per Discord user)."
      );
    }
    const created = await ctx.petro.createServer({
      name,
      petroUserId: link.petro_user_id,
      runtime: plan.runtime,
      cpu: plan.cpu,
      memory: plan.memory,
      disk: plan.disk,
    });

    // ---- step 4: record ----------------------------------------------------
    await report(4);
    let serverRowId;
    try {
      const r = ctx.db
        .prepare(
          `INSERT INTO servers (owner_discord_id, name, plan_id, plan_name, runtime, petro_server_id, petro_uuid, status)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          fresh.discord_id,
          name,
          plan.id,
          plan.name,
          plan.runtime,
          created.id,
          created.identifier,
          created.status || "installing"
        );
      serverRowId = r.lastInsertRowid;
    } catch (err) {
      // the server exists on the panel but we could not record it — surface honestly
      log.error(`recording server failed after provisioning: ${err.message}`);
      throw new PetroError(
        `Server was created on the panel (id ${created.id}) but recording it failed: ${err.message}. Contact an administrator with this message.`,
        { step: "record" }
      );
    }

    // ---- step 5: finalize (observe install state briefly) -------------------
    await report(5);
    let status = created.status || "installing";
    for (let i = 0; i < 5; i++) {
      try {
        const res = await ctx.petro.resources(created.identifier);
        if (res?.current_state) {
          status = res.current_state;
          if (status !== "installing") break;
        }
      } catch {
        break; // resources not ready yet — keep panel-reported status
      }
      await new Promise((r) => setTimeout(r, 3000));
    }
    ctx.db.prepare("UPDATE servers SET status = ? WHERE id = ?").run(status, serverRowId);

    const server = ctx.db.prepare("SELECT * FROM servers WHERE id = ?").get(serverRowId);
    logDeployment(ctx.db, {
      discordId: fresh.discord_id,
      serverId: serverRowId,
      serverName: name,
      runtime: plan.runtime,
      planName: plan.name,
      action: "deploy",
      status: "success",
      detail: `petro server #${created.id} (${created.identifier})`,
    });
    audit(ctx.db, fresh.discord_id, "server.deploy", `server:${name}`, `plan ${plan.name} (${plan.runtime})`, fresh.username);

    return { ok: true, server, plan, status };
  } catch (err) {
    const stepName = err instanceof PetroError ? err.step : "";
    logDeployment(ctx.db, {
      discordId: user.discord_id,
      runtime: plan.runtime,
      planName: plan.name,
      action: "deploy",
      status: "failed",
      detail: `${err.message}${stepName ? ` [step: ${stepName}]` : ""}`,
    });
    return { ok: false, error: err, step: stepName };
  }
}

/** Final success card for a deployment. */
export function deploymentSuccessEmbed(result, panelUrl) {
  const eb = successEmbed(
    "Server deployed!",
    `**${result.server.name}** is being installed on the panel.`
  );
  eb.addFields(
    {
      name: "Resources",
      value: `${fmtCpu(result.plan.cpu)} CPU · ${fmtMem(result.plan.memory)} RAM · ${fmtDisk(result.plan.disk)} disk`,
    },
    { name: "Status", value: `\`${result.status}\``, inline: true },
    { name: "Panel", value: panelUrl, inline: true },
    {
      name: "Manage it from Discord",
      value:
        "`!servers` — list your servers\n`!server start|stop|restart " +
        result.server.name +
        "`\n`!server console " +
        result.server.name +
        "` — live console\n`!server command " +
        result.server.name +
        " <cmd>` — run a command",
    }
  );
  return eb;
}

export function deploymentErrorEmbed(result) {
  return errorEmbed(
    "Deployment failed",
    `${result.error?.message || "Unknown error"}${result.step ? `\n\nFailed at step: **${result.step}**` : ""}\n\nNo server was recorded. If you believe this is a mistake, contact an administrator.`
  );
}
