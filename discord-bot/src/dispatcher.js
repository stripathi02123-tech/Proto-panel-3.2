// PROTO HOSTING BOT — command & interaction dispatcher
// Kept separate from the Discord wiring so the exact command pipeline
// (registry lookup, admin gate, maintenance gate, registration gate) can be
// exercised end-to-end by the test harness without a live Discord connection.
import { MessageFlags } from "discord.js";
import { isBotAdmin, commandGate } from "./permissions.js";

export function makeDispatcher(registry) {
  /** Handles a MessageCreate-equivalent event. */
  async function dispatchMessage(ctx, message) {
    try {
      if (message.author?.bot) return null;
      const content = message.content || "";
      if (!content.startsWith(ctx.cfg.prefix)) return null;
      const parts = content.slice(ctx.cfg.prefix.length).trim().split(/\s+/);
      if (parts.length === 0 || !parts[0]) return null;
      const invoked = parts[0].toLowerCase();
      const args = parts.slice(1);
      const command = registry.find(
        (c) => c.name === invoked || (c.aliases && c.aliases.includes(invoked))
      );
      if (!command) return null;

      if ((command.adminOnly || command.ownerOnly) && !isBotAdmin(ctx, message.author.id)) {
        return await message.reply({
          embeds: [
            {
              title: "⛔ Access denied",
              description: "This command is reserved for hosting platform administrators.",
              color: 0xef4444,
            },
          ],
        });
      }

      const gate = commandGate(ctx, message, command);
      if (gate) {
        return await message.reply(gate);
      }

      return await command.handle(ctx, message, args);
    } catch (err) {
      ctx.logger.error(`command error (${message.content?.slice(0, 80)}): ${err?.stack || err}`);
      try {
        return await message.reply({
          embeds: [
            {
              title: "⛔ Something went wrong",
              description:
                "The command failed unexpectedly. The error was logged — try again or contact an administrator.",
              color: 0xef4444,
            },
          ],
        });
      } catch {
        return null;
      }
    }
  }

  /** Handles an InteractionCreate-equivalent event (buttons + select menus). */
  async function dispatchInteraction(ctx, interaction) {
    try {
      if (!interaction.isButton() && !interaction.isStringSelectMenu()) return null;
      const id = interaction.customId || "";
      const [ns, action, userId, extra] = id.split(":");

      // components are personal — nobody may use someone else's menu
      if (userId && interaction.user?.id !== userId) {
        return await interaction.reply({
          embeds: [
            {
              title: "⛔ Not your menu",
              description: "This selection belongs to another user. Run the command yourself.",
              color: 0xef4444,
            },
          ],
          flags: MessageFlags.Ephemeral,
        });
      }

      if (ns === "deploy") {
        const { handlePlanSelect, handleDeployConfirm } = await import("./commands/deploy.js");
        if (action === "sel") {
          return await handlePlanSelect(ctx, interaction);
        }
        if (action === "go") {
          return await handleDeployConfirm(ctx, interaction, extra);
        }
        if (action === "stop") {
          return await interaction.update({
            embeds: [{ title: "🚫 Deployment cancelled", color: 0x64748b }],
            components: [],
          });
        }
        return null;
      }

      if (ns === "srv") {
        const srv = await import("./commands/servers.js");
        if (action === "del") {
          return await srv.confirmDelete(ctx, interaction, extra);
        }
        if (action === "rei") {
          return await srv.confirmReinstall(ctx, interaction, extra);
        }
        if (action === "stop") {
          return await interaction.update({
            embeds: [{ title: "🚫 Action cancelled", color: 0x64748b }],
            components: [],
          });
        }
        return null;
      }

      return null;
    } catch (err) {
      ctx.logger.error(`interaction error (${interaction.customId}): ${err?.stack || err}`);
      try {
        if (interaction.deferred || interaction.replied) {
          return await interaction.editReply({
            content: "Something went wrong handling this action — it was logged.",
            embeds: [],
            components: [],
          });
        }
        return await interaction.reply({
          content: "Something went wrong handling this action — it was logged.",
          flags: MessageFlags.Ephemeral,
        });
      } catch {
        return null;
      }
    }
  }

  return { dispatchMessage, dispatchInteraction };
}
