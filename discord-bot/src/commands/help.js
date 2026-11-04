// PROTO HOSTING BOT — !help
import { MessageFlags } from "discord.js";
import { brandEmbed, COLORS } from "../embeds.js";

export default {
  name: "help",
  aliases: ["commands", "cmds"],
  description: "Show everything PROTO HOSTING can do",
  usage: "!help",
  bypassMaintenance: true,

  async handle(ctx, message) {
    const p = ctx.cfg.prefix;
    const eb = brandEmbed(
      "🧬 PROTO HOSTING — command reference",
      "Premium Discord bot hosting powered by Proto Panel + Petro Panel.\nOne account per Discord user. Real invites unlock real servers."
    );
    eb.addFields(
      {
        name: "🚀 Getting started",
        value: `\`${p}register\` — create your hosting account (once per Discord account)\n\`${p}invites\` — your verified invite stats\n\`${p}invites top\` — invite leaderboard`,
      },
      {
        name: "📦 Deployment",
        value: `\`${p}HYdeploy node.js\` — deploy a Node.js bot\n\`${p}HYdeploy python\` — deploy a Python bot\nPlan selection → invite verification → automatic provisioning`,
      },
      {
        name: "🖥️ Server management",
        value: `\`${p}servers\` — list your servers\n\`${p}server info <name>\` — details & live usage\n\`${p}server start|stop|restart <name>\`\n\`${p}server reinstall <name>\` — fresh install (confirm)\n\`${p}server delete <name>\` — destroy (confirm)\n\`${p}server console <name>\` — stream live console\n\`${p}server command <name> <cmd>\` — run a command`,
      },
      {
        name: "🛠️ Administration (owners)",
        value: `\`${p}admin\` — admin dashboard\n\`${p}admin plans\` / \`${p}admin plan create|edit|delete\` — manage plans without code\n\`${p}admin user|suspend|unsuspend <discord_id>\`\n\`${p}admin stats\` · \`${p}admin maintenance on|off\` · \`${p}admin audit\``,
      },
      {
        name: "\u200b",
        value: `*Need help? Ask in support. Plans and availability are managed by the server team — never trust anyone asking for your password.*`,
      }
    );
    await message.reply({ embeds: [eb], flags: MessageFlags.Ephemeral });
  },
};
