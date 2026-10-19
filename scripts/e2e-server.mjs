// A task-owned server: never discovers the installed daemon or reuses desktop data.
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
const root = await mkdtemp(join(tmpdir(), "vibedesktop-e2e-"));
const child = spawn(process.execPath, ["node_modules/next/dist/bin/next", "dev", "--hostname", "127.0.0.1", "--port", process.env.VIBE_E2E_PORT || "3110"], {
  detached: true, stdio: "inherit", env: { ...process.env, VIBE_BUILD_DIR: ".next-e2e", VIBE_DATA_FILE: join(root, "desktop.json"),
    VIBE_DAEMON_RUNTIME_DIR: join(root, "daemon"), VIBE_WORKSPACES_DIR: join(root, "workspaces"), VIBE_CATALOG_STATE_DIR: join(root, "apps"),
    VIBE_CATALOG_URL: "", VIBE_LOCAL_CATALOG_FILE: join(root, "catalog.json"), VIBE_PUBLIC_ORIGIN: "", NEXT_TELEMETRY_DISABLED: "1" }
});
let stopping = false;
function stop() { if (stopping) return; stopping = true; try { process.kill(-child.pid, "SIGTERM"); } catch { /* exited */ } }
process.on("SIGINT", stop); process.on("SIGTERM", stop);
child.on("exit", async code => { await rm(root, { recursive: true, force: true }); process.exit(stopping ? 0 : code ?? 1); });
