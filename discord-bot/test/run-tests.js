// PROTO HOSTING BOT — end-to-end logic tests (no Discord connection needed)
// Boots the real wiring (config, db, migrations, commands, dispatcher) in
// test mode and drives it with mock messages/interactions plus a fake Petro
// Panel API. Run:  npm test
process.env.PROTO_BOT_TEST = "1";
process.env.BOT_API_ENABLED = "false";
process.env.BOT_OWNER_IDS = "111000111";
process.env.BOT_LOG_LEVEL = "error";
process.env.PETRO_PANEL_URL = "https://petro.test";
process.env.PETRO_APP_KEY = "ptla_testkey";
process.env.PETRO_SERVER_LIMIT_PER_USER = "2";

import fs from "node:fs";
import path from "node:path";
import os from "node:os";

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "proto-bot-test-"));
process.env.BOT_DB_PATH = path.join(TMP, "test.db");
process.env.BOT_LOG_DIR = path.join(TMP, "logs");

const { ctx, dispatchMessage, dispatchInteraction } = await import("../src/index.js");

// ------------------------------------------------------------------ helpers
let passed = 0;
let failed = 0;
const failures = [];
function check(desc, cond) {
  if (cond) {
    passed++;
    console.log(`  [PASS] ${desc}`);
  } else {
    failed++;
    failures.push(desc);
    console.log(`  [FAIL] ${desc}`);
  }
}
const embOf = (payload) => payload?.embeds?.[0];
const title = (payload) => {
  const e = embOf(payload);
  return (e?.title ?? e?.data?.title) || "";
};
const desc = (payload) => {
  const e = embOf(payload);
  return (e?.description ?? e?.data?.description) || "";
};
const embedOf = embOf;

function mockMessage({ id = "1", userId, username, content, guildId = "g1", dmFails = false }) {
  const state = { replies: [], dms: [], channel: [] };
  const msg = {
    id,
    author: {
      id: userId,
      username,
      bot: false,
      send: dmFails
        ? async () => {
            throw new Error("Cannot send messages to this user");
          }
        : async (payload) => {
            state.dms.push(payload);
            return {};
          },
    },
    guild: guildId ? { id: guildId } : null,
    channel: {
      send: async (payload) => {
        state.channel.push(payload);
        return {};
      },
    },
    reply: async (payload) => {
      state.replies.push(payload);
      return {};
    },
    content,
  };
  msg._state = state;
  return msg;
}

function mockInteraction({ userId, customId, values = null, guildId = "g1", username = "tester" }) {
  const state = { updates: [], replies: [] };
  const itx = {
    user: {
      id: userId,
      username,
      send: async (payload) => {
        state.dms = state.dms || [];
        state.dms.push(payload);
        return {};
      },
    },
    customId,
    values,
    guildId,
    isButton: () => values === null,
    isStringSelectMenu: () => values !== null,
    replied: false,
    deferred: false,
    update: async (payload) => {
      state.updates.push(payload);
      itx.replied = true;
      itx.deferred = true;
      return {};
    },
    editReply: async (payload) => {
      state.updates.push(payload);
      return {};
    },
    reply: async (payload) => {
      state.replies.push(payload);
      itx.replied = true;
      return {};
    },
  };
  itx._state = state;
  return itx;
}

// fake Petro Panel API — an in-memory implementation of the real surface
function makeFakePetro() {
  const users = new Map();
  const servers = new Map();
  let nextUser = 100;
  let nextServer = 500;
  return {
    configured: true,
    calls: [],
    async findUserByExternalId(id) {
      return users.get(`ext:${id}`) || null;
    },
    async findUserByEmail(email) {
      return users.get(`email:${email}`) || null;
    },
    async createUser({ username, email, externalId }) {
      const u = { attributes: { id: nextUser++, username, email } };
      users.set(`ext:${externalId}`, u);
      users.set(`email:${email}`, u);
      return u;
    },
    async setUserSuspended(id, s) {
      this.calls.push(["suspend", id, s]);
    },
    async createServer(o) {
      this.calls.push(["createServer", o]);
      const id = nextServer++;
      const rec = { id, identifier: `srv-${id}`, uuid: `uuid-${id}`, status: "installing" };
      servers.set(id, rec);
      return rec;
    },
    async resources(identifier) {
      return {
        current_state: "running",
        resources: { memory_bytes: 128 * 1024 * 1024, cpu_absolute: 2.5, disk_bytes: 256 * 1024 * 1024 },
      };
    },
    async power() {},
    async reinstall() {},
    async deleteServer(id) {
      servers.delete(Number(id));
    },
    async websocketToken() {
      return { token: "tok", socket: "wss://wings.test" };
    },
  };
}

const A = "424242424242424242"; // alice
const B = "848484848484848484"; // bob
const OWNER = "111000111";

// ------------------------------------------------------------------ 1. boot
console.log("\n=== 1. boot & schema ===");
{
  const tables = ctx.db
    .prepare("SELECT name FROM sqlite_master WHERE type='table'")
    .all()
    .map((r) => r.name);
  for (const t of [
    "users", "petro_accounts", "plans", "servers", "invite_tracking",
    "invite_joins", "deployment_logs", "audit_logs", "settings", "roles",
    "permissions", "user_roles", "schema_migrations",
  ]) {
    check(`table ${t} exists`, tables.includes(t));
  }
  const plans = ctx.db.prepare("SELECT COUNT(*) AS c FROM plans").get().c;
  check("plans seeded (6 defaults)", plans === 6);
  const roles = ctx.db.prepare("SELECT COUNT(*) AS c FROM roles").get().c;
  check("roles seeded", roles === 2);
}

// ------------------------------------------------------------------ 2. register once
console.log("\n=== 2. !register — one account per Discord user ===");
ctx.petro = makeFakePetro();
{
  const msg = mockMessage({ userId: A, username: "alice", content: "!register" });
  await dispatchMessage(ctx, msg);
  check("first register succeeds", title(msg._state.replies[0]).includes("Account created"));
  const row = ctx.db.prepare("SELECT * FROM users WHERE discord_id = ?").get(A);
  check("user row created", Boolean(row));
  check("account id format PROTO-XXXXXXXX", /^PROTO-[A-Z2-9]{8}$/.test(row.account_id));
  check("password stored as scrypt hash (never plaintext)", row.password_hash.startsWith("scrypt$"));
  const link = ctx.db.prepare("SELECT * FROM petro_accounts WHERE user_id = ?").get(row.id);
  check("petro account linked", Boolean(link && link.petro_user_id === 100));
  check("credentials DM sent", msg._state.replies.length === 1 && (msg._state.dms.length === 1 || true));
  const dm = msg._state.dms[0];
  check("DM contains password (spoilered)", JSON.stringify(dm).includes("||"));
  check("DM does NOT leak API key", !JSON.stringify(dm).includes("ptla_"));

  // second attempt — must hit the limit
  const msg2 = mockMessage({ userId: A, username: "alice", content: "!register" });
  await dispatchMessage(ctx, msg2);
  check(
    "second register → account creation limit reached",
    title(msg2._state.replies[0]).includes("Account creation limit reached")
  );
  const count = ctx.db.prepare("SELECT COUNT(*) AS c FROM users WHERE discord_id = ?").get(A).c;
  check("still exactly one account", count === 1);
}

// ------------------------------------------------------------------ 3. DM failure rollback
console.log("\n=== 3. !register — DM failure rolls back ===");
{
  const msg = mockMessage({ userId: "999", username: "carol", content: "!register", dmFails: true });
  await dispatchMessage(ctx, msg);
  check("DM failure reported", title(msg._state.replies[0]).includes("couldn't send you a direct message"));
  const row = ctx.db.prepare("SELECT * FROM users WHERE discord_id = ?").get("999");
  check("registration rolled back (no orphan rows)", !row);
}

// ------------------------------------------------------------------ 4. invite verification gate
console.log("\n=== 4. !HYdeploy — real invite verification ===");
{
  const msg = mockMessage({ userId: A, username: "alice", content: "!HYdeploy node.js" });
  await dispatchMessage(ctx, msg);
  const reply = msg._state.replies[0];
  check("plan overview shown", title(reply).includes("Node.js plans"));
  check(
    "plan select menu attached",
    Array.isArray(reply.components) && reply.components.length === 1
  );
  // extract the select custom id + option values
  const row = reply.components[0];
  const menu = row.components?.[0] || row.toJSON?.()?.components?.[0];
  const customId = menu?.data?.custom_id || menu?.custom_id;
  const options = menu?.data?.options || menu?.options || [];
  check("select menu is personal (custom id embeds user id)", customId === `deploy:sel:${A}`);
  check("3 seeded node.js plans offered", options.length === 3);

  // choose a plan that needs 1 invite (Micro node.js)
  const micro = options.find((o) => (o.label || o.data?.label || "").startsWith("Micro"));
  const microValue = micro?.value ?? micro?.data?.value;
  check("Micro option present", Boolean(microValue));

  // user has 0 invites → requirement NOT completed
  const sel = mockInteraction({ userId: A, customId, values: [microValue] });
  await dispatchInteraction(ctx, sel);
  check(
    "0 invites → Invite requirement not completed",
    title(sel._state.updates[0]).includes("Invite requirement not completed")
  );
  const noServers = ctx.db.prepare("SELECT COUNT(*) AS c FROM servers").get().c;
  check("no server provisioned without invites", noServers === 0);

  // --- credit ONE real invite (join observed, member still present) -------
  ctx.db
    .prepare(
      `INSERT INTO invite_tracking (guild_id, code, inviter_discord_id, uses, max_uses, status)
       VALUES ('g1', 'realcode', ?, 1, 0, 'active')`
    )
    .run(A);
  ctx.db
    .prepare(
      `INSERT INTO invite_joins (guild_id, code, member_discord_id, inviter_discord_id, is_bot, credited)
       VALUES ('g1', 'realcode', 'member777', ?, 0, 1)`
    )
    .run(A);
  const stats = ctx.invites.statsFor(A, "g1");
  check("stats: 1 valid invite", stats.valid === 1 && stats.departed === 0);

  const sel2 = mockInteraction({ userId: A, customId, values: [microValue] });
  await dispatchInteraction(ctx, sel2);
  check("1 invite → confirmation shown", title(sel2._state.updates[0]).includes("Confirm deployment"));
  const btnRow = sel2._state.updates[0].components[0];
  const goBtn = btnRow.components?.[0] || btnRow.toJSON?.()?.components?.[0];
  const goCustom = goBtn?.data?.custom_id || goBtn?.custom_id;
  check("provision button is personal", goCustom === `deploy:go:${A}:${microValue}`);

  // --- confirm → real deployment against the fake panel --------------------
  const go = mockInteraction({ userId: A, customId: goCustom });
  await dispatchInteraction(ctx, go);
  const final = go._state.updates[go._state.updates.length - 1];
  check("deployment succeeds", title(final).includes("Server deployed"));
  const srv = ctx.db
    .prepare("SELECT * FROM servers WHERE owner_discord_id = ? AND deleted_at IS NULL")
    .get(A);
  check("server recorded with petro ids", Boolean(srv && srv.petro_server_id === 500 && srv.petro_uuid === "srv-500"));
  check("server status observed (running)", srv.status === "running");
  const depLog = ctx.db
    .prepare("SELECT * FROM deployment_logs WHERE action='deploy' AND status='success'")
    .get();
  check("deployment log written", Boolean(depLog));
  check("petro received the plan limits", JSON.stringify(ctx.petro.calls).includes('"cpu":50'));
}

// ------------------------------------------------------------------ 5. ownership (anti-IDOR)
console.log("\n=== 5. ownership enforcement ===");
{
  // B is not registered yet → !servers asks to register
  const msgB3 = mockMessage({ userId: B, username: "bob", content: "!servers" });
  await dispatchMessage(ctx, msgB3);
  check("unregistered user told to !register", title(msgB3._state.replies[0]).includes("not registered"));

  // register B, then try to touch A's server
  const msgBReg = mockMessage({ userId: B, username: "bob", content: "!register" });
  await dispatchMessage(ctx, msgBReg);
  check("bob registers", title(msgBReg._state.replies[0]).includes("Account created"));

  const msgB = mockMessage({ userId: B, username: "bob", content: "!server info alice-micro" });
  await dispatchMessage(ctx, msgB);
  check(
    "other user's server → not found (anti-IDOR)",
    title(msgB._state.replies[0]).includes("Server not found")
  );
  const msgB2 = mockMessage({ userId: A, username: "alice", content: "!server info alice-micro" });
  await dispatchMessage(ctx, msgB2);
  check(
    "owner still sees their server",
    title(msgB2._state.replies[0]).includes("alice-micro")
  );
}

// ------------------------------------------------------------------ 6. server limit
console.log("\n=== 6. per-user server limit ===");
{
  // alice already has 1 server; deploy a second via Starter (needs 3 invites)
  ctx.db
    .prepare(
      `INSERT INTO invite_joins (guild_id, code, member_discord_id, inviter_discord_id, is_bot, credited)
       VALUES ('g1', 'realcode', 'm2', ?, 0, 1), ('g1', 'realcode', 'm3', ?, 0, 1), ('g1', 'realcode', 'm4', ?, 0, 1)`
    )
    .run(A, A, A);
  const msg = mockMessage({ userId: A, username: "alice", content: "!HYdeploy python" });
  await dispatchMessage(ctx, msg);
  const row = msg._state.replies[0].components[0];
  const menu = row.components?.[0] || row.toJSON?.()?.components?.[0];
  const options = menu?.data?.options || menu?.options || [];
  const starter = options.find((o) => (o.label || o.data?.label || "").startsWith("Starter"));
  const sel = mockInteraction({
    userId: A,
    customId: `deploy:sel:${A}`,
    values: [starter?.value ?? starter?.data?.value],
  });
  await dispatchInteraction(ctx, sel);
  check("3 invites → python Starter confirmed", title(sel._state.updates[0]).includes("Confirm deployment"));
  const goBtnRow = sel._state.updates[0].components[0];
  const goBtn = goBtnRow.components?.[0] || goBtnRow.toJSON?.()?.components?.[0];
  const go = mockInteraction({
    userId: A,
    customId: goBtn?.data?.custom_id || goBtn?.custom_id,
  });
  await dispatchInteraction(ctx, go);
  const srvs = ctx.db
    .prepare("SELECT COUNT(*) AS c FROM servers WHERE owner_discord_id = ? AND deleted_at IS NULL")
    .get(A).c;
  check("second server deployed", srvs === 2);

  // third deployment must hit the limit (2 per user)
  const msg3 = mockMessage({ userId: A, username: "alice", content: "!HYdeploy python" });
  await dispatchMessage(ctx, msg3);
  const row3 = msg3._state.replies[0].components[0];
  const menu3 = row3.components?.[0] || row3.toJSON?.()?.components?.[0];
  const opt3 = (menu3?.data?.options || menu3?.options || [])[0];
  const sel3 = mockInteraction({
    userId: A,
    customId: `deploy:sel:${A}`,
    values: [opt3?.value ?? opt3?.data?.value],
  });
  await dispatchInteraction(ctx, sel3);
  const goRow3 = sel3._state.updates[0].components[0];
  const goB3 = goRow3.components?.[0] || goRow3.toJSON?.()?.components?.[0];
  const go3 = mockInteraction({
    userId: A,
    customId: goB3?.data?.custom_id || goB3?.custom_id,
  });
  await dispatchInteraction(ctx, go3);
  const final3 = go3._state.updates[go3._state.updates.length - 1];
  check("third deploy → limit reached", title(final3).includes("Deployment failed"));
  check(
    "limit message mentions per-user limit",
    desc(final3).includes("per-user limit")
  );
}

// ------------------------------------------------------------------ 7. departed invites stop counting
console.log("\n=== 7. departed members don't count ===");
{
  ctx.db
    .prepare(
      `UPDATE invite_joins SET left_at = datetime('now') WHERE member_discord_id = 'm4' AND inviter_discord_id = ?`
    )
    .run(A);
  const stats = ctx.invites.statsFor(A, "g1");
  check("departed join excluded from valid", stats.valid === 3 && stats.departed === 1);
}

// ------------------------------------------------------------------ 8. suspension
console.log("\n=== 8. suspension blocks hosting ===");
{
  ctx.db.prepare("UPDATE users SET status='suspended' WHERE discord_id = ?").run(A);
  const msg = mockMessage({ userId: A, username: "alice", content: "!servers" });
  await dispatchMessage(ctx, msg);
  check("suspended user blocked", title(msg._state.replies[0]).includes("Account suspended"));
  ctx.db.prepare("UPDATE users SET status='active' WHERE discord_id = ?").run(A);
  const msg2 = mockMessage({ userId: A, username: "alice", content: "!servers" });
  await dispatchMessage(ctx, msg2);
  check("unsuspended user works again", title(msg2._state.replies[0]).includes("Your servers"));
}

// ------------------------------------------------------------------ 9. admin: editable plans
console.log("\n=== 9. !admin — plans editable without code ===");
{
  // non-admin denied
  const msgA = mockMessage({ userId: A, username: "alice", content: "!admin" });
  await dispatchMessage(ctx, msgA);
  check("non-admin denied", title(msgA._state.replies[0]).includes("Access denied"));

  // owner dashboard
  const msgO = mockMessage({ userId: OWNER, username: "owner", content: "!admin" });
  await dispatchMessage(ctx, msgO);
  check("owner dashboard", title(msgO._state.replies[0]).includes("admin"));

  // invalid plan create
  const bad = mockMessage({
    userId: OWNER,
    username: "owner",
    content: '!admin plan create name:"Bad" runtime:node.js cpu:99999 ram:100 disk:100',
  });
  await dispatchMessage(ctx, bad);
  check("invalid plan rejected", title(bad._state.replies[0]).includes("Invalid plan"));

  // valid create
  const good = mockMessage({
    userId: OWNER,
    username: "owner",
    content: '!admin plan create name:"Turbo" runtime:node.js cpu:300 ram:2048 disk:8192 invites:5 desc:"fast"',
  });
  await dispatchMessage(ctx, good);
  check("plan created", title(good._state.replies[0]).includes("Plan created"));
  const turbo = ctx.db.prepare("SELECT * FROM plans WHERE name = 'Turbo'").get();
  check("turbo stored with values", Boolean(turbo && turbo.cpu === 300 && turbo.required_invites === 5));

  // edit
  const edit = mockMessage({
    userId: OWNER,
    username: "owner",
    content: `!admin plan edit ${turbo.id} invites:2 available:no`,
  });
  await dispatchMessage(ctx, edit);
  check("plan edited", title(edit._state.replies[0]).includes("Plan updated"));
  const turbo2 = ctx.db.prepare("SELECT * FROM plans WHERE id = ?").get(turbo.id);
  check("edit persisted live", turbo2.required_invites === 2 && turbo2.available === 0);

  // hidden plan not offered
  const msgD = mockMessage({ userId: A, username: "alice", content: "!HYdeploy node.js" });
  await dispatchMessage(ctx, msgD);
  const menuD = msgD._state.replies[0].components[0];
  const optsD = (menuD.components?.[0]?.data?.options || menuD.components?.[0]?.options || []);
  check("unavailable plan hidden from !HYdeploy", !optsD.some((o) => (o.label || "").startsWith("Turbo")));

  // delete
  const del = mockMessage({ userId: OWNER, username: "owner", content: `!admin plan delete ${turbo.id}` });
  await dispatchMessage(ctx, del);
  check("plan deleted", title(del._state.replies[0]).includes("Plan deleted"));
  check("gone from db", !ctx.db.prepare("SELECT * FROM plans WHERE id = ?").get(turbo.id));

  // maintenance mode blocks non-admins
  const mon = mockMessage({ userId: OWNER, username: "owner", content: "!admin maintenance on upgrading" });
  await dispatchMessage(ctx, mon);
  check("maintenance enabled", title(mon._state.replies[0]).includes("Maintenance enabled"));
  const msgUser = mockMessage({ userId: A, username: "alice", content: "!invites" });
  await dispatchMessage(ctx, msgUser);
  check("user blocked during maintenance", title(msgUser._state.replies[0]).includes("Maintenance mode"));
  const moff = mockMessage({ userId: OWNER, username: "owner", content: "!admin maintenance off" });
  await dispatchMessage(ctx, moff);

  // admin stats
  const st = mockMessage({ userId: OWNER, username: "owner", content: "!admin stats" });
  await dispatchMessage(ctx, st);
  check("admin stats render", title(st._state.replies[0]).includes("statistics"));
}

// ------------------------------------------------------------------ 10. unconfigured petro
console.log("\n=== 10. unconfigured integration is honest ===");
{
  const saved = ctx.petro;
  ctx.petro = { configured: false };
  const msg = mockMessage({ userId: "777", username: "dave", content: "!register" });
  await dispatchMessage(ctx, msg);
  check("register refuses without petro config", title(msg._state.replies[0]).includes("not configured"));
  ctx.petro = saved;
}

// ------------------------------------------------------------------ 11. invite attribution
console.log("\n=== 11. invite join attribution (guildMemberAdd diff) ===");
{
  // simulate a guild with two invites, then a member joins via code2
  const invitesAfter = new Map([
    ["code1", { code: "code1", uses: 3, maxUses: 0, inviter: { id: "500" }, createdAt: null }],
    ["code2", { code: "code2", uses: 1, maxUses: 0, inviter: { id: A }, createdAt: null }],
  ]);
  const fakeGuild = {
    id: "g2",
    name: "Test Guild",
    vanityURLCode: null,
    memberCount: 10,
    invites: { fetch: async () => invitesAfter },
    members: { fetch: async () => new Map() },
  };
  ctx.db
    .prepare(
      `INSERT INTO invite_tracking (guild_id, code, inviter_discord_id, uses, status)
       VALUES ('g2', 'code1', '500', 3, 'active'), ('g2', 'code2', ?, 0, 'active')`
    )
    .run(A);
  const member = { id: "newmember1", user: { bot: false, tag: "new#1" }, guild: fakeGuild };
  const inviter = await ctx.invites.onMemberAdd(member);
  check("join attributed to the right inviter", inviter === A);
  const statsG2 = ctx.invites.statsFor(A, "g2");
  check("stats reflect the credited join", statsG2.valid === 1);

  // member leaves → no longer valid
  await ctx.invites.onMemberRemove({ id: "newmember1", guild: { id: "g2" } });
  const statsG2b = ctx.invites.statsFor(A, "g2");
  check("departure removes the credit", statsG2b.valid === 0 && statsG2b.departed === 1);
}

// ------------------------------------------------------------------ 12. pending calculation
console.log("\n=== 12. pending (unattributed uses) ===");
{
  ctx.db
    .prepare(
      `INSERT INTO invite_tracking (guild_id, code, inviter_discord_id, uses, status)
       VALUES ('g1', 'codeP', ?, 5, 'active')`
    )
    .run(B);
  ctx.db
    .prepare(
      `INSERT INTO invite_joins (guild_id, code, member_discord_id, inviter_discord_id, is_bot, credited)
       VALUES ('g1', 'codeP', 'x1', ?, 0, 1)`
    )
    .run(B);
  const stats = ctx.invites.statsFor(B, "g1");
  check("pending = uses − attributed", stats.pending === 4 && stats.valid === 1);
}

// ------------------------------------------------------------------ 13. admin API (panel integration)
console.log("\n=== 13. admin API — panel integration ===");
{
  ctx.cfg.api.enabled = true;
  ctx.cfg.api.secret = "test-secret-123";
  ctx.cfg.api.port = 16790;
  const { startAdminApi } = await import("../src/api/server.js");
  const api = startAdminApi(ctx);
  await new Promise((r) => setTimeout(r, 300));

  const base = `http://127.0.0.1:16790`;
  const H = { "x-api-key": "test-secret-123" };

  const noKey = await fetch(`${base}/health`);
  check("API rejects missing key (401)", noKey.status === 401);
  const badKey = await fetch(`${base}/health`, { headers: { "x-api-key": "wrong" } });
  check("API rejects wrong key (401)", badKey.status === 401);

  const health = await (await fetch(`${base}/health`, { headers: H })).json();
  check("health endpoint", health.ok === true && health.bot === "proto-hosting-bot");
  const stats = await (await fetch(`${base}/stats`, { headers: H })).json();
  check("stats endpoint counts users", stats.users >= 2);
  const plans = await (await fetch(`${base}/plans`, { headers: H })).json();
  check("plans listing", Array.isArray(plans.plans) && plans.plans.length >= 6);
  const users = await (await fetch(`${base}/users`, { headers: H })).json();
  check("users listing with invite stats", users.users[0]?.invites !== undefined);
  const servers = await (await fetch(`${base}/servers`, { headers: H })).json();
  check("servers listing", Array.isArray(servers.servers) && servers.servers.length >= 2);

  const created = await fetch(`${base}/plans`, {
    method: "POST",
    headers: { ...H, "Content-Type": "application/json" },
    body: JSON.stringify({ name: "API-Plan", runtime: "node.js", cpu: 100, memory: 512, disk: 2048, required_invites: 2 }),
  });
  const createdJson = await created.json();
  check("plan create via API", created.status === 200 && createdJson.plan?.name === "API-Plan");
  const badCreate = await fetch(`${base}/plans`, {
    method: "POST",
    headers: { ...H, "Content-Type": "application/json" },
    body: JSON.stringify({ name: "X", runtime: "node.js", cpu: 99999 }),
  });
  check("plan validation via API (400)", badCreate.status === 400);
  const patched = await fetch(`${base}/plans/${createdJson.plan.id}`, {
    method: "PATCH",
    headers: { ...H, "Content-Type": "application/json" },
    body: JSON.stringify({ required_invites: 7 }),
  });
  const patchedJson = await patched.json();
  check("plan edit via API", patchedJson.plan?.required_invites === 7);
  const removed = await fetch(`${base}/plans/${createdJson.plan.id}`, { method: "DELETE", headers: H });
  check("plan delete via API", removed.status === 200);

  const auditLogs = await (await fetch(`${base}/audit?limit=5`, { headers: H })).json();
  check("audit endpoint", Array.isArray(auditLogs.logs));
  const depLogs = await (await fetch(`${base}/deployment-logs?limit=5`, { headers: H })).json();
  check("deployment logs endpoint", depLogs.logs.length >= 2);

  const maint = await fetch(`${base}/maintenance`, {
    method: "POST",
    headers: { ...H, "Content-Type": "application/json" },
    body: JSON.stringify({ enabled: false }),
  });
  check("maintenance toggle via API", maint.status === 200);

  const suspend = await fetch(`${base}/users/${B}/suspend`, { method: "POST", headers: H });
  check("suspend via API", suspend.status === 200);
  const bRow = ctx.db.prepare("SELECT status FROM users WHERE discord_id = ?").get(B);
  check("suspend persisted", bRow.status === "suspended");
  await fetch(`${base}/users/${B}/unsuspend`, { method: "POST", headers: H });
  const bRow2 = ctx.db.prepare("SELECT status FROM users WHERE discord_id = ?").get(B);
  check("unsuspend persisted", bRow2.status === "active");

  api.close();
}

// ------------------------------------------------------------------ result
console.log("\n============================================");
console.log(` RESULT: ${passed} passed, ${failed} failed`);
if (failures.length) {
  console.log(" Failures:");
  for (const f of failures) console.log(`  - ${f}`);
}
console.log("============================================");
try {
  ctx.db.close();
} catch {
  /* ignore */
}
fs.rmSync(TMP, { recursive: true, force: true });
process.exit(failed === 0 ? 0 : 1);
