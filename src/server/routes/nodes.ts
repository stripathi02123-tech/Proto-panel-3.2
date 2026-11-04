import { Router, type Request, type Response, type NextFunction } from "express";
import net from "net";
import { readJSON, writeJSON } from "../services/db.js";
import { logAudit, logUnauthorizedAccess } from "../services/audit.js";
import { v4 as uuidv4 } from "uuid";
import { requireAuth } from "../middleware/auth.js";

const router = Router();

/**
 * ===========================================================================
 * SECURITY: NODE MANAGEMENT IS ADMINISTRATOR-ONLY
 * ---------------------------------------------------------------------------
 * Every node endpoint (list, create, update, delete, health) is gated behind
 * an administrative role check. Ordinary users must NEVER be able to view
 * node configuration, edit node settings, modify allocations or connection
 * details — even by calling the API directly. Every denied attempt is
 * recorded in the audit log with the acting identity and IP.
 * ===========================================================================
 */
const requireNodeAdmin = (req: Request, res: Response, next: NextFunction) => {
  const user = (req as any).user;
  if (!user || (user.role !== "admin" && user.role !== "owner")) {
    logUnauthorizedAccess(
      req,
      "nodes.access",
      `non-admin (${user?.role || "unknown"}) attempted to access node management`
    );
    res.status(403).json({
      error: "Forbidden: Node management requires administrator privileges",
    });
    return;
  }
  next();
};

// authenticate first, then enforce the administrative role on EVERY route
router.use(requireAuth);
router.use(requireNodeAdmin);

/** TCP reachability probe with a short timeout (used for remote node health). */
function probeTcp(host: string, port: number, timeoutMs = 2000): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let settled = false;
    const done = (ok: boolean) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(ok);
    };
    socket.setTimeout(timeoutMs);
    socket.once("connect", () => done(true));
    socket.once("timeout", () => done(false));
    socket.once("error", () => done(false));
    try {
      socket.connect(port, host);
    } catch {
      done(false);
    }
  });
}

/** Health for the local node: the Docker daemon (or dev mock) answers. */
async function localNodeHealth(): Promise<{ status: string; message: string }> {
  try {
    const { getDocker } = await import("../services/docker.js");
    const docker = await getDocker("local");
    await docker.ping();
    return { status: "healthy", message: "Docker daemon reachable" };
  } catch {
    // docker unavailable — the local runtime falls back to process mode
    return { status: "degraded", message: "Docker unreachable — local runtime in process mode" };
  }
}

router.get("/", async (req, res) => {
  try {
    const wingsNodes = (await readJSON("wings_nodes.json")) || [];
    const customNodes = (await readJSON("nodes.json")) || [];

    const localNode = {
      id: "local",
      name: "Built-in Node (Local)",
      ip: "127.0.0.1",
      hostname: "localhost",
      apiPort: 3000,
      memory: 8192,
      disk: 50000,
      isLocal: true,
      status: "online",
    };

    const safeWings = wingsNodes.map((n: any) => ({ ...n, token: undefined, ip: n.hostname || n.ip }));
    const safeCustom = customNodes.map((n: any) => ({ ...n, key: undefined, token: undefined }));

    res.json([localNode, ...safeCustom, ...safeWings]);
  } catch (err) {
    console.error("Error loading nodes:", err);
    res.status(500).json({ error: "Failed to load nodes" });
  }
});

router.post("/", async (req, res) => {
  try {
    // BUGFIX: new nodes used to be written to wings_nodes.json while the
    // Docker service only ever read nodes.json — custom nodes silently fell
    // back to the local daemon. Custom nodes now go to nodes.json with the
    // normalized field names getDocker() expects (ip/port/key).
    const { name, hostname, apiUrl, token, ssl, apiPort, memory, disk, location, connectionMode } = req.body;
    if (!name || !hostname) {
      res.status(400).json({ error: "Missing node name or hostname" });
      return;
    }
    const nodes = (await readJSON("nodes.json")) || [];
    const newNode = {
      id: uuidv4(),
      name,
      ip: hostname,
      hostname,
      apiUrl: apiUrl || "",
      port: apiPort || 8080,
      apiPort: apiPort || 8080,
      key: token || "",
      token: token || "",
      ssl: !!ssl,
      memory: memory || 8192,
      disk: disk || 50000,
      location: location || "Default",
      connectionMode: connectionMode || (apiUrl ? "tunnel" : "direct"),
      createdAt: new Date().toISOString(),
    };
    nodes.push(newNode);
    await writeJSON("nodes.json", nodes);
    await logAudit(req, "nodes.create", "success", `created node "${name}" (${hostname})`, `node:${newNode.id}`);
    res.json({ success: true, node: { ...newNode, key: undefined, token: undefined } });
  } catch (err) {
    console.error("Error creating node:", err);
    res.status(500).json({ error: "Failed to save node" });
  }
});

/** Update an existing custom node (administrative action, audited). */
router.put("/:id", async (req, res) => {
  try {
    const nodes = (await readJSON("nodes.json")) || [];
    const idx = nodes.findIndex((n: any) => n.id === req.params.id);
    if (idx === -1) {
      res.status(404).json({ error: "Node not found" });
      return;
    }
    const current = nodes[idx];
    const { name, hostname, apiUrl, token, ssl, apiPort, memory, disk, location, connectionMode } = req.body;
    const updated = {
      ...current,
      name: name ?? current.name,
      hostname: hostname ?? current.hostname,
      ip: hostname ?? current.ip,
      apiUrl: apiUrl ?? current.apiUrl,
      port: apiPort ?? current.port,
      apiPort: apiPort ?? current.apiPort,
      // only replace the stored credential when a new one is supplied
      key: token || current.key,
      token: token || current.token,
      ssl: ssl !== undefined ? !!ssl : current.ssl,
      memory: memory ?? current.memory,
      disk: disk ?? current.disk,
      location: location ?? current.location,
      connectionMode: connectionMode ?? current.connectionMode,
      updatedAt: new Date().toISOString(),
    };
    nodes[idx] = updated;
    await writeJSON("nodes.json", nodes);
    await logAudit(req, "nodes.update", "success", `updated node "${updated.name}"`, `node:${updated.id}`);
    res.json({ success: true, node: { ...updated, key: undefined, token: undefined } });
  } catch (err) {
    console.error("Error updating node:", err);
    res.status(500).json({ error: "Failed to update node" });
  }
});

/** Delete a custom node — blocked while servers still run on it. */
router.delete("/:id", async (req, res) => {
  try {
    const nodes = (await readJSON("nodes.json")) || [];
    const node = nodes.find((n: any) => n.id === req.params.id);
    if (!node) {
      res.status(404).json({ error: "Node not found" });
      return;
    }
    // refuse deletion while any server is still assigned to this node
    const servers = (await readJSON("servers.json")) || [];
    const inUse = servers.filter((s: any) => s.nodeId === req.params.id);
    if (inUse.length > 0) {
      await logAudit(req, "nodes.delete", "denied", `attempted to delete node "${node.name}" still used by ${inUse.length} server(s)`, `node:${node.id}`);
      res.status(409).json({
        error: `Node is still used by ${inUse.length} server(s). Reassign or delete them first.`,
      });
      return;
    }
    await writeJSON("nodes.json", nodes.filter((n: any) => n.id !== req.params.id));
    await logAudit(req, "nodes.delete", "success", `deleted node "${node.name}"`, `node:${node.id}`);
    res.json({ success: true });
  } catch (err) {
    console.error("Error deleting node:", err);
    res.status(500).json({ error: "Failed to delete node" });
  }
});

/**
 * Real health check (was a hardcoded stub). Local node probes the Docker
 * daemon; remote nodes are TCP-probed on their configured address/port.
 */
router.get("/:id/health", async (req, res) => {
  const id = req.params.id;
  try {
    if (id === "local") {
      res.json(await localNodeHealth());
      return;
    }
    const custom = ((await readJSON("nodes.json")) || []).find((n: any) => n.id === id);
    const wings = ((await readJSON("wings_nodes.json")) || []).find((n: any) => n.id === id);
    const node = custom || wings;
    if (!node) {
      res.status(404).json({ status: "unknown", message: "Node not found" });
      return;
    }
    const host = node.ip || node.hostname;
    const port = Number(node.apiPort || node.port || 8080);
    const reachable = await probeTcp(String(host), port);
    res.json(
      reachable
        ? { status: "healthy", message: `Reachable at ${host}:${port}` }
        : { status: "offline", message: `No response from ${host}:${port}` }
    );
  } catch (err) {
    console.error("Error checking node health:", err);
    res.status(500).json({ status: "error", message: "Health check failed" });
  }
});

export default router;
