import { Router } from "express";
import { readJSON } from "../services/db.js";
import { logUnauthorizedAccess } from "../services/audit.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();

/**
 * Audit log access — administrators only. Ordinary users must not read the
 * security audit trail (it contains IPs, usernames and denied-attempt details).
 */
router.use(requireAuth);
router.use((req, res, next) => {
  const user = (req as any).user;
  if (!user || (user.role !== "admin" && user.role !== "owner")) {
    logUnauthorizedAccess(req, "audit.read", `non-admin (${user?.role || "unknown"}) attempted to read audit logs`);
    res.status(403).json({ error: "Forbidden: Audit logs require administrator privileges" });
    return;
  }
  next();
});

router.get("/", async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 100, 500);
    const logs = (await readJSON("audit_logs.json")) || [];
    res.json({
      total: logs.length,
      entries: logs.slice(-limit).reverse(),
    });
  } catch (err) {
    console.error("Error reading audit logs:", err);
    res.status(500).json({ error: "Failed to read audit logs" });
  }
});

export default router;
