// PROTO HOSTING BOT — configuration loader
// All credentials come from environment variables. Nothing is ever hardcoded
// and nothing sensitive is ever exposed to Discord users.
import path from "node:path";
import { fileURLToPath } from "node:url";
import "dotenv/config";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const ROOT_DIR = path.resolve(__dirname, "..");

export const RUNTIMES = ["node.js", "python"];

/** Normalize user input like "nodejs", "js", "python3" to a canonical runtime. */
export function normalizeRuntime(input) {
  const v = String(input || "").trim().toLowerCase();
  if (["node.js", "nodejs", "node", "js", "javascript"].includes(v)) return "node.js";
  if (["python", "python3", "py"].includes(v)) return "python";
  return null;
}

const toInt = (v, d) => {
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : d;
};
const toBool = (v, d) => {
  if (v === undefined || v === null || v === "") return d;
  return ["1", "true", "yes", "on"].includes(String(v).toLowerCase());
};
const parseJsonObj = (v, fallback) => {
  if (!v) return fallback;
  try {
    const parsed = JSON.parse(v);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : fallback;
  } catch {
    return fallback;
  }
};

export function loadConfig(env = process.env) {
  const petroUrl = String(env.PETRO_PANEL_URL || "").trim().replace(/\/+$/, "");
  const appKey = String(env.PETRO_APP_KEY || "").trim();

  const cfg = {
    version: "1.0.0",
    brand: "PROTO HOSTING",
    token: String(env.DISCORD_BOT_TOKEN || "").trim(),
    prefix: String(env.BOT_PREFIX || "!").trim(),
    ownerIds: String(env.BOT_OWNER_IDS || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
    dbPath: path.resolve(ROOT_DIR, env.BOT_DB_PATH || "data/proto-hosting.db"),
    logDir: path.resolve(ROOT_DIR, env.BOT_LOG_DIR || "logs"),
    logLevel: String(env.BOT_LOG_LEVEL || "info").toLowerCase(),
    testMode: toBool(env.PROTO_BOT_TEST, false),
    serverLimitPerUser: Math.max(1, toInt(env.PETRO_SERVER_LIMIT_PER_USER, 2)),
    petro: {
      url: petroUrl,
      appKey,
      clientKey: String(env.PETRO_CLIENT_KEY || "").trim() || appKey,
      configured: Boolean(petroUrl && appKey),
      location: toInt(env.PETRO_LOCATION, 1),
      eggs: {
        "node.js": toInt(env.PETRO_EGG_NODEJS, 5),
        python: toInt(env.PETRO_EGG_PYTHON, 6),
      },
      dockerImages: {
        "node.js": env.PETRO_IMAGE_NODEJS || "ghcr.io/pterodactyl/yolks:nodejs_20",
        python: env.PETRO_IMAGE_PYTHON || "ghcr.io/pterodactyl/yolks:python_3.12",
      },
      startups: {
        "node.js": env.PETRO_STARTUP_NODEJS || "node {{STARTUP_FILE}}",
        python: env.PETRO_STARTUP_PYTHON || "python {{STARTUP_FILE}}",
      },
      eggEnv: {
        "node.js": parseJsonObj(env.PETRO_EGG_ENV_NODEJS, { STARTUP_FILE: "index.js" }),
        python: parseJsonObj(env.PETRO_EGG_ENV_PYTHON, { STARTUP_FILE: "main.py" }),
      },
      emailDomain: String(env.PETRO_EMAIL_DOMAIN || "proto.hosting").toLowerCase(),
    },
    api: {
      enabled: toBool(env.BOT_API_ENABLED, true),
      host: env.BOT_API_HOST || "127.0.0.1",
      port: toInt(env.BOT_API_PORT, 6790),
      secret: String(env.BOT_API_SECRET || ""),
    },
  };
  return cfg;
}

/** Human-readable setup problems that should block startup (never crash silently). */
export function validateConfig(cfg) {
  const problems = [];
  if (!cfg.token && !cfg.testMode) problems.push("DISCORD_BOT_TOKEN is missing (copy .env.example to .env)");
  if (cfg.ownerIds.length === 0) problems.push("BOT_OWNER_IDS is empty — nobody would be able to use !admin");
  if (!cfg.petro.configured) problems.push("PETRO_PANEL_URL / PETRO_APP_KEY missing — !register and !HYdeploy will refuse until configured");
  if (cfg.api.enabled && !cfg.api.secret) problems.push("BOT_API_SECRET is empty — set it or disable the admin API with BOT_API_ENABLED=false");
  return problems;
}
