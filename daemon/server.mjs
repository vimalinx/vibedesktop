// @ts-check
/**
 * vibe-daemon — local webapp process manager for Vibe Desktop.
 *
 * Listens on 127.0.0.1:7780 (or next free port). All requests require
 * Authorization: Bearer <token> where token lives in .data/daemon.token.
 *
 * Run:  node daemon/server.mjs
 */
import http from "node:http";
import { randomBytes } from "node:crypto";
import { mkdir, writeFile, readFile, chmod } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { ProcessManager } from "./process-manager.mjs";
import { ConfigStore } from "./config-store.mjs";
import { resolveRuntimeVersion } from "./version.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");
// Tests and packaged runtimes can keep daemon state outside a repository
// checkout. The default preserves existing local-development behavior.
const dataDir = path.resolve(process.env.VIBE_DAEMON_DATA_DIR || path.join(projectRoot, ".data"));
const tokenFile = path.join(dataDir, "daemon.token");
const portFile = path.join(dataDir, "daemon.port");
const DEFAULT_PORT = 7780;

const startedAt = Date.now();

async function ensureToken() {
  try {
    const existing = await readFile(tokenFile, "utf8");
    if (existing.trim().length >= 32) return existing.trim();
  } catch { /* missing — generate below */ }
  const token = randomBytes(32).toString("hex");
  await mkdir(dataDir, { recursive: true });
  await writeFile(tokenFile, token + "\n", { encoding: "utf8" });
  try { await chmod(tokenFile, 0o600); } catch { /* windows */ }
  return token;
}

/**
 * @param {http.IncomingMessage} req
 * @param {string} token
 */
function isAuthorized(req, token) {
  const auth = req.headers["authorization"];
  if (!auth || !auth.startsWith("Bearer ")) return false;
  return auth.slice(7) === token;
}

/** @param {number} port */
async function findFreePort(port) {
  for (let p = port; p < port + 100; p += 1) {
    const free = await new Promise((resolve) => {
      const probe = http.createServer();
      probe.once("error", () => resolve(false));
      probe.once("listening", () => probe.close(() => resolve(true)));
      probe.listen(p, "127.0.0.1");
    });
    if (free) return p;
  }
  return port; // give up, let the real listen() throw a clear error
}

async function main() {
  await mkdir(dataDir, { recursive: true });
  const token = await ensureToken();
  const VERSION = await resolveRuntimeVersion(__dirname);
  const configStore = new ConfigStore(dataDir);
  const manager = new ProcessManager({ logDir: path.join(dataDir, "logs") });
  await manager.init();

  const configs = await configStore.load();
  // Autostart flagged apps
  for (const cfg of configs) {
    if (cfg.autoStart) {
      try { await manager.start(cfg); } catch (e) { console.error(`[autostart] ${cfg.name}: ${e.message}`); }
    }
  }

  const port = await findFreePort(DEFAULT_PORT);
  await writeFile(portFile, String(port) + "\n", "utf8");

  const server = http.createServer(async (req, res) => {
    // CORS preflight (in case browser ever talks to it; shouldn't happen normally)
    if (req.method === "OPTIONS") {
      res.writeHead(204, { "access-control-allow-origin": "*", "access-control-allow-headers": "authorization, content-type", "access-control-allow-methods": "GET, POST, PATCH, DELETE, OPTIONS" });
      res.end();
      return;
    }

    if (!isAuthorized(req, token)) {
      res.writeHead(401, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: { code: "unauthorized", message: "missing or invalid bearer token" } }));
      return;
    }

    const url = new URL(req.url || "/", `http://127.0.0.1:${port}`);
    const pathname = url.pathname;
    const segments = pathname.split("/").filter(Boolean);
    const body = await readJsonBody(req);
    let payload = null;

    try {
      // GET /health
      if (req.method === "GET" && segments.length === 1 && segments[0] === "health") {
        payload = { ok: true, version: VERSION, uptime: Math.floor((Date.now() - startedAt) / 1000) };
      }
      // GET /apps
      else if (req.method === "GET" && segments.length === 1 && segments[0] === "apps") {
        const all = await configStore.load();
        payload = { apps: all.map((cfg) => manager.withStatus(cfg)) };
      }
      // POST /apps
      else if (req.method === "POST" && segments.length === 1 && segments[0] === "apps") {
        const cfg = await configStore.create(body || {});
        payload = manager.withStatus(cfg);
      }
      // /apps/:id sub-routes
      else if (segments.length === 3 && segments[0] === "apps") {
        const [, id, action] = segments;
        if (action === "control" && req.method === "POST") {
          const action2 = body?.action;
          if (action2 !== "start" && action2 !== "stop" && action2 !== "restart") {
            throw Object.assign(new Error("action must be start | stop | restart"), { code: "invalid_request" });
          }
          // start/restart need the config from store so callers don't have to resend it
          if (action2 === "start" || action2 === "restart") {
            const cfg = await configStore.get(id);
            await manager.control(id, action2, cfg);
          } else {
            await manager.control(id, action2);
          }
          payload = manager.withStatus(await configStore.get(id));
        } else if (action === "logs" && req.method === "GET") {
          const logs = await manager.getLogs(id);
          res.writeHead(200, { "content-type": "application/json" });
          res.end(JSON.stringify({ logs }));
          return;
        } else {
          res.writeHead(404, { "content-type": "application/json" });
          res.end(JSON.stringify({ error: { code: "not_found", message: `unknown action ${action}` } }));
          return;
        }
      }
      // /apps/:id
      else if (segments.length === 2 && segments[0] === "apps") {
        const [, id] = segments;
        if (req.method === "GET") {
          payload = manager.withStatus(await configStore.get(id));
        } else if (req.method === "PATCH") {
          const cfg = await configStore.update(id, body || {});
          // If running or waiting for supervised restart, restart with the new
          // persisted config so a stale timer cannot resurrect the old command.
          if (manager.isRunning(id) || manager.hasPendingRestart(id)) {
            await manager.control(id, "restart", cfg);
          }
          payload = manager.withStatus(cfg);
        } else if (req.method === "DELETE") {
          // Stop also cancels a supervisor timer for an already-exited process.
          await manager.control(id, "stop");
          await configStore.remove(id);
          await manager.deleteLogs(id);
          payload = { deleted: id };
        } else {
          res.writeHead(405, { "content-type": "application/json" });
          res.end(JSON.stringify({ error: { code: "method_not_allowed" } }));
          return;
        }
      } else {
        res.writeHead(404, { "content-type": "application/json" });
        res.end(JSON.stringify({ error: { code: "not_found", message: pathname } }));
        return;
      }

      res.writeHead(200, { "content-type": "application/json", "access-control-allow-origin": "*" });
      res.end(JSON.stringify(payload));
    } catch (err) {
      const code = err.code === "not_found" ? 404 : 400;
      res.writeHead(code, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: { code: err.code || "bad_request", message: err.message } }));
    }
  });

  server.listen(port, "127.0.0.1", () => {
    console.log(`[vibe-daemon] listening on http://127.0.0.1:${port}`);
    console.log(`[vibe-daemon] token written to ${tokenFile}`);
    console.log(`[vibe-daemon] managing ${configs.length} app(s), ${configs.filter((c) => c.autoStart).length} auto-started`);
  });

  const shutdown = async () => {
    console.log("\n[vibe-daemon] shutting down, stopping managed processes…");
    await manager.stopAll();
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 2000).unref();
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

/** @param {http.IncomingMessage} req */
function readJsonBody(req) {
  return new Promise((resolve) => {
    let buf = "";
    req.on("data", (chunk) => { buf += chunk; if (buf.length > 1_000_000) req.destroy(); });
    req.on("end", () => {
      if (!buf) return resolve(null);
      try { resolve(JSON.parse(buf)); } catch { resolve(null); }
    });
    req.on("error", () => resolve(null));
  });
}

main().catch((err) => {
  console.error("[vibe-daemon] fatal:", err);
  process.exit(1);
});
