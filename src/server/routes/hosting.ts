import { Router, type Request, type Response, type NextFunction } from "express";
import { requireAuth } from "../middleware/auth.js";
import { logUnauthorizedAccess } from "../services/audit.js";

const router = Router();

/**
 * ===========================================================================
 * HOSTING BOT ADMIN API — proxy (ADMINISTRATORS ONLY)
 * ---------------------------------------------------------------------------
 * Proxies the Proto Panel web UI to the PROTO HOSTING Discord bot's local
 * admin API (discord-bot/ — plans, users, servers, audit). The bot service
 * holds the SQLite database; this proxy enforces the panel-side role check
 * so ordinary panel users can never reach hosting administration.
 * ===========================================================================
 */
router.use(requireAuth);
router.use((req: Request, res: Response, next: NextFunction) => {
  const user = (req as any).user;
  if (!user || (user.role !== "admin" && user.role !== "owner")) {
    logUnauthorizedAccess(
      req,
      "hosting.access",
      `non-admin (${user?.role || "unknown"}) attempted to access bot hosting administration`
    );
    res.status(403).json({ error: "Forbidden: Bot hosting administration requires administrator privileges" });
    return;
  }
  next();
});

const BOT_API_URL = (process.env.BOT_API_URL || "http://127.0.0.1:6790").replace(/\/+$/, "");
const BOT_API_SECRET = process.env.BOT_API_SECRET || "";

router.all(/.*/, async (req: Request, res: Response) => {
  if (!BOT_API_SECRET) {
    res.status(503).json({
      error:
        "Hosting bot integration is not configured on the panel. Set BOT_API_SECRET (matching the bot's .env) and restart.",
    });
    return;
  }
  try {
    const url = `${BOT_API_URL}${req.path}${req.url.includes("?") ? `?${req.url.split("?")[1]}` : ""}`;
    const method = req.method.toUpperCase();
    const resp = await fetch(url, {
      method,
      headers: {
        "x-api-key": BOT_API_SECRET,
        "Content-Type": "application/json",
        "User-Agent": "ProtoPanel/3.2.0",
      },
      body: method === "GET" || method === "HEAD" ? undefined : JSON.stringify(req.body || {}),
      signal: AbortSignal.timeout(8000),
    });
    const text = await resp.text();
    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch {
      json = { error: text.slice(0, 300) || `HTTP ${resp.status}` };
    }
    res.status(resp.status).json(json);
  } catch (err: any) {
    res.status(503).json({
      error:
        "The PROTO HOSTING bot service is offline. Start it with: cd discord-bot && npm install && cp .env.example .env && pm2 start ecosystem.config.cjs",
      detail: err?.code || err?.message || "connection refused",
    });
  }
});

export default router;
