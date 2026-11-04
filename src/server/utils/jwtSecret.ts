import fs from "fs-extra";
import path from "path";
import crypto from "crypto";

/**
 * Shared JWT secret.
 *
 * SECURITY FIX (was CRITICAL):
 * Previously every module fell back to the hardcoded string
 * "proto-panel-super-secret", which meant anyone could forge admin/owner
 * tokens on installations that did not set JWT_SECRET.
 *
 * Now: if the env var is missing, a strong random secret is generated once,
 * persisted to .data/.jwt-secret and re-used across restarts (so existing
 * sessions keep working). A warning is logged recommending JWT_SECRET in env.
 */
let cachedSecret: string | null = null;

export const getJWTSecret = (): string => {
  if (cachedSecret) return cachedSecret;

  if (process.env.JWT_SECRET && process.env.JWT_SECRET.length >= 16) {
    cachedSecret = process.env.JWT_SECRET;
    return cachedSecret;
  }

  if (process.env.JWT_SECRET && process.env.JWT_SECRET.length < 16) {
    console.warn("[Auth] JWT_SECRET is set but too short (<16 chars). Generating a secure random secret instead.");
  } else {
    console.warn("[Auth] JWT_SECRET is not set. Generating a secure random secret (stored in .data/.jwt-secret).");
    console.warn("[Auth] For multi-instance deployments, set the same JWT_SECRET environment variable everywhere.");
  }

  const secretPath = path.join(process.cwd(), ".data", ".jwt-secret");
  try {
    if (fs.existsSync(secretPath)) {
      const existing = fs.readFileSync(secretPath, "utf-8").trim();
      if (existing.length >= 32) {
        cachedSecret = existing;
        return cachedSecret;
      }
    }
    const generated = crypto.randomBytes(48).toString("hex");
    fs.ensureDirSync(path.join(process.cwd(), ".data"));
    fs.writeFileSync(secretPath, generated, { mode: 0o600 });
    cachedSecret = generated;
  } catch (err) {
    // Last resort: ephemeral random secret (sessions reset on restart)
    console.error("[Auth] Could not persist generated JWT secret, using ephemeral secret:", err);
    cachedSecret = crypto.randomBytes(48).toString("hex");
  }
  return cachedSecret;
};
