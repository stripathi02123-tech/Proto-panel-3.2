import express from "express";
import { login, logout, getMe, getUsers, changePassword, changeUsername, register, googleLogin } from "../controllers/auth.js";
import { requireAuth, requireAdmin } from "../middleware/auth.js";

const router = express.Router();

router.post("/register", register);
router.post("/login", login);
router.post("/google", googleLogin);
router.post("/logout", logout);
router.get("/me", requireAuth, getMe);
// SECURITY FIX: was requireAuth — any logged-in user could enumerate every
// account (usernames + roles). Admin-only now (an admin copy already existed
// at /api/system/users).
router.get("/users", requireAdmin, getUsers);
router.put("/password", requireAuth, changePassword);
router.put("/username", requireAuth, changeUsername);

export default router;
