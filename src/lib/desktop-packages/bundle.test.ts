import { normalizeWindowPatch } from "@/protocol/shell/window-patch";
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { validateBundle, builtInPackages, maxPackageBytes } from "./bundle";
import type { DesktopPackageBundle } from "@/protocol/shell/package";
import { packageCompatibility } from "@/protocol/v1/package";
const bundle = (): DesktopPackageBundle => JSON.parse(readFileSync("public/desktop-packages/windows.vibepack.json", "utf8"));
describe("portable desktop packages", () => {
  it("ships two complete compatible packages built from the reviewed HTML CSS JS and asset sources", () => {
    for (const pack of builtInPackages) {
      const b = validateBundle(JSON.parse(readFileSync(`public${pack.url}`, "utf8")));
      expect(b.manifest.id).toBe(pack.id); expect(packageCompatibility(b.manifest).compatible).toBe(true);
      expect(b.files[b.entry.module].text).toBe(readFileSync("public/desktop-packages/source/shell.js", "utf8"));
      expect(b.files[b.entry.css].text).toBe(readFileSync("public/desktop-packages/source/shell.css", "utf8"));
      expect(b.files["content.css"].text).toBe(readFileSync("public/desktop-packages/source/content.css", "utf8"));
      expect(b.files["wallpaper.svg"].text).toBe(readFileSync(`public/desktop-packages/source/${pack.style}.svg`, "utf8"));
    }
  });
  it("accepts native web assets without restricting CSS or JavaScript features", () => {
    const b = bundle(); b.files["shader.wgsl"] = { mediaType: "text/plain", text: "@fragment fn main() {}" };
    b.files["font.woff2"] = { mediaType: "font/woff2", base64: "aGk=" }; b.files["scene.wasm"] = { mediaType: "application/wasm", base64: "aGk=" };
    expect(validateBundle(b)).toBe(b);
  });
  it.each(["../outside.js", "/absolute.js", "file://secret", "a/../b.js", "a//b.js"])("rejects ambiguous asset path %s", name => {
    const b = bundle(); b.files[name] = { mediaType: "text/javascript", text: "" }; expect(() => validateBundle(b)).toThrow();
  });
  it("rejects missing entries, invalid media, unsupported shell versions and oversized data", () => {
    const b = bundle(); delete b.files[b.entry.module]; expect(() => validateBundle(b)).toThrow();
    const c = bundle(); c.files[c.entry.module].mediaType = "text/html"; expect(() => validateBundle(c)).toThrow();
    const d = bundle(); d.shell.minMinor = 99; expect(() => validateBundle(d)).toThrow();
    const e = bundle(); e.files["large.bin"] = { mediaType: "text/plain", text: "a".repeat(maxPackageBytes) }; expect(() => validateBundle(e)).toThrow();
  });
  it("requires one encoding per asset and valid base64", () => {
    const b = bundle(); b.files["bad.png"] = { mediaType: "image/png", base64: "!bad" }; expect(() => validateBundle(b)).toThrow();
    b.files["bad.png"] = { mediaType: "image/png", base64: "aGk=", text: "hi" }; expect(() => validateBundle(b)).toThrow();
  });
});

it("does not let package geometry updates overwrite application identity", () => {
  expect(normalizeWindowPatch({ id: "other", app: {}, z: 999, x: NaN, y: -40, width: 1, height: Infinity, mode: "bad", maximized: "yes" })).toEqual({ y: 0, width: 280 });
});
