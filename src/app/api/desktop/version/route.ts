import { NextResponse } from "next/server";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { apiError, rejectCrossOriginMutation, invalidJsonBody, readJsonObject } from "@/lib/api-response";
import {
  installedVersion,
  updateStateFile,
  versionStatus,
} from "@/lib/app-version";
const exec = promisify(execFile);
export const runtime = "nodejs";
export async function GET(request: Request) {
  try {
    return NextResponse.json(
      await versionStatus(
        new URL(request.url).searchParams.get("check") === "1",
      ),
    );
  } catch (error) {
    return apiError(
      503,
      "version_check_failed",
      error instanceof Error ? error.message : "Version check failed",
    );
  }
}
export async function POST(request: Request) {
  const denied = rejectCrossOriginMutation(request);
  if (denied) return denied;
  try {
    const input = await readJsonObject(request);
    if (!input) return invalidJsonBody();
    if (
      (input.action !== "update" && input.action !== "rollback") ||
      input.confirm !== true
    )
      return apiError(
        400,
        "confirmation_required",
        "Confirm update or rollback.",
      );
    const info = await installedVersion();
    if (!info.managed || !info.appRoot)
      return apiError(
        409,
        "not_installed",
        "Only the installed desktop can manage its version.",
      );
    if (input.action === "update" && (!info.repo || info.local))
      return apiError(
        409,
        "local_build",
        "Local builds must be updated from a reviewed local build.",
      );
    if (input.action === "rollback" && !info.previous)
      return apiError(409, "no_previous", "No previous version is available.");
    const active = await exec(
      "systemctl",
      ["--user", "is-active", "vibedesktop-update.service"],
      { timeout: 3000 },
    )
      .then((r) => r.stdout.trim() === "active")
      .catch(() => false);
    if (active)
      return apiError(409, "update_busy", "An update is already running.");
    const stateFile = updateStateFile();
    await mkdir(path.dirname(stateFile), { recursive: true, mode: 0o700 });
    const port = process.env.VIBE_APP_PORT || "3000";
    if (!/^\d{1,5}$/.test(port)) throw Error("Invalid app port.");
    // A separate systemd unit survives the app service restart. No user-supplied shell or paths.
    await exec(
      "systemd-run",
      [
        "--user",
        "--collect",
        "--unit=vibedesktop-update",
        "--property=UMask=0077",
        `--setenv=PATH=${path.dirname(process.execPath)}:/usr/local/bin:/usr/bin:/bin`,
        process.execPath,
        path.join(process.cwd(), "daemon/release/app-ui-update.mjs"),
        input.action,
        info.appRoot,
        stateFile,
        `http://127.0.0.1:${port}`,
        info.repo || "",
        process.env.VIBE_DATA_FILE || "",
      ],
      { timeout: 10000 },
    );
    return NextResponse.json({ ok: true, state: "running" });
  } catch (error) {
    const detail =
      error instanceof Error ? error.message : "Version operation failed";
    return apiError(503, "version_operation_failed", detail);
  }
}
