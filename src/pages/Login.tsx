import React, { useState } from "react";
import { LoadingOverlay } from "../components/LoadingOverlay";
import { useAuth } from "../context/AuthContext";
import { useSettings } from "../context/SettingsContext";
import { useNavigate, Link } from "react-router-dom";
import axios from "axios";
import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth, GoogleAuthProvider, signInWithPopup } from "firebase/auth";
import { User, Lock, ArrowRight, Zap } from "lucide-react";
import "./Login.css";

/**
 * PROTO PANEL — premium login.
 *
 * NOTE: the old GSAP "cinematic desert intro" (8s parallax + camera shake
 * before the login card appeared) was intentionally removed — the panel now
 * opens directly on the authentication interface. The logged-in tutorial /
 * explainer (TutorialOverlay) is NOT affected and still works.
 */
export default function Login() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const { login } = useAuth();
  const {
    panelName, panelLogo, panelDescription, enableRegistration,
    enableGoogleLogin, firebaseApiKey, firebaseAuthDomain, firebaseProjectId,
    firebaseStorageBucket, firebaseMessagingSenderId, firebaseAppId
  } = useSettings();
  const navigate = useNavigate();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError("");
    try {
      const res = await axios.post("/api/auth/login", { username, password });
      login(res.data.token, res.data.user);
      navigate("/");
    } catch (err: any) {
      setError(err.response?.data?.error || "Login failed");
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    if (!firebaseApiKey || !firebaseProjectId) {
      setError("Firebase Google Login is not configured by administrator yet.");
      return;
    }
    setIsLoading(true);
    setError("");

    try {
      const fbConfig = {
        apiKey: firebaseApiKey,
        authDomain: firebaseAuthDomain,
        projectId: firebaseProjectId,
        storageBucket: firebaseStorageBucket,
        messagingSenderId: firebaseMessagingSenderId,
        appId: firebaseAppId
      };

      const app = getApps().length === 0 ? initializeApp(fbConfig) : getApp();
      const auth = getAuth(app);
      const provider = new GoogleAuthProvider();

      const result = await signInWithPopup(auth, provider);
      const googleUser = result.user;

      if (!googleUser.email) {
        throw new Error("No email associated with this Google account");
      }

      const res = await axios.post("/api/auth/google", {
        email: googleUser.email,
        googleId: googleUser.uid,
        name: googleUser.displayName || "",
        photoURL: googleUser.photoURL || ""
      });

      login(res.data.token, res.data.user);
      navigate("/");
    } catch (err: any) {
      console.error("Google Auth Error:", err);
      if (err.code === "auth/popup-closed-by-user") {
        setError("Google Login popup was closed before completing.");
      } else if (err.code === "auth/unauthorized-domain") {
        setError("This domain is not authorized in Firebase Console -> Auth settings -> Authorized Domains.");
      } else if (err.code === "auth/too-many-many-requests" || err.response?.status === 429 || err.message?.includes("429")) {
        setError("Too many login requests. Please wait a minute and try again.");
      } else {
        setError(err.response?.data?.error || err.message || "Google Authentication failed. Please check your Firebase configuration.");
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="pp-login-page">
      {/* ambient aurora lighting */}
      <div className="pp-login-aurora" aria-hidden="true" />
      <div className="pp-login-grid" aria-hidden="true" />

      <div className="pp-login-card qx-enter">
        <div className="pp-login-brand">
          {panelLogo ? (
            <img src={panelLogo} alt="Panel logo" className="pp-login-logo" />
          ) : (
            <div className="pp-login-logo pp-login-logo-fallback">
              <Zap size={26} strokeWidth={2.4} />
            </div>
          )}
          <div className="pp-login-brand-text">
            <h1 className="pp-login-title">{panelName}</h1>
            <p className="pp-login-tagline">Game Server Management</p>
          </div>
        </div>

        <p className="pp-login-subtitle">
          {panelDescription || "Sign in to your account to continue"}
        </p>

        <form onSubmit={handleLogin} className="pp-login-form">
          {error && (
            <div className="pp-login-error" role="alert">
              <span className="pp-login-error-dot" />
              {error}
            </div>
          )}

          <label className="pp-login-field">
            <User size={16} className="pp-login-field-icon" aria-hidden="true" />
            <input
              type="text"
              name="username"
              required
              autoComplete="username"
              placeholder="Username"
              className="pp-login-input"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
            />
            <span className="pp-login-field-line" />
          </label>

          <label className="pp-login-field">
            <Lock size={16} className="pp-login-field-icon" aria-hidden="true" />
            <input
              type="password"
              name="password"
              required
              autoComplete="current-password"
              placeholder="Password"
              className="pp-login-input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <span className="pp-login-field-line" />
          </label>

          <button type="submit" className="pp-login-submit" disabled={isLoading}>
            {isLoading ? "Authenticating…" : "Sign In"}
            {!isLoading && <ArrowRight size={16} className="pp-login-submit-arrow" />}
          </button>
        </form>

        {enableGoogleLogin && (
          <div className="pp-login-divider-row">
            <span className="pp-login-divider-line" />
            <span className="pp-login-divider-text">OR</span>
            <span className="pp-login-divider-line" />
          </div>
        )}

        {enableGoogleLogin && (
          <button type="button" onClick={handleGoogleLogin} disabled={isLoading} className="pp-login-google">
            <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
              <path fill="#EA4335" d="M12 5c1.6 0 3 .6 4.1 1.6l3.1-3.1C17.3 1.7 14.8 1 12 1 7.5 1 3.7 3.6 1.9 7.3l3.7 2.9C6.5 7.3 9 5 12 5z"/>
              <path fill="#4285F4" d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.6h6.5c-.3 1.5-1.1 2.8-2.4 3.7l3.7 2.9c2.2-2 3.7-5 3.7-8.9z"/>
              <path fill="#FBBC05" d="M5.6 14.8c-.2-.7-.4-1.5-.4-2.3s.2-1.6.4-2.3L1.9 7.3C.7 9.7 0 12.3 0 15s.7 5.3 1.9 7.7l3.7-2.9z"/>
              <path fill="#34A853" d="M12 23c3.2 0 6-1.1 8-3l-3.7-2.9c-1.1.7-2.5 1.2-4.3 1.2-3 0-5.5-2.3-6.4-5.2L1.9 16C3.7 19.7 7.5 22.3 12 23z"/>
            </svg>
            Sign in with Google
          </button>
        )}

        {enableRegistration !== false && (
          <p className="pp-login-register">
            Don't have an account?{" "}
            <Link to="/register">Create one</Link>
          </p>
        )}
      </div>

      <p className="pp-login-footer">PROTO PANEL · SECURE ACCESS</p>

      {isLoading && <LoadingOverlay message="Authenticating..." />}
    </div>
  );
}
