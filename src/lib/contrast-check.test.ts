import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

/**
 * The accessibility bar is only real if something recomputes it. These run the
 * actual script: once against the shipped token layer, and once against a
 * deliberately broken copy to prove the check can fail.
 */
const script = path.join(process.cwd(), "scripts/check-contrast.mjs");
const sheetPath = path.join(process.cwd(), "src/app/globals.css");
let workspace: string | null = null;

function run(args: string[]): { status: number; output: string } {
  try {
    return { status: 0, output: execFileSync("node", [script, ...args], { encoding: "utf8" }) };
  } catch (error) {
    const failure = error as { status: number; stdout: string; stderr: string };
    return { status: failure.status, output: `${failure.stdout}${failure.stderr}` };
  }
}

afterEach(() => {
  if (workspace) rmSync(workspace, { recursive: true, force: true });
  workspace = null;
});

describe("contrast check", () => {
  it("passes every declared pair in the shipped token layer", () => {
    const result = run(["--report"]);
    expect(result.status).toBe(0);
    expect(result.output).not.toContain("FAIL");
  });

  it("reports a ratio for every declared pair", () => {
    const lines = run(["--report"]).output.trim().split("\n");
    expect(lines.length).toBeGreaterThanOrEqual(17);
    for (const line of lines) expect(line).toMatch(/^pass\s+\d+\.\d+ : 1/);
  });

  it("fails when a token is changed to an illegible value", () => {
    workspace = mkdtempSync(path.join(tmpdir(), "contrast-"));
    const broken = readFileSync(sheetPath, "utf8").replace(
      /^(\s*--text-primary:).*$/m,
      "$1 #efe9dd;"
    );
    const file = path.join(workspace, "broken.css");
    writeFileSync(file, broken, "utf8");

    const result = run([file, "--report"]);
    expect(result.status).toBe(1);
    expect(result.output).toContain("FAIL");
    expect(result.output).toContain("panel body text");
  });
});
