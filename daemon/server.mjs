// @ts-check
/**
 * vibe-daemon — local webapp process manager for Vibe Desktop.
 *
 * Listens on 127.0.0.1:7780 (or next free port). All requests require
 * Authorization: Bearer <token> where token lives in the private runtime dir.
 *
 * Run:  node daemon/server.mjs
 */
import http from "node:http";
import { randomBytes, timingSafeEqual } from "node:crypto";
import { mkdir, writeFile, readFile, chmod } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { ProcessManager } from "./process-manager.mjs";
import { ConfigStore } from "./config-store.mjs";
import { resolveRuntimeVersion } from "./version.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");
// Installed deployments split durable configuration, operational state, and
// ephemeral endpoint discovery according to XDG. VIBE_DAEMON_DATA_DIR remains
// a compatibility umbrella for older installers and isolated tests.
const developmentDir = path.join(projectRoot, ".data");
const legacyDataDir = process.env.VIBE_DAEMON_DATA_DIR
  ? path.resolve(process.env.VIBE_DAEMON_DATA_DIR)
  : null;
const configDir = path.resolve(process.env.VIBE_DAEMON_CONFIG_DIR || legacyDataDir || developmentDir);
const stateDir = path.resolve(process.env.VIBE_DAEMON_STATE_DIR || legacyDataDir || developmentDir);
const runtimeDir = path.resolve(process.env.VIBE_DAEMON_RUNTIME_DIR || legacyDataDir || developmentDir);
const tokenFile = path.join(runtimeDir, "daemon.token");
const portFile = path.join(runtimeDir, "daemon.port");
const DEFAULT_PORT = 7780;

const startedAt = Date.now();

async function ensureToken() {
  try {
    const existing = await readFile(tokenFile, "utf8");
    if (existing.trim().length >= 32) return existing.trim();
  } catch { /* missing — generate below */ }
  const token = randomBytes(32).toString("hex");
  await mkdir(runtimeDir, { recursive: true, mode: 0o700 });
  await writeFile(tokenFile, token + "\n", { encoding: "utf8", mode: 0o600 });
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
  const given = Buffer.from(auth.slice(7));
  const expected = Buffer.from(token);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

/**
 * Bind the first free loopback port from `start`, retrying on EADDRINUSE so a
 * port taken between probing and binding cannot crash the daemon.
 * @param {http.Server} server @param {number} start @returns {Promise<number>}
 */
async function listenOnFreePort(server, start) {
  for (let p = start; p < start + 100; p += 1) {
    const bound = await new Promise((resolve, reject) => {
      const onError = (/** @type {NodeJS.ErrnoException} */ error) => {
        server.off("listening", onListening);
        if (error.code === "EADDRINUSE" || error.code === "EACCES") resolve(false);
        else reject(error);
      };
      const onListening = () => {
        server.off("error", onError);
        resolve(true);
      };
      server.once("error", onError);
      server.once("listening", onListening);
      server.listen(p, "127.0.0.1");
    });
    if (bound) return p;
  }
  throw new Error(`no free loopback port in ${start}..${start + 99}`);
}

async function main() {
  await Promise.all([
    mkdir(configDir, { recursive: true, mode: 0o700 }),
    mkdir(stateDir, { recursive: true, mode: 0o700 }),
    mkdir(runtimeDir, { recursive: true, mode: 0o700 }),
  ]);
  const token = await ensureToken();
  const VERSION = await resolveRuntimeVersion(__dirname);
  const configStore = new ConfigStore(configDir);
  const manager = new ProcessManager({ logDir: path.join(stateDir, "logs") });
  await manager.init();

  const configs = await configStore.load();
  // Autostart flagged apps
  for (const cfg of configs) {
    if (cfg.autoStart) {
      try { await manager.start(cfg); } catch (e) { console.error(`[autostart] ${cfg.name}: ${e.message}`); }
    }
  }

  let port = DEFAULT_PORT;
  const server = http.createServer(async (req, res) => {
    // Browsers never talk to the daemon directly, so there is no CORS surface.
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
            await configStore.get(id); // 404 before queueing
            await manager.control(id, action2, () => configStore.get(id));
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
            await manager.control(id, "restart", () => configStore.get(id));
          }
          payload = manager.withStatus(cfg);
        } else if (req.method === "DELETE") {
          // Stop and removal share the app's control queue, so a start queued
          // behind this delete cannot spawn an unreachable orphan process.
          // Stop also cancels a supervisor timer for an already-exited process.
          await manager.serialize(id, async () => {
            await manager.stop(id);
            await configStore.remove(id);
            await manager.deleteLogs(id);
          });
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

      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify(payload));
    } catch (err) {
      const code = err.code === "not_found" ? 404 : 400;
      res.writeHead(code, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: { code: err.code || "bad_request", message: err.message } }));
    }
  });

  port = await listenOnFreePort(server, DEFAULT_PORT);
  // Publish the port only once it is actually bound.
  await writeFile(portFile, String(port) + "\n", { encoding: "utf8", mode: 0o600 });
  try { await chmod(portFile, 0o600); } catch { /* windows */ }
  {
    console.log(`[vibe-daemon] listening on http://127.0.0.1:${port}`);
    console.log(`[vibe-daemon] token written to ${tokenFile}`);
    console.log(`[vibe-daemon] managing ${configs.length} app(s), ${configs.filter((c) => c.autoStart).length} auto-started`);
  }

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
