import express from "express";
import { readJSON } from "../services/db.js";
import jwt from "jsonwebtoken";
import { getJWTSecret } from "../utils/jwtSecret.js";

const router = express.Router();
import authRoutes from "./auth.js";
import serverRoutes from "./servers.js";
import systemRoutes from "./system.js";
import apiKeyRoutes from "./api-keys.js";
import nodeRoutes from "./nodes.js";
import auditRoutes from "./audit.js";
import hostingRoutes from "./hosting.js";

router.use("/auth", authRoutes);
router.use("/servers", serverRoutes);
router.use("/system", systemRoutes);
router.use("/admin/api-keys", apiKeyRoutes);
router.use("/nodes", nodeRoutes);
router.use("/audit", auditRoutes);
router.use("/hosting", hostingRoutes);

router.get("/health", (req, res) => {
  res.json({
    status: "ok",
    panel: "Proto Panel",
    version: "3.2.0",
    timestamp: Date.now(),
    nodeEnv: process.env.NODE_ENV || "development"
  });
});

router.get("/settings", async (req, res) => {
  const settings = await readJSON("settings.json") || {};
  // SECURITY: internal operational fields (defaultRuntime / isDevPanel /
  // panelPort) are only included for requests carrying a valid session.
  // Anonymous visitors (login screen) get branding + OAuth config only.
  let authenticated = false;
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith("Bearer ")) {
    try {
      jwt.verify(authHeader.split(" ")[1], getJWTSecret());
      authenticated = true;
    } catch {
      authenticated = false;
    }
  }
  const internal: Record<string, unknown> = {};
  if (authenticated) {
    internal.defaultRuntime = settings.defaultRuntime || process.env.DEFAULT_RUNTIME || "docker";
    internal.isDevPanel = (process.env.PANEL_TYPE === "dev" || process.env.PORT === "3000") && !process.env.FORCE_MAIN_PANEL;
    internal.panelPort = process.env.PORT || "6767";
  }
  res.json({ 
    version: "3.2.0",
    panelName: settings.panelName || "Proto Panel",
    // Default logo (the Proto "P" arrow) is served from /logo.png until an
    // admin uploads a custom one. Setting panelLogo to "" hides it entirely.
    panelLogo: settings.panelLogo !== undefined ? settings.panelLogo : "/logo.png",
    panelDescription: settings.panelDescription || "",
    panelBackgroundImage: settings.panelBackgroundImage || "",
    panelBackgroundBlur: settings.panelBackgroundBlur !== undefined ? settings.panelBackgroundBlur : 10,
    enablePlayit: settings.enablePlayit !== undefined ? settings.enablePlayit : false,
    enableTutorial: settings.enableTutorial !== undefined ? settings.enableTutorial : true,
    enableLoginAnimation: settings.enableLoginAnimation !== undefined ? settings.enableLoginAnimation : true,
    enableRegistration: settings.enableRegistration !== undefined ? settings.enableRegistration : true,
    theme: settings.theme || "blue",
    enableGoogleLogin: settings.enableGoogleLogin !== undefined ? settings.enableGoogleLogin : false,
    firebaseApiKey: settings.firebaseApiKey || "",
    firebaseAuthDomain: settings.firebaseAuthDomain || "",
    firebaseProjectId: settings.firebaseProjectId || "",
    firebaseStorageBucket: settings.firebaseStorageBucket || "",
    firebaseMessagingSenderId: settings.firebaseMessagingSenderId || "",
    firebaseAppId: settings.firebaseAppId || "",
    ...internal
  });
});

export default router;
