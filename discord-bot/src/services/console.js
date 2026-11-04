// PROTO HOSTING BOT — wings console bridge
// Connects to the server's websocket (socket.io v2 — the protocol used by
// Pterodactyl-compatible wings) to stream console output and send commands.
// Token is fetched per-connection via the client API and kept in memory only.
import ioPkg from "socket.io-client";
const io = ioPkg.default || ioPkg;

const ANSI = /[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g;

export function stripAnsi(s) {
  return String(s || "").replace(ANSI, "");
}

/**
 * Open a console session and collect output for `durationMs`.
 * Optionally send a command immediately after connecting.
 * Returns { ok, lines[] | error }.
 */
export async function consoleSession(petro, identifier, { durationMs = 12000, command = null } = {}) {
  let token;
  try {
    token = await petro.websocketToken(identifier);
  } catch (err) {
    return { ok: false, error: `Could not open console session: ${err.message}` };
  }
  if (!token?.token || !token?.socket) {
    return { ok: false, error: "Panel did not return a websocket session for this server." };
  }

  return new Promise((resolve) => {
    const lines = [];
    let settled = false;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try {
        socket.close();
      } catch {
        /* ignore */
      }
      resolve(result);
    };

    const socket = io(token.socket, {
      transports: ["websocket"],
      query: { token: token.token },
      reconnection: false,
      timeout: 8000,
    });

    const push = (line) => {
      const clean = stripAnsi(line).trimEnd();
      if (clean) lines.push(clean.length > 120 ? `${clean.slice(0, 120)}…` : clean);
      if (lines.length > 300) lines.shift();
    };

    socket.on("connect", () => {
      if (command) {
        try {
          socket.emit("send command", command);
        } catch {
          /* ignore */
        }
      }
    });
    // wings eras differ on the event name — listen to both
    socket.on("console output", (line) => push(typeof line === "object" ? line.line : line));
    socket.on("console", (line) => push(typeof line === "object" ? line.line : line));
    socket.on("connect_error", (err) => {
      if (lines.length === 0) {
        finish({ ok: false, error: `Console connection failed: ${err?.message || err}` });
      }
    });
    socket.on("error", () => {
      if (lines.length === 0) {
        finish({ ok: false, error: "Console connection was refused by the node." });
      }
    });

    const timer = setTimeout(() => finish({ ok: true, lines }), durationMs);
  });
}
