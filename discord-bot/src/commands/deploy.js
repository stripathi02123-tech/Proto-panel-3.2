// PROTO HOSTING BOT — !HYdeploy <runtime>  (alias: !deploy)
// Flow: plan cards from SQLite → user selects a plan → bot VERIFIES REAL
// invites → requirement not completed OR confirmation → provisioning.
import {
  ActionRowBuilder,
  StringSelectMenuBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
} from "discord.js";
import {
  brandEmbed,
  errorEmbed,
  warnEmbed,
  planField,
  inviteStatsFields,
  fmtCpu,
  fmtMem,
  fmtDisk,
  runtimeLabel,
  provisioningEmbed,
  COLORS,
} from "../embeds.js";
import { normalizeRuntime } from "../config.js";
import { listPlans } from "../services/plans.js";
import { runDeployment, deploymentSuccessEmbed, deploymentErrorEmbed } from "../services/deployer.js";

export function selId(uid) {
  return `deploy:sel:${uid}`;
}
export function goId(uid, planId) {
  return `deploy:go:${uid}:${planId}`;
}
export function stopId(uid) {
  return `deploy:stop:${uid}`;
}

export default {
  name: "hydeploy",
  aliases: ["deploy"],
  description: "Deploy a hosted bot (node.js / python)",
  usage: "!HYdeploy node.js  |  !HYdeploy python",
  requiresActive: true,

  async handle(ctx, message, args) {
    const runtime = normalizeRuntime(args[0]);
    if (!runtime) {
      await message.reply({
        embeds: [
          warnEmbed(
            "Pick a runtime",
            `Usage: \`!HYdeploy node.js\` or \`!HYdeploy python\``
          ),
        ],
      });
      return;
    }
    if (!ctx.petro.configured) {
      await message.reply({
        embeds: [
          errorEmbed(
            "Hosting is not configured yet",
            "The administrator has not connected the Petro Panel integration. Try again later."
          ),
        ],
      });
      return;
    }
    const plans = listPlans(ctx.db, { runtime, availableOnly: true });
    if (plans.length === 0) {
      await message.reply({
        embeds: [
          warnEmbed(
            "No plans available",
            `There are currently no **${runtimeLabel(runtime)}** plans available. Ask the server team — they can add plans live with \`!admin plan create\`.`
          ),
        ],
      });
      return;
    }

    const stats = ctx.invites.statsFor(message.author.id, message.guild?.id ?? null);
    const eb = brandEmbed(
      `📦 ${runtimeLabel(runtime)} plans`,
      "Choose the plan that fits your bot. You unlock a plan by bringing **real, verified invites** — members that stay."
    );
    for (const p of plans) eb.addFields(planField(p));
    eb.addFields({
      name: "Your invite status",
      value: `✅ **${stats.valid}** valid invites · ⏳ ${stats.pending} pending · 👋 ${stats.departed} departed`,
    });

    const menu = new StringSelectMenuBuilder()
      .setCustomId(selId(message.author.id))
      .setPlaceholder("Select a plan to deploy…")
      .addOptions(
        plans.slice(0, 25).map((p) => ({
          label: `${p.name} (${fmtCpu(p.cpu)}, ${fmtMem(p.memory)}, ${fmtDisk(p.disk)})`.slice(0, 100),
          description: `needs ${p.required_invites} valid invites`.slice(0, 100),
          value: String(p.id),
        }))
      );
    const row = new ActionRowBuilder().addComponents(menu);
    await message.reply({ embeds: [eb], components: [row] });
  },
};

/** Step 2 — plan selected: verify invites, then ask for confirmation. */
export async function handlePlanSelect(ctx, interaction) {
  const uid = interaction.user.id;
  const planId = parseInt(interaction.values?.[0], 10);
  const plan = ctx.db.prepare("SELECT * FROM plans WHERE id = ?").get(planId);
  if (!plan || !plan.available) {
    await interaction.update({
      embeds: [warnEmbed("Plan unavailable", "That plan is no longer available. Run `!HYdeploy` again.")],
      components: [],
    });
    return;
  }

  const user = ctx.db.prepare("SELECT * FROM users WHERE discord_id = ?").get(String(uid));
  if (!user || user.status !== "active") {
    await interaction.update({
      embeds: [errorEmbed("Account required", "Register first with `!register` — one account per Discord user.")],
      components: [],
    });
    return;
  }

  // ---- REAL invite verification -------------------------------------------
  const stats = ctx.invites.statsFor(uid, interaction.guildId ?? null);
  if (stats.valid < plan.required_invites) {
    const eb = errorEmbed(
      "Invite requirement not completed",
      `**${plan.name}** requires **${plan.required_invites}** valid invites.\n\nYou have **${stats.valid}** valid invite(s) — you need **${plan.required_invites - stats.valid}** more.`
    );
    eb.addFields(...inviteStatsFields(stats));
    await interaction.update({ embeds: [eb], components: [] });
    return;
  }

  const eb = brandEmbed(
    `Confirm deployment — ${plan.name}`,
    `Everything checks out. Review your plan and launch 🚀`
  );
  eb.addFields(
    { name: "Runtime", value: runtimeLabel(plan.runtime), inline: true },
    { name: "CPU", value: fmtCpu(plan.cpu), inline: true },
    { name: "RAM", value: fmtMem(plan.memory), inline: true },
    { name: "Disk", value: fmtDisk(plan.disk), inline: true },
    { name: "Valid invites", value: `${stats.valid} / ${plan.required_invites} required ✅`, inline: false }
  );
  if (plan.description) eb.addFields({ name: "About this plan", value: plan.description });

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(goId(uid, plan.id)).setLabel("🚀 Provision server").setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(stopId(uid)).setLabel("Cancel").setStyle(ButtonStyle.Secondary)
  );
  await interaction.update({ embeds: [eb], components: [row] });
}

/** Step 3 — confirmed: run the real provisioning pipeline. */
export async function handleDeployConfirm(ctx, interaction, planId) {
  const uid = interaction.user.id;
  const user = ctx.db.prepare("SELECT * FROM users WHERE discord_id = ?").get(String(uid));
  const plan = ctx.db.prepare("SELECT * FROM plans WHERE id = ?").get(parseInt(planId, 10));
  if (!user || !plan) {
    await interaction.update({
      embeds: [errorEmbed("Deployment cancelled", "Your account or the selected plan is no longer available.")],
      components: [],
    });
    return;
  }

  let lastEdit = 0;
  const progress = async (embed) => {
    const now = Date.now();
    if (now - lastEdit < 800) return; // keep Discord edit-rate happy
    lastEdit = now;
    try {
      await interaction.editReply({ embeds: [embed], components: [] });
    } catch {
      /* interaction may be old — ignore edit races */
    }
  };

  await interaction.update({ embeds: [deploymentStartingEmbed()], components: [] });
  const result = await runDeployment(ctx, {
    user,
    plan,
    guildId: interaction.guildId ?? null,
    progress,
  });

  if (result.ok) {
    await interaction.editReply({
      embeds: [deploymentSuccessEmbed(result, ctx.cfg.petro.url)],
      components: [],
    });
    // DM a copy of the summary
    try {
      const dmEmbed = deploymentSuccessEmbed(result, ctx.cfg.petro.url).toJSON();
      await interaction.user.send({ embeds: [dmEmbed] });
    } catch {
      /* DMs closed — channel reply already delivered */
    }
  } else {
    await interaction.editReply({
      embeds: [deploymentErrorEmbed(result)],
      components: [],
    });
  }
}

export const DEPLOY_STEPS = [
  "Verifying account",
  "Verifying invite requirement",
  "Reserving server name",
  "Provisioning on Petro Panel",
  "Recording server",
  "Finalizing",
];

function deploymentStartingEmbed() {
  return provisioningEmbed(DEPLOY_STEPS, 0);
}
