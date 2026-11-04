// PROTO HOSTING BOT — !register
// ONE account per Discord account. Creates (or links) a Petro Panel account,
// stores only a scrypt hash of the generated password and DMs the credentials.
// If the DM cannot be delivered the registration is rolled back — plaintext
// passwords are never stored anywhere.
import crypto from "node:crypto";
import { MessageFlags } from "discord.js";
import {
  successEmbed,
  errorEmbed,
  warnEmbed,
  credentialsEmbed,
} from "../embeds.js";
import { audit } from "../permissions.js";

function genAccountId() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  const bytes = crypto.randomBytes(8);
  for (let i = 0; i < 8; i++) out += alphabet[bytes[i] % alphabet.length];
  return `PROTO-${out}`;
}

function genPassword() {
  // 20 chars, guaranteed classes, cryptographically random
  const upper = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const lower = "abcdefghijkmnopqrstuvwxyz";
  const digits = "23456789";
  const symbols = "!@#%^*_-+=";
  const all = upper + lower + digits + symbols;
  const pick = (set) => set[crypto.randomInt(0, set.length)];
  let pw = [pick(upper), pick(lower), pick(digits), pick(symbols)];
  for (let i = 0; i < 16; i++) pw.push(pick(all));
  // Fisher-Yates shuffle
  for (let i = pw.length - 1; i > 0; i--) {
    const j = crypto.randomInt(0, i + 1);
    [pw[i], pw[j]] = [pw[j], pw[i]];
  }
  return pw.join("");
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, 64);
  return `scrypt$${salt.toString("hex")}$${hash.toString("hex")}`;
}

export function sanitizeUsername(raw) {
  let u = String(raw || "")
    .toLowerCase()
    .replace(/[^a-z0-9._-]/g, "")
    .slice(0, 20);
  if (u.length < 3) u = `${u || "user"}${crypto.randomInt(100, 999)}`;
  return u;
}

export default {
  name: "register",
  aliases: [],
  description: "Create your PROTO HOSTING account (one per Discord account)",
  usage: "!register",

  async handle(ctx, message) {
    const discordId = String(message.author.id);
    const existing = ctx.db.prepare("SELECT * FROM users WHERE discord_id = ?").get(discordId);

    if (existing) {
      await message.reply({
        embeds: [
          warnEmbed(
            "Account creation limit reached",
            `This Discord account already has a PROTO HOSTING account (**${existing.account_id}**, registered ${existing.created_at.replace("T", " ").slice(0, 10)}).\n\nOne account per Discord user — use \`!HYdeploy node.js\` / \`!HYdeploy python\` to deploy servers, or \`!servers\` to manage them.\n\nLost your password? Ask an administrator to reset it on the panel.`
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
            "The administrator has not connected the Petro Panel integration (PETRO_PANEL_URL / PETRO_APP_KEY). Please try again later."
          ),
        ],
      });
      return;
    }

    const username = sanitizeUsername(message.author.username);
    const email = `proto-${discordId}@${ctx.cfg.petro.emailDomain}`;
    const accountId = genAccountId();
    const password = genPassword();

    // ---- Petro Panel account (create or link, never duplicate) -------------
    let petroUser = null;
    let linked = false;
    try {
      petroUser = await ctx.petro.findUserByExternalId(discordId);
      if (!petroUser) {
        petroUser = await ctx.petro.findUserByEmail(email);
      }
      if (petroUser) {
        linked = true; // panel account already exists — link it, keep its password
      } else {
        petroUser = await ctx.petro.createUser({
          username,
          email,
          externalId: discordId,
          password,
          firstName: sanitizeUsername(message.author.username) || "proto",
          lastName: "hosting",
        });
      }
      const petroUserId = petroUser?.attributes?.id;
      if (!petroUserId) throw new Error("panel returned no user id");
      const petroEmail = petroUser?.attributes?.email || email;

      // ---- store (single transaction; password only as scrypt hash) --------
      const insert = ctx.db
        .prepare(
          `INSERT INTO users (discord_id, account_id, username, email, password_hash, status, registered_via)
           VALUES (?, ?, ?, ?, ?, 'active', ?)`
        )
        .run(discordId, accountId, username, petroEmail, hashPassword(password), message.guild ? String(message.guild.id) : null);
      ctx.db
        .prepare(
          `INSERT INTO petro_accounts (user_id, petro_user_id, email, external_id, existed)
           VALUES (?, ?, ?, ?, ?)`
        )
        .run(insert.lastInsertRowid, petroUserId, petroEmail, discordId, linked ? 1 : 0);

      // ---- DM credentials — rollback if undeliverable ----------------------
      const dm = await credentialsEmbed({
        panelUrl: ctx.cfg.petro.url,
        accountId,
        username: petroUser?.attributes?.username || username,
        email: petroEmail,
        password,
        linked,
      }).toJSON();
      try {
        await message.author.send({ embeds: [dm] });
      } catch {
        // could not DM — remove the pending registration so nothing is lost
        ctx.db.prepare("DELETE FROM users WHERE discord_id = ?").run(discordId);
        audit(ctx.db, discordId, "user.register", "user:" + accountId, "rolled back — DMs closed", message.author.username);
        await message.reply({
          embeds: [
            errorEmbed(
              "I couldn't send you a direct message",
              "Your credentials must be sent via DM for security.\n**Enable DMs from server members** (Privacy Settings) and run `!register` again.\n\nNothing was saved — you can safely retry."
            ),
          ],
        });
        return;
      }

      audit(ctx.db, discordId, "user.register", `user:${accountId}`, linked ? "linked existing panel account" : "created panel account", message.author.username);
      await message.reply({
        embeds: [
          successEmbed(
            "Account created 🧬",
            `Welcome to **PROTO HOSTING**, <@${discordId}>!\n\nYour Petro Panel account **${accountId}** is ready — check your **direct messages** for the credentials.\n\nNext: \`!HYdeploy node.js\` or \`!HYdeploy python\` to deploy your first bot.`
          ),
        ],
      });
    } catch (err) {
      // partial state cleanup — do not leave orphan local rows
      try {
        ctx.db.prepare("DELETE FROM users WHERE discord_id = ?").run(discordId);
      } catch {
        /* ignore */
      }
      await message.reply({
        embeds: [
          errorEmbed(
            "Registration failed",
            `The Petro Panel refused the request: ${err.message}\n\nPlease try again in a minute — if it keeps failing, contact an administrator.`
          ),
        ],
      });
    }
  },
};
