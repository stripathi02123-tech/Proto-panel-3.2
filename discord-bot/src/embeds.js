// PROTO HOSTING BOT — branded embed builders (PROTO branding only)
import { EmbedBuilder } from "discord.js";

export const COLORS = {
  brand: 0x3b82f6, // electric blue
  cyan: 0x22d3ee,
  success: 0x34d399,
  error: 0xef4444,
  warn: 0xf59e0b,
  purple: 0x8b5cf6,
  dark: 0x0b1020,
};

function base({ title, description, color }) {
  const eb = new EmbedBuilder()
    .setColor(color ?? COLORS.brand)
    .setFooter({ text: "PROTO PANEL · Discord Hosting" })
    .setTimestamp(new Date());
  if (title) eb.setTitle(title);
  if (description) eb.setDescription(description);
  return eb;
}

export const successEmbed = (title, description) =>
  base({ title: `✅ ${title}`, description, color: COLORS.success });
export const errorEmbed = (title, description) =>
  base({ title: `⛔ ${title}`, description, color: COLORS.error });
export const warnEmbed = (title, description) =>
  base({ title: `⚠️ ${title}`, description, color: COLORS.warn });
export const infoEmbed = (title, description) =>
  base({ title, description, color: COLORS.brand });
export const brandEmbed = (title, description) =>
  base({ title, description, color: COLORS.purple });

export const fmtMem = (mb) => (mb >= 1024 ? `${(mb / 1024).toFixed(mb % 1024 === 0 ? 0 : 1)} GB` : `${mb} MB`);
export const fmtDisk = (mb) => (mb >= 1024 ? `${(mb / 1024).toFixed(mb % 1024 === 0 ? 0 : 1)} GB` : `${mb} MB`);
export const fmtCpu = (p) => `${p}%${p > 100 ? ` (${(p / 100).toFixed(1)} cores)` : ""}`;
export const runtimeLabel = (r) => (r === "python" ? "Python 3" : "Node.js");

/** Card for a single hosting plan. */
export function planField(plan) {
  const title = `${plan.name} — ${runtimeLabel(plan.runtime)}`;
  const value = [
    `CPU: ${fmtCpu(plan.cpu)} · RAM: ${fmtMem(plan.memory)} · Disk: ${fmtDisk(plan.disk)}`,
    `Required invites: **${plan.required_invites}**`,
    plan.description ? `*${plan.description}*` : "",
    plan.available ? "" : "🔒 currently unavailable",
  ]
    .filter(Boolean)
    .join("\n");
  return { name: title, value };
}

/** Summary line for plan select-menu options. */
export function planOptionLine(plan) {
  return `${fmtCpu(plan.cpu)} · ${fmtMem(plan.memory)} · ${fmtDisk(plan.disk)} · ${plan.required_invites} invites`;
}

export function inviteStatsFields(stats) {
  return [
    { name: "✅ Valid invites", value: String(stats.valid), inline: true },
    { name: "📋 Total credited", value: String(stats.total), inline: true },
    { name: "⏳ Pending", value: String(stats.pending), inline: true },
    { name: "👋 Departed", value: String(stats.departed), inline: true },
    {
      name: "How it works",
      value:
        "Invite real people with your invite link. Every member that **stays** counts as a valid invite — if they leave, the invite no longer counts. Bot accounts never count.",
    },
  ];
}

/** Live provisioning progress card. */
export function provisioningEmbed(steps, currentStep, extra) {
  const lines = steps.map((s, i) => {
    if (i < currentStep) return `✅ ${s}`;
    if (i === currentStep) return `⏳ ${s}…`;
    return `▫️ ${s}`;
  });
  const eb = base({
    title: "🚀 Provisioning your server",
    description: lines.join("\n"),
    color: COLORS.brand,
  });
  if (extra) eb.addFields({ name: "\u200b", value: extra });
  return eb;
}

/** Server card used by !servers / !server info / deploy success. */
export function serverCard(server, plan, resources) {
  const eb = base({
    title: `🖥️ ${server.name}`,
    color: COLORS.cyan,
  });
  eb.addFields(
    { name: "Runtime", value: runtimeLabel(server.runtime), inline: true },
    { name: "Plan", value: server.plan_name || plan?.name || "—", inline: true },
    { name: "Status", value: `\`${server.status}\``, inline: true },
    { name: "Created", value: server.created_at?.replace("T", " ").slice(0, 16) + " UTC" || "—", inline: true }
  );
  if (plan) {
    eb.addFields({
      name: "Resources",
      value: `${fmtCpu(plan.cpu)} CPU · ${fmtMem(plan.memory)} RAM · ${fmtDisk(plan.disk)} disk`,
    });
  }
  if (resources) {
    eb.addFields({
      name: "Live usage",
      value: [
        `State: \`${resources.current_state ?? "unknown"}\``,
        `RAM: ${resources.resources ? (resources.resources.memory_bytes / 1024 / 1024).toFixed(0) : "?"} MB`,
        `CPU: ${resources.resources ? resources.resources.cpu_absolute.toFixed(1) : "?"}%`,
      ].join("\n"),
    });
  }
  return eb;
}

/** Credentials DM sent on successful !register. */
export function credentialsEmbed({ panelUrl, accountId, username, email, password, linked }) {
  return base({
    title: "🧬 Your PROTO HOSTING account",
    description:
      "Keep these credentials safe — **this is the only time the password is shown**.\nChange it after your first login.",
    color: COLORS.purple,
  }).addFields(
    { name: "Panel", value: panelUrl, inline: false },
    { name: "Account ID", value: `\`${accountId}\``, inline: true },
    { name: "Username", value: `\`${username}\``, inline: true },
    { name: "Email", value: `\`${email}\``, inline: false },
    {
      name: "Password",
      value: linked ? "*(your existing panel password — account linked)*" : `||${password}||`,
      inline: false,
    },
    {
      name: "Next step",
      value: "Head back to the server and run `!HYdeploy node.js` or `!HYdeploy python` to deploy your first bot.",
    }
  );
}
