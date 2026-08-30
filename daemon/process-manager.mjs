// @ts-check
/**
 * ProcessManager — spawns, stops, and tracks local webapp processes.
 *
 * Each app's stdout/stderr is captured into a ring buffer (last 1000 lines)
 * so the daemon can serve logs without touching disk.
 */
import { spawn } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { appendFile, mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { prepareSpawnOptions, readProcessGroupUsage, signalProcessTree } from "./platform/linux.mjs";

const MAX_LOG_LINES = 1000;
const MAX_LOG_BYTES = 5 * 1024 * 1024;
const STOP_GRACE_MS = 3000;
const METRICS_INTERVAL_MS = 2000;
// Supervision: restart policy backoff ladder.
const RESTART_STABLE_MS = 30_000; // uptime after which restartCount resets
const RESTART_MAX = 5;            // give up after this many rapid restarts
const RESTART_MAX_DELAY_MS = 30_000;

/**
 * @typedef {{
 *   id: string; name: string; command: string; args?: string[]; cwd?: string;
 *   port: number; env?: Record<string, string>; autoStart?: boolean;
 *   createdAt: string; updatedAt: string;
 * }} LocalAppConfig
 *
 * @typedef {{
 *   id: string; running: boolean; pid: number | null; startedAt: string | null;
 *   url: string; lastExitCode: number | null; lastError: string | null;
 * }} LocalAppStatus
 */

/** @typedef {{ cpuPercent: number; memoryBytes: number; processCount: number; readBytes: number; writeBytes: number; sampledAt: string | null }} RuntimeMetrics */
/** @typedef {{ cpuTicks: number; totalCpuTicks: number }} MetricSample */
/** @typedef {{ proc: import("node:child_process").ChildProcess; startedAt: string; logs: string[]; lastExitCode: number | null; lastError: string | null; exited: boolean; stopping?: boolean; restartCount?: number; restartTimer?: NodeJS.Timeout | null; port?: number; healthy?: boolean | null; metrics?: RuntimeMetrics; metricSample?: MetricSample | null }} Runtime */

export class ProcessManager {
  /** @param {{ logDir?: string | null }} [options] */
  constructor(options = {}) {
    /** @type {Map<string, Runtime>} */
    this.runtimes = new Map();
    /** @type {Map<string, Promise<void>>} */
    this.controlTails = new Map();
    /** @type {Map<string, Promise<void>>} */
    this.logWriteTails = new Map();
    this.logDir = options.logDir ? path.resolve(options.logDir) : null;
    this.metricsSampling = false;
    // Refresh `healthy` on each running app every 5s — whether the port is
    // actually serving HTTP, not just whether the process is alive.
    this.healthTimer = setInterval(() => {
      this._probeHealth().catch(() => undefined);
    }, 5000);
    if (typeof this.healthTimer.unref === "function") this.healthTimer.unref();
    this.metricsTimer = setInterval(() => {
      this._sampleMetrics().catch(() => undefined);
    }, METRICS_INTERVAL_MS);
    if (typeof this.metricsTimer.unref === "function") this.metricsTimer.unref();
  }

  async init() {
    if (this.logDir) await mkdir(this.logDir, { recursive: true, mode: 0o700 });
  }

  /**
   * @param {LocalAppConfig} cfg
   */
  async start(cfg) {
    if (this.isRunning(cfg.id)) {
      await this.stop(cfg.id);
    }
    // Carry crash history across restarts so the backoff ladder accumulates
    // and logs survive a supervised restart (manual restart resets via stop()).
    const prev = this.runtimes.get(cfg.id);
    const cmd = cfg.command;
    const args = cfg.args || [];
    /** @type {import("node:child_process").SpawnOptions} */
    const opts = prepareSpawnOptions({
      cwd: cfg.cwd || undefined,
      env: { ...process.env, ...(cfg.env || {}) },
      stdio: ["ignore", "pipe", "pipe"],
      shell: false,
    });

    const proc = spawn(cmd, args, opts);
    const runtime = /** @type {Runtime} */ ({
      proc,
      startedAt: new Date().toISOString(),
      logs: prev?.logs ?? [],
      lastExitCode: null,
      lastError: null,
      exited: false,
      stopping: false,
      restartCount: prev?.restartCount ?? 0,
      restartTimer: null,
      port: cfg.port,
      healthy: null,
      metrics: emptyMetrics(),
      metricSample: null,
    });

    const pushLog = (/** @type {string} */ label, /** @type {Buffer} */ chunk) => {
      const lines = chunk.toString("utf8").split(/\r?\n/).filter(Boolean);
      for (const line of lines) {
        const stamped = `[${new Date().toISOString()}] ${label} ${line}`;
        runtime.logs.push(stamped);
        if (runtime.logs.length > MAX_LOG_LINES) runtime.logs.shift();
        this._persistLogLine(cfg.id, stamped);
        console.log(`[${cfg.name}] ${line}`);
      }
    };

    proc.stdout?.on("data", (/** @type {Buffer} */ chunk) => pushLog("stdout", chunk));
    proc.stderr?.on("data", (/** @type {Buffer} */ chunk) => pushLog("stderr", chunk));

    proc.on("error", (err) => {
      runtime.lastError = err.message;
      console.error(`[${cfg.name}] spawn error:`, err.message);
    });

    proc.on("exit", (code, signal) => {
      runtime.lastExitCode = typeof code === "number" ? code : null;
      runtime.exited = true;
      console.log(`[${cfg.name}] exited code=${code} signal=${signal}`);
      // Supervision: restart unless this exit came from an explicit stop().
      if (!runtime.stopping && this.shouldRestart(cfg, code)) {
        this.scheduleRestart(cfg, runtime);
      } else {
        runtime.restartCount = 0;
      }
    });

    this.runtimes.set(cfg.id, runtime);
    void this._sampleRuntimeMetrics(runtime);
    return runtime;
  }

  /**
   * Stop a running app. SIGTERM, escalate to SIGKILL after STOP_GRACE_MS.
   * @param {string} id
   */
  async stop(id) {
    const rt = this.runtimes.get(id);
    if (!rt) return;
    rt.stopping = true; // explicit stop — the exit listener must not auto-restart
    if (rt.restartTimer) {
      clearTimeout(rt.restartTimer);
      rt.restartTimer = null;
    }
    rt.restartCount = 0;
    // An exited process can still be managed: its supervisor may be waiting for
    // the backoff timer above. Cancelling that timer is the complete stop action.
    if (rt.exited) return;
    return new Promise((resolve) => {
      let settled = false;
      const done = () => { if (!settled) { settled = true; resolve(undefined); } };
      rt.proc.once("exit", done);
      signalProcessTree(rt.proc, "SIGTERM");
      const killer = setTimeout(() => {
        if (!settled) {
          signalProcessTree(rt.proc, "SIGKILL");
        }
      }, STOP_GRACE_MS);
      killer.unref();
      // Failsafe: don't hang forever even if exit event is missed
      setTimeout(done, STOP_GRACE_MS + 1500).unref();
    });
  }

  /**
   * Whether a process that exited with `code` should be supervised-restarted
   * per the config's restart policy.
   * @param {LocalAppConfig} cfg
   * @param {number | null} code
   * @returns {boolean}
   */
  shouldRestart(cfg, code) {
    if (cfg.restart !== "always" && cfg.restart !== "on-crash") return false;
    if (cfg.restart === "always") return true;
    return code !== 0; // on-crash: non-zero or signal-killed (null) → restart; clean 0 → no
  }

  /**
   * Schedule a supervised restart with exponential backoff. Gives up after
   * RESTART_MAX rapid restarts; resets the ladder once the process stayed up
   * longer than RESTART_STABLE_MS.
   * @param {LocalAppConfig} cfg
   * @param {Runtime} rt
   */
  scheduleRestart(cfg, rt) {
    const startedAtMs = rt.startedAt ? Date.parse(rt.startedAt) : Date.now();
    if (Date.now() - startedAtMs >= RESTART_STABLE_MS) {
      rt.restartCount = 0;
    }
    rt.restartCount = (rt.restartCount || 0) + 1;
    if (rt.restartCount > RESTART_MAX) {
      rt.lastError = `supervisor: gave up after ${RESTART_MAX} rapid restarts`;
      rt.restartCount = 0;
      console.error(`[${cfg.name}] ${rt.lastError}`);
      return;
    }
    const delay = Math.min(RESTART_MAX_DELAY_MS, 500 * 2 ** rt.restartCount);
    rt.lastError = `supervisor: restarting in ${Math.round(delay / 1000)}s (attempt ${rt.restartCount}/${RESTART_MAX})`;
    console.log(`[${cfg.name}] ${rt.lastError}`);
    rt.restartTimer = setTimeout(() => {
      rt.restartTimer = null;
      this.start(cfg).catch((/** @type {Error} */ e) => {
        rt.lastError = `supervisor: restart failed: ${e.message}`;
      });
    }, delay);
    if (typeof rt.restartTimer.unref === "function") rt.restartTimer.unref();
  }

  /**
   * Probe each running app's port so `healthy` reflects whether it's actually
   * serving HTTP (vs. the process merely being alive). Called on a timer.
   */
  async _probeHealth() {
    const targets = [];
    for (const rt of this.runtimes.values()) {
      if (!rt.exited && rt.proc.pid && rt.port) targets.push(rt);
    }
    await Promise.all(targets.map((rt) => this._probeOne(rt)));
  }

  /** @param {Runtime} rt */
  async _probeOne(rt) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 2000);
    try {
      await fetch(`http://localhost:${rt.port}/`, { signal: controller.signal });
      rt.healthy = true;
    } catch {
      rt.healthy = false; // refused, timed out, or reset — not serving yet
    } finally {
      clearTimeout(timer);
    }
  }

  stopHealthMonitor() {
    if (this.healthTimer) {
      clearInterval(this.healthTimer);
      this.healthTimer = null;
    }
    if (this.metricsTimer) {
      clearInterval(this.metricsTimer);
      this.metricsTimer = null;
    }
  }

  async _sampleMetrics() {
    if (this.metricsSampling) return;
    this.metricsSampling = true;
    try {
      const targets = [...this.runtimes.values()].filter((rt) => !rt.exited && rt.proc.pid);
      await Promise.all(targets.map((rt) => this._sampleRuntimeMetrics(rt)));
    } finally {
      this.metricsSampling = false;
    }
  }

  /** @param {Runtime} rt */
  async _sampleRuntimeMetrics(rt) {
    const pid = rt.proc.pid;
    if (!pid || rt.exited) return;
    const usage = await readProcessGroupUsage(pid);
    if (rt.exited) return;
    const previous = rt.metricSample;
    const processDelta = previous ? usage.cpuTicks - previous.cpuTicks : 0;
    const systemDelta = previous ? usage.totalCpuTicks - previous.totalCpuTicks : 0;
    const cpuPercent = systemDelta > 0
      ? Math.max(0, (processDelta / systemDelta) * os.cpus().length * 100)
      : 0;
    rt.metricSample = { cpuTicks: usage.cpuTicks, totalCpuTicks: usage.totalCpuTicks };
    rt.metrics = {
      cpuPercent: Number(cpuPercent.toFixed(1)),
      memoryBytes: usage.memoryBytes,
      processCount: usage.processCount,
      readBytes: usage.readBytes,
      writeBytes: usage.writeBytes,
      sampledAt: new Date().toISOString()
    };
  }

  /**
   * @param {string} id
   * @param {"start" | "stop" | "restart"} action
   * @param {LocalAppConfig} [cfg]  required for start/restart
   */
  async control(id, action, cfg) {
    if (action !== "start" && action !== "stop" && action !== "restart") {
      throw Object.assign(new Error("action must be start | stop | restart"), { code: "invalid_request" });
    }
    return this.#queueControl(id, async () => {
      if (action === "stop") {
        await this.stop(id);
        return;
      }
      if (action === "start") {
        if (!cfg) throw Object.assign(new Error("config required for start/restart"), { code: "bad_request" });
        // Start is idempotent at the control boundary. A duplicate HTTP
        // request must not create another process or turn a start into a
        // surprise restart.
        if (!this.isRunning(id)) await this.start(cfg);
        return;
      }
      if (!cfg) throw Object.assign(new Error("config required for start/restart"), { code: "bad_request" });
      await this.stop(id);
      await this.start(cfg);
    });
  }

  /**
   * Serialize state-changing controls per application. A rejected request must
   * not block later controls for the same application.
   *
   * @param {string} id
   * @param {() => Promise<void>} operation
   * @returns {Promise<void>}
   */
  #queueControl(id, operation) {
    const prior = this.controlTails.get(id) ?? Promise.resolve();
    const result = prior.then(operation, operation);
    const tail = result.catch(() => undefined);
    this.controlTails.set(id, tail);
    void tail.finally(() => {
      if (this.controlTails.get(id) === tail) this.controlTails.delete(id);
    });
    return result;
  }

  /**
   * @param {string} id
   */
  isRunning(id) {
    const rt = this.runtimes.get(id);
    return Boolean(rt && !rt.exited && rt.proc.pid);
  }

  /**
   * Whether supervision has queued a new process after an exit.
   * @param {string} id
   */
  hasPendingRestart(id) {
    return Boolean(this.runtimes.get(id)?.restartTimer);
  }

  /**
   * @param {string} id
   */
  async getLogs(id) {
    await this.logWriteTails.get(id);
    if (this.logDir) {
      try {
        return tailLines(await readFile(this._logPath(id), "utf8"));
      } catch (error) {
        if (/** @type {NodeJS.ErrnoException} */ (error).code !== "ENOENT") throw error;
      }
    }
    const rt = this.runtimes.get(id);
    return rt ? rt.logs.slice() : [];
  }

  /** @param {string} id */
  async deleteLogs(id) {
    await this.logWriteTails.get(id);
    if (this.logDir) await rm(this._logPath(id), { force: true });
    const rt = this.runtimes.get(id);
    if (rt) rt.logs = [];
  }

  /** @param {string} id @param {string} line */
  _persistLogLine(id, line) {
    if (!this.logDir) return;
    const prior = this.logWriteTails.get(id) ?? Promise.resolve();
    const write = prior.then(async () => {
      await mkdir(this.logDir, { recursive: true, mode: 0o700 });
      const logPath = this._logPath(id);
      await appendFile(logPath, `${line}\n`, { encoding: "utf8", mode: 0o600 });
      const info = await stat(logPath);
      if (info.size <= MAX_LOG_BYTES) return;
      const compacted = tailLines(await readFile(logPath, "utf8"));
      const temporary = `${logPath}.${process.pid}.${randomUUID()}.tmp`;
      await writeFile(temporary, compacted.length ? `${compacted.join("\n")}\n` : "", { encoding: "utf8", mode: 0o600 });
      await rename(temporary, logPath);
    });
    const settled = write.catch((error) => {
      console.error(`[vibe-daemon] log persistence failed for ${id}:`, error.message);
    });
    this.logWriteTails.set(id, settled);
    void settled.finally(() => {
      if (this.logWriteTails.get(id) === settled) this.logWriteTails.delete(id);
    });
  }

  /** @param {string} id */
  _logPath(id) {
    if (!this.logDir) throw new Error("log directory is not configured");
    const digest = createHash("sha256").update(id).digest("hex");
    return path.join(this.logDir, `${digest}.log`);
  }

  async flushLogs() {
    await Promise.all([...this.logWriteTails.values()]);
  }

  /**
   * Attach runtime status to a config snapshot.
   * @param {LocalAppConfig} cfg
   * @returns {LocalAppStatus}
   */
  withStatus(cfg) {
    const rt = this.runtimes.get(cfg.id);
    // Use the explicit `exited` flag set by the exit listener, not proc.exitCode
    // (which can lag the actual process death by a tick).
    const running = rt ? !rt.exited && Boolean(rt.proc.pid) : false;
    return {
      ...cfg,
      running,
      pid: running && rt?.proc.pid ? rt.proc.pid : null,
      startedAt: rt?.startedAt ?? null,
      // `localhost` (not 127.0.0.1) so the browser picks whichever family the
      // app actually bound — astro/vite/etc. default to `localhost`, which on
      // many systems resolves to ::1 only, leaving an IPv4 127.0.0.1 URL refused.
      url: `http://localhost:${cfg.port}`,
      lastExitCode: rt?.lastExitCode ?? null,
      lastError: rt?.lastError ?? null,
      restartCount: rt?.restartCount ?? 0,
      healthy: rt ? rt.healthy === true : false,
      cpuPercent: running ? rt?.metrics?.cpuPercent ?? 0 : 0,
      memoryBytes: running ? rt?.metrics?.memoryBytes ?? 0 : 0,
      processCount: running ? rt?.metrics?.processCount ?? 0 : 0,
      readBytes: running ? rt?.metrics?.readBytes ?? 0 : 0,
      writeBytes: running ? rt?.metrics?.writeBytes ?? 0 : 0,
      sampledAt: running ? rt?.metrics?.sampledAt ?? null : null,
    };
  }

  async stopAll() {
    const ids = [...this.runtimes.keys()];
    await Promise.all(ids.map((id) => this.stop(id)));
    await this.flushLogs();
  }
}

function emptyMetrics() {
  return {
    cpuPercent: 0,
    memoryBytes: 0,
    processCount: 0,
    readBytes: 0,
    writeBytes: 0,
    sampledAt: null
  };
}

/** @param {string} contents */
function tailLines(contents) {
  return contents.split(/\r?\n/).filter(Boolean).slice(-MAX_LOG_LINES);
}
