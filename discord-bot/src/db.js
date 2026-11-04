// PROTO HOSTING BOT — SQLite layer (node:sqlite, zero native deps)
// Opens the database, applies SQL migrations in order and exposes tiny
// convenience helpers. NOTE: node:sqlite does not bind JS booleans —
// always pass 0/1 for integer flags.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.resolve(__dirname, "..", "migrations");

export function openDatabase(dbPath) {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new DatabaseSync(dbPath);
  db.exec("PRAGMA journal_mode = WAL");
  db.exec("PRAGMA foreign_keys = ON");
  db.exec("PRAGMA busy_timeout = 5000");
  migrate(db);
  return db;
}

function migrate(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version    INTEGER PRIMARY KEY,
      name       TEXT NOT NULL,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);
  const applied = new Set(
    db.prepare("SELECT version FROM schema_migrations").all().map((r) => r.version)
  );
  const files = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => /^\d+_.*\.sql$/.test(f))
    .sort();
  for (const file of files) {
    const version = parseInt(file.split("_")[0], 10);
    if (applied.has(version)) continue;
    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), "utf8");
    db.exec("BEGIN");
    try {
      db.exec(sql);
      db.prepare("INSERT INTO schema_migrations (version, name) VALUES (?, ?)").run(version, file);
      db.exec("COMMIT");
      console.log(`[db] applied migration ${file}`);
    } catch (err) {
      db.exec("ROLLBACK");
      throw new Error(`migration ${file} failed: ${err.message}`);
    }
  }
}

/** Run fn inside a transaction; rolls back on throw. */
export function tx(db, fn) {
  db.exec("BEGIN");
  try {
    const out = fn();
    db.exec("COMMIT");
    return out;
  } catch (err) {
    try {
      db.exec("ROLLBACK");
    } catch {
      /* already rolled back */
    }
    throw err;
  }
}
