import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import type { LocalAppDiscoveryCandidate } from "@/lib/contracts";

const execFileAsync = promisify(execFile);
const MAX_CANDIDATES = 200;
const MAX_OUTPUT_BYTES = 4 * 1024 * 1024;

export class LocalAppDiscoveryError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "LocalAppDiscoveryError";
  }
}

type ScanRunner = (scriptPath: string, projectRoot: string) => Promise<string>;

/** Run the fixed, project-owned scanner and reduce its output to a UI-safe contract. */
export async function discoverLocalWebApps(
  projectRoot: string,
  runScan: ScanRunner = defaultScanRunner
): Promise<LocalAppDiscoveryCandidate[]> {
  const scriptPath = path.join(projectRoot, ".claude", "skills", "add_app", "scan.py");
  let stdout: string;
  try {
    stdout = await runScan(scriptPath, projectRoot);
  } catch (error) {
    throw new LocalAppDiscoveryError("Local WebUI discovery failed.", { cause: error });
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(stdout);
  } catch (error) {
    throw new LocalAppDiscoveryError("The local WebUI scanner returned invalid JSON.", { cause: error });
  }
  if (!Array.isArray(parsed)) throw new LocalAppDiscoveryError("The local WebUI scanner returned an invalid candidate list.");

  return parsed.slice(0, MAX_CANDIDATES).map(normalizeCandidate).filter((item): item is LocalAppDiscoveryCandidate => item !== null);
}

async function defaultScanRunner(scriptPath: string, projectRoot: string): Promise<string> {
  const result = await execFileAsync("python3", [scriptPath], {
    cwd: projectRoot,
    timeout: 30_000,
    maxBuffer: MAX_OUTPUT_BYTES,
    encoding: "utf8"
  });
  return result.stdout;
}

function normalizeCandidate(value: unknown): LocalAppDiscoveryCandidate | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  const name = boundedString(raw.name, 160);
  const source = boundedString(raw.source, 500);
  const note = boundedString(raw.note, 500);
  const port = Number(raw.port);
  const command = raw.command === null ? null : boundedString(raw.command, 1000);
  const cwd = raw.cwd === null || raw.cwd === undefined ? null : boundedString(raw.cwd, 2000);
  const args = Array.isArray(raw.args)
    ? raw.args.slice(0, 100).map((arg) => boundedString(arg, 4000)).filter((arg): arg is string => arg !== null)
    : [];
  if (!name || !source || !note || !Number.isInteger(port) || port < 1 || port > 65535) return null;

  const registerable = raw.registerable === true && Boolean(command);
  return {
    name,
    source,
    port,
    command,
    args,
    cwd,
    running: raw.running === true,
    registerable,
    alreadyRegistered: raw.already_registered === true,
    dev: raw.dev === true,
    note
  };
}

function boundedString(value: unknown, maxLength: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed && trimmed.length <= maxLength ? trimmed : null;
}
