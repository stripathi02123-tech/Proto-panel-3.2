// PROTO HOSTING BOT — invite tracking service
// Only REAL, verified invites count:
//   · a join is credited when we observe it (guildMemberAdd) and can attribute
//     it to a concrete invite code by diffing the guild invite list
//   · if the invited member later leaves, the invite stops counting (departed)
//   · bots never count; vanity-URL joins can't be attributed (uncredited)
//   · a periodic reconciliation repairs drift (bot restarts, deleted invites)

export class InviteService {
  constructor(db, client, logger) {
    this.db = db;
    this.client = client;
    this.log = logger.tag("invites");
    this._warnedGuilds = new Set();
  }

  // ---- snapshot / sync -----------------------------------------------------

  /** Fetch current invites of a guild and upsert them into invite_tracking. */
  async snapshotGuild(guild) {
    let invites;
    try {
      invites = await guild.invites.fetch();
    } catch (err) {
      if (!this._warnedGuilds.has(guild.id)) {
        this._warnedGuilds.add(guild.id);
        this.log.warn(
          `cannot fetch invites for guild ${guild.name || guild.id} (Manage Server permission missing?) — ${err.message}`
        );
      }
      return null;
    }
    this._warnedGuilds.delete(guild.id);
    const seenCodes = [];
    for (const inv of invites.values()) {
      seenCodes.push(inv.code);
      this.db
        .prepare(
          `INSERT INTO invite_tracking (guild_id, code, inviter_discord_id, uses, max_uses, status, created_at, last_seen_at)
           VALUES (?, ?, ?, ?, ?, 'active', ?, datetime('now'))
           ON CONFLICT(guild_id, code) DO UPDATE SET
             inviter_discord_id = excluded.inviter_discord_id,
             uses = excluded.uses,
             max_uses = excluded.max_uses,
             status = 'active',
             last_seen_at = datetime('now')`
        )
        .run(
          String(guild.id),
          inv.code,
          inv.inviter ? String(inv.inviter.id) : null,
          inv.uses ?? 0,
          inv.maxUses ?? null,
          inv.createdAt ? new Date(inv.createdAt).toISOString() : null
        );
    }
    // codes that vanished are revoked
    if (seenCodes.length > 0) {
      const placeholders = seenCodes.map(() => "?").join(",");
      this.db
        .prepare(
          `UPDATE invite_tracking SET status = 'revoked'
           WHERE guild_id = ? AND status = 'active' AND code NOT IN (${placeholders})`
        )
        .run(String(guild.id), ...seenCodes);
    }
    return invites;
  }

  async syncAll() {
    const guilds = this.client.guilds?.cache ? [...this.client.guilds.cache.values()] : [];
    for (const guild of guilds) {
      await this.snapshotGuild(guild);
    }
    return guilds.length;
  }

  // ---- events ---------------------------------------------------------------

  /** Called on guildMemberAdd — attribute the join to a real invite code. */
  async onMemberAdd(member) {
    const guild = member.guild;
    const before = new Map(
      this.db
        .prepare("SELECT code, uses FROM invite_tracking WHERE guild_id = ? AND status = 'active'")
        .all(String(guild.id))
        .map((r) => [r.code, r.uses])
    );
    const after = await this.snapshotGuild(guild);
    if (!after) {
      // no permission to inspect invites — record an uncredited join
      this._recordJoin(guild.id, null, member, null, 0);
      return null;
    }
    let usedCode = null;
    let inviterId = null;
    for (const inv of after.values()) {
      const prev = before.get(inv.code);
      if (prev === undefined || inv.uses > prev) {
        usedCode = inv.code;
        inviterId = inv.inviter ? String(inv.inviter.id) : null;
        break;
      }
    }
    if (usedCode) {
      this._recordJoin(guild.id, usedCode, member, inviterId, 1);
      return inviterId;
    }
    // vanity URL or join without attribution
    const vanity = guild.vanityURLCode ? "vanity" : null;
    this._recordJoin(guild.id, vanity, member, null, 0);
    return null;
  }

  /** Called on guildMemberRemove — the member's invite stops counting. */
  async onMemberRemove(member) {
    const row = this.db
      .prepare(
        `SELECT id FROM invite_joins
         WHERE member_discord_id = ? AND guild_id = ? AND left_at IS NULL
         ORDER BY id DESC LIMIT 1`
      )
      .get(String(member.id), String(member.guild.id));
    if (row) {
      this.db
        .prepare("UPDATE invite_joins SET left_at = datetime('now') WHERE id = ?")
        .run(row.id);
    }
  }

  _recordJoin(guildId, code, member, inviterId, credited) {
    this.db
      .prepare(
        `INSERT INTO invite_joins (guild_id, code, member_discord_id, inviter_discord_id, is_bot, credited)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .run(
        String(guildId),
        code,
        String(member.id),
        inviterId,
        member.user?.bot ? 1 : 0,
        credited
      );
  }

  // ---- statistics ------------------------------------------------------------

  /**
   * Invite stats for a user.
   * valid    — members still in the guild that they really invited
   * departed — members they invited who left again (no longer count)
   * total    — valid + departed (all real, attributed joins ever)
   * pending  — invite uses the panel shows but we could not attribute
   */
  statsFor(discordId, guildId = null) {
    const id = String(discordId);
    const g = guildId ? String(guildId) : null;
    const validRow = this.db
      .prepare(
        `SELECT COUNT(*) AS c FROM invite_joins
         WHERE inviter_discord_id = ? AND left_at IS NULL AND is_bot = 0 ${g ? "AND guild_id = ?" : ""}`
      )
      .get(...(g ? [id, g] : [id]));
    const departedRow = this.db
      .prepare(
        `SELECT COUNT(*) AS c FROM invite_joins
         WHERE inviter_discord_id = ? AND left_at IS NOT NULL AND is_bot = 0 ${g ? "AND guild_id = ?" : ""}`
      )
      .get(...(g ? [id, g] : [id]));
    // pending: active codes where panel "uses" exceeds attributed joins
    const codes = this.db
      .prepare(
        `SELECT code, uses FROM invite_tracking
         WHERE inviter_discord_id = ? AND status = 'active' ${g ? "AND guild_id = ?" : ""}`
      )
      .all(...(g ? [id, g] : [id]));
    let pending = 0;
    for (const c of codes) {
      const creditedRow = this.db
        .prepare("SELECT COUNT(*) AS n FROM invite_joins WHERE code = ? AND credited = 1")
        .get(c.code);
      const diff = (c.uses ?? 0) - (creditedRow?.n ?? 0);
      if (diff > 0) pending += diff;
    }
    const valid = validRow?.c ?? 0;
    const departed = departedRow?.c ?? 0;
    return { valid, departed, total: valid + departed, pending };
  }

  topInviters(guildId = null, limit = 10) {
    const g = guildId ? String(guildId) : null;
    return this.db
      .prepare(
        `SELECT inviter_discord_id AS id, COUNT(*) AS valid
         FROM invite_joins
         WHERE left_at IS NULL AND is_bot = 0 AND inviter_discord_id IS NOT NULL
         ${g ? "AND guild_id = ?" : ""}
         GROUP BY inviter_discord_id ORDER BY valid DESC LIMIT ?`
      )
      .all(...(g ? [g, limit] : [limit]));
  }

  // ---- reconciliation ---------------------------------------------------------

  /** Periodic repair: refresh snapshots and close joins for members who left
   *  while the bot was offline (only for guilds small enough to enumerate). */
  async reconcile() {
    const guilds = this.client.guilds?.cache ? [...this.client.guilds.cache.values()] : [];
    for (const guild of guilds) {
      await this.snapshotGuild(guild);
      try {
        if ((guild.memberCount ?? 0) <= 1000) {
          await guild.members.fetch({ withPresences: false });
          const present = new Set([...guild.members.cache.keys()].map(String));
          const open = this.db
            .prepare(
              "SELECT id, member_discord_id FROM invite_joins WHERE guild_id = ? AND left_at IS NULL"
            )
            .all(String(guild.id));
          for (const j of open) {
            if (!present.has(j.member_discord_id)) {
              this.db
                .prepare("UPDATE invite_joins SET left_at = datetime('now') WHERE id = ?")
                .run(j.id);
            }
          }
        }
      } catch (err) {
        this.log.warn(`reconcile: member fetch failed for ${guild.id}: ${err.message}`);
      }
    }
  }
}
