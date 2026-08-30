import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

/**
 * A guard nobody has seen fail is not a guard. These run the real script and
 * assert on its exit code.
 *
 * The guard is budgeted against the real stylesheet, so a violation is only
 * meaningful in that context: `runGuard` appends the candidate rule to the
 * actual `globals.css` and checks whether the category goes over budget. That
 * is exactly what happens to someone who adds a literal to the product.
 */
const script = path.join(process.cwd(), "scripts/check-css-literals.mjs");
const realSheet = readFileSync(path.join(process.cwd(), "src/app/globals.css"), "utf8");
let workspace: string | null = null;

function runGuard(css: string, { withRealSheet = true } = {}): { status: number; output: string } {
  workspace ??= mkdtempSync(path.join(tmpdir(), "css-guard-"));
  const file = path.join(workspace, "sheet.css");
  writeFileSync(file, withRealSheet ? `${realSheet}\n${css}` : css, "utf8");
  try {
    const output = execFileSync("node", [script, file, "--report"], { encoding: "utf8" });
    return { status: 0, output };
  } catch (error) {
    const failure = error as { status: number; stdout: string; stderr: string };
    return { status: failure.status, output: `${failure.stdout}${failure.stderr}` };
  }
}

afterEach(() => {
  if (workspace) rmSync(workspace, { recursive: true, force: true });
  workspace = null;
});

describe("CSS literal guard", () => {
  it("passes a stylesheet that uses tokens", () => {
    const result = runGuard(`
      .panel {
        background: var(--surface-raised);
        color: var(--text-primary);
        transition: transform var(--motion-base) var(--ease-standard);
        border-radius: var(--radius-tile);
      }
    `);
    expect(result.status).toBe(0);
  });

  it("fails on a colour literal in a component rule", () => {
    const result = runGuard(`.panel { background: #ff0000; }`);
    expect(result.status).toBe(1);
    expect(result.output).toContain("color:plain");
  });

  it("fails on a bare transition duration and easing", () => {
    const result = runGuard(`.panel { transition: opacity 240ms ease-out; }`);
    expect(result.status).toBe(1);
    expect(result.output).toMatch(/duration:plain|easing:plain/);
  });

  it("fails on a hard-coded border radius", () => {
    const result = runGuard(`.panel { border-radius: 17px; }`);
    expect(result.status).toBe(1);
    expect(result.output).toContain("radius:plain");
  });

  it("allows a new literal inside a token declaration — that is where they belong", () => {
    const result = runGuard(`:root { --scrim-new: rgba(0, 0, 0, 0.4); --motion-new: 150ms; }`);
    expect(result.status).toBe(0);
  });

  it("allows literals inside the primitive @theme block", () => {
    const result = runGuard(`@theme { --color-probe: #13110f; --radius-probe: 8px; }`, { withRealSheet: false });
    expect(result.status).toBe(0);
  });

  it("ignores prose in comments", () => {
    const result = runGuard(`/* never write background: #ff0000 in a rule */ .panel { color: var(--text-primary); }`);
    expect(result.status).toBe(0);
  });

  it("keeps the real stylesheet within its recorded budgets", () => {
    const output = execFileSync("node", [script, "--report"], { encoding: "utf8" });
    expect(output).not.toContain("OVER");
  });
});
