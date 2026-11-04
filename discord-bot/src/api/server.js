// PROTO HOSTING BOT — local admin API
// A localhost-only HTTP API (shared-secret protected) that the Proto Panel web
// UI proxies to for the "Bot Hosting" administration page. Binds 127.0.0.1 by
// default; only requests carrying the correct x-api-key are served.
import express from "express";
import crypto from "node:crypto";
import { validatePlanFields, listPlans, getPlan, createPlan, updatePlan, deletePlan } from "../services/plans.js";
import { setMaintenance, getMaintenance, audit } from "../permissions.js";

function safeEqual(a, b) {
  const ba = Buffer.from(String(a || ""));
  const bb = Buffer.from(String(b || ""));
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}

export function startAdminApi(ctx) {
  const { cfg, db } = ctx;
  if (!cfg.api.enabled) return null;
  if (!cfg.api.secret) {
    ctx.logger.warn("admin API disabled — BOT_API_SECRET is not set");
    return null;
  }

  const app = express();
  app.use(express.json({ limit: "256kb" }));

  // --- auth ------------------------------------------------------------------
  app.use((req, res, next) => {
    if (!safeEqual(req.headers["x-api-key"], cfg.api.secret)) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    next();
  });

  // --- health / stats ----------------------------------------------------------
  app.get("/health", (req, res) => {
    res.json({
      ok: true,
      bot: "proto-hosting-bot",
      version: cfg.version,
      uptime: Math.round(process.uptime()),
      maintenance: getMaintenance(db).on,
      petroConfigured: ctx.petro.configured,
    });
  });

  app.get("/stats", (req, res) => {
    const one = (sql, ...p) => db.prepare(sql).get(...p)?.c ?? 0;
    res.json({
      users: one("SELECT COUNT(*) AS c FROM users"),
      activeUsers: one("SELECT COUNT(*) AS c FROM users WHERE status='active'"),
      suspendedUsers: one("SELECT COUNT(*) AS c FROM users WHERE status!='active'"),
      servers: one("SELECT COUNT(*) AS c FROM servers WHERE deleted_at IS NULL"),
      deletedServers: one("SELECT COUNT(*) AS c FROM servers WHERE deleted_at IS NOT NULL"),
      deploysOk: one("SELECT COUNT(*) AS c FROM deployment_logs WHERE action='deploy' AND status='success'"),
      deploysFailed: one("SELECT COUNT(*) AS c FROM deployment_logs WHERE status='failed'"),
      activeInviteCodes: one("SELECT COUNT(*) AS c FROM invite_tracking WHERE status='active'"),
      validJoins: one("SELECT COUNT(*) AS c FROM invite_joins WHERE left_at IS NULL AND is_bot=0"),
    });
  });

  // --- users -------------------------------------------------------------------
  app.get("/users", (req, res) => {
    const limit = Math.min(parseInt(req.query.limit, 10) || 100, 500);
    const rows = db
      .prepare("SELECT id, discord_id, account_id, username, email, status, created_at FROM users ORDER BY id DESC LIMIT ?")
      .all(limit);
    res.json({
      users: rows.map((u) => {
        const servers = db
          .prepare("SELECT COUNT(*) AS c FROM servers WHERE owner_discord_id = ? AND deleted_at IS NULL")
          .get(u.discord_id).c;
        return { ...u, servers, invites: ctx.invites.statsFor(u.discord_id) };
      }),
    });
  });

  app.post("/users/:discordId/suspend", (req, res) => {
    const u = db.prepare("SELECT * FROM users WHERE discord_id = ?").get(req.params.discordId);
    if (!u) {
      res.status(404).json({ error: "User not found" });
      return;
    }
    db.prepare("UPDATE users SET status='suspended', updated_at=datetime('now') WHERE discord_id = ?").run(u.discord_id);
    audit(db, "panel", "user.suspend", `user:${u.account_id}`, "via panel admin API");
    res.json({ ok: true });
  });

  app.post("/users/:discordId/unsuspend", (req, res) => {
    const u = db.prepare("SELECT * FROM users WHERE discord_id = ?").get(req.params.discordId);
    if (!u) {
      res.status(404).json({ error: "User not found" });
      return;
    }
    db.prepare("UPDATE users SET status='active', updated_at=datetime('now') WHERE discord_id = ?").run(u.discord_id);
    audit(db, "panel", "user.unsuspend", `user:${u.account_id}`, "via panel admin API");
    res.json({ ok: true });
  });

  // --- plans (the panel's plan editor writes through here) ------------------------
  app.get("/plans", (req, res) => {
    res.json({ plans: listPlans(db) });
  });

  app.post("/plans", (req, res) => {
    const { errors, values } = validatePlanFields(req.body || {});
    if (errors.length) {
      res.status(400).json({ error: errors.join("; ") });
      return;
    }
    try {
      const plan = createPlan(db, values);
      audit(db, "panel", "plan.create", `plan:${plan.id}`, `${plan.name} (${plan.runtime})`);
      res.json({ plan });
    } catch (err) {
      res.status(400).json({ error: err.message.includes("UNIQUE") ? "A plan with this name already exists for that runtime" : err.message });
    }
  });

  app.patch("/plans/:id", (req, res) => {
    const plan = getPlan(db, req.params.id);
    if (!plan) {
      res.status(404).json({ error: "Plan not found" });
      return;
    }
    const { errors, values } = validatePlanFields(req.body || {}, { partial: true, existing: plan });
    if (errors.length) {
      res.status(400).json({ error: errors.join("; ") });
      return;
    }
    const updated = updatePlan(db, plan.id, values);
    audit(db, "panel", "plan.edit", `plan:${plan.id}`, Object.entries(values).map(([k, v]) => `${k}=${v}`).join(", "));
    res.json({ plan: updated });
  });

  app.delete("/plans/:id", (req, res) => {
    try {
      const removed = deletePlan(db, req.params.id);
      if (!removed) {
        res.status(404).json({ error: "Plan not found" });
        return;
      }
      audit(db, "panel", "plan.delete", `plan:${removed.id}`, removed.name);
      res.json({ ok: true });
    } catch (err) {
      res.status(err.code === "IN_USE" ? 409 : 500).json({ error: err.message });
    }
  });

  // --- servers / logs ----------------------------------------------------------
  app.get("/servers", (req, res) => {
    const rows = db
      .prepare(
        `SELECT s.*, u.account_id AS owner_account, u.username AS owner_name
         FROM servers s LEFT JOIN users u ON u.discord_id = s.owner_discord_id
         WHERE s.deleted_at IS NULL ORDER BY s.id DESC LIMIT 500`
      )
      .all();
    res.json({ servers: rows });
  });

  app.get("/deployment-logs", (req, res) => {
    const limit = Math.min(parseInt(req.query.limit, 10) || 50, 200);
    res.json({ logs: db.prepare("SELECT * FROM deployment_logs ORDER BY id DESC LIMIT ?").all(limit) });
  });

  app.get("/audit", (req, res) => {
    const limit = Math.min(parseInt(req.query.limit, 10) || 50, 200);
    res.json({ logs: db.prepare("SELECT * FROM audit_logs ORDER BY id DESC LIMIT ?").all(limit) });
  });

  app.get("/invites/top", (req, res) => {
    res.json({ top: ctx.invites.topInvites(null, 10) });
  });

  app.post("/maintenance", (req, res) => {
    const enabled = Boolean(req.body?.enabled);
    setMaintenance(db, enabled, String(req.body?.message || "").slice(0, 300));
    audit(db, "panel", "maintenance", enabled ? "on" : "off", req.body?.message || null);
    res.json({ ok: true, maintenance: getMaintenance(db) });
  });

  const server = app.listen(cfg.api.port, cfg.api.host, () => {
    ctx.logger.info(`admin API listening on http://${cfg.api.host}:${cfg.api.port} (panel integration)`);
  });
  server.on("error", (err) => {
    ctx.logger.error(`admin API failed to start: ${err.message}`);
  });
  return server;
}
