// PROTO HOSTING BOT — Petro Panel (Pterodactyl-compatible) API client
// Application API for accounts + provisioning, Client API for power/resources.
// The API key lives server-side only and is NEVER sent to a Discord user.

export class PetroError extends Error {
  constructor(message, { status = 0, step = "" } = {}) {
    super(message);
    this.name = "PetroError";
    this.status = status;
    this.step = step;
  }
}

const TIMEOUT_MS = 20000;

export class PetroAPI {
  constructor(petroCfg, logger) {
    this.cfg = petroCfg;
    this.log = logger.tag("petro");
  }

  get configured() {
    return Boolean(this.cfg && this.cfg.configured);
  }

  /** Application API request (ptla_ key). */
  async app(method, path, body) {
    return this._request(method, path, body, this.cfg.appKey);
  }

  /** Client API request — power, reinstall, resources, websocket. */
  async client(method, path, body) {
    return this._request(method, path, body, this.cfg.clientKey, true);
  }

  async _request(method, path, body, key, isClient = false) {
    if (!this.configured) {
      throw new PetroError(
        "Petro Panel integration is not configured (missing PETRO_PANEL_URL / PETRO_APP_KEY).",
        { step: "config" }
      );
    }
    const url = `${this.cfg.url}${path}`;
    let res;
    try {
      res = await fetch(url, {
        method,
        headers: {
          Authorization: `Bearer ${key}`,
          Accept: "application/json",
          ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
          "User-Agent": "ProtoHostingBot/1.0",
        },
        body: body !== undefined ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch (err) {
      const reason = err?.name === "TimeoutError" ? "timed out" : err?.code || err?.message;
      throw new PetroError(
        `Could not reach Petro Panel at ${this.cfg.url} (${reason}). ${isClient ? "Client API call." : "Application API call."}`,
        { status: 0, step: "network" }
      );
    }
    if (res.status === 204) return null;
    let json = null;
    const text = await res.text();
    if (text) {
      try {
        json = JSON.parse(text);
      } catch {
        /* non-json body */
      }
    }
    if (!res.ok) {
      let detail = `HTTP ${res.status}`;
      if (json?.errors) {
        const errs = Array.isArray(json.errors) ? json.errors : Object.values(json.errors);
        detail = errs.map((e) => e?.detail || e?.code || String(e)).join("; ") || detail;
      } else if (json?.message) {
        detail = json.message;
      } else if (text) {
        detail = text.slice(0, 300);
      }
      throw new PetroError(`Petro Panel error: ${detail}`, { status: res.status, step: "api" });
    }
    return json;
  }

  // ---- accounts ------------------------------------------------------------

  async findUserByExternalId(externalId) {
    const data = await this.app(
      "GET",
      `/api/application/users?filter[external_id]=${encodeURIComponent(externalId)}`
    );
    return data?.data?.[0] || null;
  }

  async findUserByEmail(email) {
    const data = await this.app(
      "GET",
      `/api/application/users?filter[email]=${encodeURIComponent(email)}`
    );
    return data?.data?.[0] || null;
  }

  async createUser({ username, email, externalId, password, firstName, lastName }) {
    const payload = {
      username,
      email,
      external_id: externalId,
      password,
      first_name: firstName || username,
      last_name: lastName || "Proto Hosting",
      root_admin: false,
      language: "en",
    };
    const data = await this.app("POST", "/api/application/users", payload);
    return data?.data || null;
  }

  async setUserSuspended(petroUserId, suspended) {
    await this.app("PATCH", `/api/application/users/${petroUserId}`, { suspended });
  }

  // ---- servers -------------------------------------------------------------

  /**
   * Provision a server on Petro Panel.
   * @param {object} o {name, petroUserId, runtime, cpu, memory, disk}
   */
  async createServer(o) {
    const runtime = o.runtime === "python" ? "python" : "node.js";
    const payload = {
      name: o.name,
      user: o.petroUserId,
      egg: this.cfg.eggs[runtime],
      docker_image: this.cfg.dockerImages[runtime],
      startup: this.cfg.startups[runtime],
      environment: { ...this.cfg.eggEnv[runtime] },
      limits: {
        memory: o.memory,
        swap: 0,
        disk: o.disk,
        io: 500,
        cpu: o.cpu,
      },
      feature_limits: {
        databases: 1,
        backups: 2,
        allocations: 0,
      },
      deploy: {
        locations: [this.cfg.location],
        dedicated_ip: false,
        port_range: [],
      },
      start_on_completion: true,
      skip_scripts: false,
      oom_disabled: false,
    };
    const data = await this.app("POST", "/api/application/servers", payload);
    const attr = data?.data?.attributes;
    if (!attr?.id) {
      throw new PetroError("Petro Panel did not return a server id for the created server.", {
        step: "provision",
      });
    }
    return {
      id: attr.id,
      identifier: attr.identifier,
      uuid: attr.uuid,
      status: attr.status || "installing",
    };
  }

  async getServer(serverId) {
    const data = await this.app("GET", `/api/application/servers/${serverId}`);
    return data?.data?.attributes || null;
  }

  async deleteServer(serverId, force = false) {
    await this.app("DELETE", `/api/application/servers/${serverId}${force ? "?force=true" : ""}`);
  }

  // ---- client API (power / resources / console) ----------------------------

  async power(identifier, signal) {
    await this.client("POST", `/api/client/servers/${identifier}/power`, { signal });
  }

  async reinstall(identifier) {
    await this.client("POST", `/api/client/servers/${identifier}/reinstall`);
  }

  async resources(identifier) {
    const data = await this.client("GET", `/api/client/servers/${identifier}/resources`);
    return data?.data?.attributes || null;
  }

  async websocketToken(identifier) {
    const data = await this.client("GET", `/api/client/servers/${identifier}/websocket`);
    return data?.data?.attributes || null; // { token, socket }
  }
}
