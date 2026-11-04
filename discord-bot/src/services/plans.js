// PROTO HOSTING BOT — plan management (DB is the single source of truth)
// Used by both the !admin command family and the panel admin API.

const RUNTIMES = ["node.js", "python"];

/** Parse `key:value` args. Supports quoted values: name:"Starter Plus" */
export function parseKv(args) {
  const out = {};
  const re = /(\w+):(?:"([^"]*)"|'([^']*)'|(\S+))/g;
  const joined = args.join(" ");
  let m;
  while ((m = re.exec(joined)) !== null) {
    out[m[1].toLowerCase()] = m[2] ?? m[3] ?? m[4] ?? "";
  }
  return out;
}

/** Validate + normalize plan fields. Returns { errors: [], values: {} } */
export function validatePlanFields(input, { partial = false, existing = null } = {}) {
  const errors = [];
  const values = {};

  // friendly aliases used by !admin plan create|edit and the panel editor
  const norm = { ...input };
  if (norm.ram !== undefined && norm.memory === undefined) norm.memory = norm.ram;
  if (norm.invites !== undefined && norm.required_invites === undefined) {
    norm.required_invites = norm.invites;
  }

  const name = norm.name ?? existing?.name;
  if (norm.name !== undefined || !partial) {
    const n = String(name ?? "").trim();
    if (n.length < 2 || n.length > 32) errors.push("name must be 2-32 characters");
    else values.name = n;
  }

  const runtime = norm.runtime ?? existing?.runtime;
  if (norm.runtime !== undefined || !partial) {
    const v = String(runtime ?? "").toLowerCase();
    if (["node.js", "nodejs", "node", "js"].includes(v)) values.runtime = "node.js";
    else if (["python", "python3", "py"].includes(v)) values.runtime = "python";
    else errors.push("runtime must be node.js or python");
  }

  const num = (key, min, max, label, unit) => {
    const raw = norm[key];
    if (raw === undefined) return;
    const n = parseInt(raw, 10);
    if (!Number.isFinite(n) || n < min || n > max) {
      errors.push(`${label} must be ${min}-${max} ${unit}`);
    } else {
      values[key] = n;
    }
  };
  num("cpu", 25, 800, "cpu", "%");
  num("memory", 128, 32768, "memory (ram)", "MiB");
  num("disk", 256, 262144, "disk", "MiB");
  num("required_invites", 0, 100000, "required_invites (invites)", "invites");
  num("sort_order", 0, 9999, "sort_order", "");

  if (norm.available !== undefined) {
    const v = String(norm.available).toLowerCase();
    if (["1", "true", "yes", "on"].includes(v)) values.available = 1;
    else if (["0", "false", "no", "off"].includes(v)) values.available = 0;
    else errors.push("available must be yes/no");
  }
  if (norm.description !== undefined) {
    values.description = String(norm.description).slice(0, 200);
  }

  // required-on-create fields
  if (!partial) {
    for (const [key, label] of [
      ["cpu", "cpu"],
      ["memory", "memory (ram)"],
      ["disk", "disk"],
    ]) {
      if (values[key] === undefined) errors.push(`${label} is required`);
    }
    if (values.required_invites === undefined) values.required_invites = 0;
    if (values.available === undefined) values.available = 1;
    if (values.sort_order === undefined) values.sort_order = 100;
    if (values.description === undefined) values.description = "";
  }
  return { errors, values };
}

export function listPlans(db, { runtime = null, availableOnly = false } = {}) {
  const conds = [];
  const params = [];
  if (runtime) {
    conds.push("runtime = ?");
    params.push(runtime);
  }
  if (availableOnly) conds.push("available = 1");
  const where = conds.length ? `WHERE ${conds.join(" AND ")}` : "";
  return db
    .prepare(`SELECT * FROM plans ${where} ORDER BY sort_order, name`)
    .all(...params);
}

export function getPlan(db, id) {
  return db.prepare("SELECT * FROM plans WHERE id = ?").get(parseInt(id, 10));
}

export function createPlan(db, values) {
  const r = db
    .prepare(
      `INSERT INTO plans (name, runtime, cpu, memory, disk, required_invites, available, description, sort_order)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      values.name,
      values.runtime,
      values.cpu,
      values.memory,
      values.disk,
      values.required_invites ?? 0,
      values.available ?? 1,
      values.description ?? "",
      values.sort_order ?? 100
    );
  return getPlan(db, r.lastInsertRowid);
}

export function updatePlan(db, id, values) {
  const existing = getPlan(db, id);
  if (!existing) return null;
  const merged = { ...existing, ...values };
  db.prepare(
    `UPDATE plans SET name=?, runtime=?, cpu=?, memory=?, disk=?, required_invites=?, available=?, description=?, sort_order=?, updated_at=datetime('now')
     WHERE id = ?`
  ).run(
    merged.name,
    merged.runtime,
    merged.cpu,
    merged.memory,
    merged.disk,
    merged.required_invites,
    merged.available,
    merged.description,
    merged.sort_order,
    existing.id
  );
  return getPlan(db, id);
}

export function deletePlan(db, id) {
  const existing = getPlan(db, id);
  if (!existing) return null;
  const inUse = db
    .prepare("SELECT COUNT(*) AS c FROM servers WHERE plan_id = ? AND deleted_at IS NULL")
    .get(existing.id);
  if (inUse.c > 0) {
    const err = new Error(`${inUse.c} server(s) still use this plan — they keep running, but the plan will no longer be offered`);
    err.code = "IN_USE";
    throw err;
  }
  db.prepare("DELETE FROM plans WHERE id = ?").run(existing.id);
  return existing;
}
