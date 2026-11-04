import { readJSON, writeJSON } from "./db.js";
import { v4 as uuidv4 } from "uuid";
import type { Request } from "express";

/**
 * Audit logging service — security-relevant events are persisted to
 * .data/audit_logs.json (rotating, capped). Used by the admin Activity Log
 * page and by authorization middleware to record unauthorized attempts.
 */

export interface AuditEntry {
  id: string;
  timestamp: string;
  actorId: string;
  actorName: string;
  actorRole: string;
  action: string;          // e.g. "nodes.create", "auth.denied"
  resource: string;        // e.g. "node:uuid", "route:/api/nodes"
  ip: string;
  userAgent: string;
  outcome: "success" | "denied" | "failure";
  details: string;
}

const MAX_AUDIT_ENTRIES = 2000;

function clientIp(req: Request): string {
  const fwd = req.headers["x-forwarded-for"];
  if (typeof fwd === "string" && fwd.length > 0) return fwd.split(",")[0].trim();
  if (Array.isArray(fwd) && fwd.length > 0) return String(fwd[0]);
  return req.socket?.remoteAddress || "unknown";
}

export async function logAudit(
  req: Request,
  action: string,
  outcome: AuditEntry["outcome"],
  details: string,
  resource = ""
): Promise<void> {
  try {
    const user = (req as any).user;
    const entry: AuditEntry = {
      id: uuidv4(),
      timestamp: new Date().toISOString(),
      actorId: user?.id || "anonymous",
      actorName: user?.username || "anonymous",
      actorRole: user?.role || "none",
      action,
      resource: resource || req.originalUrl?.split("?")[0] || req.path,
      ip: clientIp(req),
      userAgent: String(req.headers["user-agent"] || "").slice(0, 200),
      outcome,
      details,
    };
    const logs = (await readJSON("audit_logs.json")) || [];
    logs.push(entry);
    // cap the log so it cannot grow unbounded
    while (logs.length > MAX_AUDIT_ENTRIES) logs.shift();
    await writeJSON("audit_logs.json", logs);
    // console signal for admins watching systemd/pm2 logs
    if (outcome !== "success") {
      console.warn(
        `[audit] ${outcome.toUpperCase()} ${action} by ${entry.actorName} (${entry.actorRole}) from ${entry.ip}: ${details}`
      );
    }
  } catch (err) {
    // auditing must never break the request path
    console.error("audit write failed:", err);
  }
}

/**
 * Record an unauthorized administrative access attempt.
 * Called after authentication succeeded but authorization failed (403),
 * so the acting identity is known — this is the IDOR/privilege-escalation
    // signal admins care about.
 */
export async function logUnauthorizedAccess(
  req: Request,
  action: string,
  details: string
): Promise<void> {
  await logAudit(req, action, "denied", details);
}
