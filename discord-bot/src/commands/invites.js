// PROTO HOSTING BOT — !invites / !invites top
import { MessageFlags } from "discord.js";
import { brandEmbed, infoEmbed, inviteStatsFields } from "../embeds.js";

export default {
  name: "invites",
  aliases: ["invites", "inv"],
  description: "Your verified invite stats",
  usage: "!invites  |  !invites top",

  async handle(ctx, message, args) {
    const guildId = message.guild?.id ?? null;

    if (args[0]?.toLowerCase() === "top") {
      const top = ctx.invites.topInviters(guildId, 10);
      const eb = brandEmbed(
        "🏆 Invite leaderboard",
        "Only real, verified invites count — members that are still here."
      );
      if (top.length === 0) {
        eb.setDescription("Nobody has verified invites yet — be the first!");
      } else {
        eb.setDescription(
          top
            .map((r, i) => `\`${String(i + 1).padStart(2, " ")}\` <@${r.id}> — **${r.valid}** valid`)
            .join("\n")
        );
      }
      await message.channel.send({ embeds: [eb] });
      return;
    }

    const stats = ctx.invites.statsFor(message.author.id, guildId);
    const eb = infoEmbed(
      "📨 Your invite stats",
      `<@${message.author.id}>'s verified invite performance.`
    );
    eb.addFields(...inviteStatsFields(stats));
    await message.reply({ embeds: [eb], flags: MessageFlags.Ephemeral });
  },
};
