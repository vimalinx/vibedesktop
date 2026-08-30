import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const settings = readFileSync(path.join(root, "src/components/apps/settings-panel.tsx"), "utf8");
const desktop = readFileSync(path.join(root, "src/components/vibe-desktop.tsx"), "utf8");
const windowContent = readFileSync(path.join(root, "src/components/window/window-content.tsx"), "utf8");

describe("Settings user-facing contract", () => {
  it("keeps general, appearance, start-page, and install destinations reachable", () => {
    expect(settings).toContain('"general" | "appearance" | "start" | "install"');
    expect(settings).toContain("t.settings.nav.startPage");
    expect(settings).toContain("t.settings.nav.install");
    expect(settings).toContain("onShowOnboarding");
  });

  it("wires live start-page and PWA state through the desktop window boundary", () => {
    for (const source of [desktop, windowContent, settings]) {
      expect(source).toContain("startPageUrl");
      expect(source).toContain("canPromptInstall");
      expect(source).toContain("isStandalone");
      expect(source).toContain("onInstall");
    }
    expect(desktop).toContain('window.addEventListener("beforeinstallprompt"');
    expect(desktop).toContain('window.addEventListener("appinstalled"');
  });

  it("announces normal feedback politely and errors assertively", () => {
    expect(settings).toContain('role={statusKind === "error" ? "alert" : "status"}');
    expect(settings).toContain('aria-live={statusKind === "error" ? "assertive" : "polite"}');
  });
});
