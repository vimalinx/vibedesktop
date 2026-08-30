import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const siteRoot = path.join(process.cwd(), "site");
const html = readFileSync(path.join(siteRoot, "index.html"), "utf8");
const css = readFileSync(path.join(siteRoot, "styles.css"), "utf8");
const script = readFileSync(path.join(siteRoot, "app.js"), "utf8");
const headers = readFileSync(path.join(siteRoot, "_headers"), "utf8");

describe("public product site contract", () => {
  it("points installation and release actions at the public v0.1.8 repository", () => {
    expect(html).toContain("releases/latest/download/install-app.sh | sh");
    expect(html).toContain("releases/tag/v0.1.8");
    expect(html).toContain("github.com/vimalinx/vibedesktop");
  });

  it("keeps executable and style content in CSP-compatible external files", () => {
    expect(html).toContain('<script src="/app.js" defer></script>');
    expect(html).toContain('<link rel="stylesheet" href="/styles.css">');
    expect(html).not.toMatch(/<script(?![^>]*src=)/);
    expect(html).not.toContain("<style");
    expect(headers).toContain("Content-Security-Policy:");
    expect(headers).toContain("frame-ancestors 'none'");
  });

  it("provides responsive, reduced-motion, focus, and live copy feedback", () => {
    expect(css).toContain("@media (max-width: 620px)");
    expect(css).toContain("@media (prefers-reduced-motion: reduce)");
    expect(css).toContain(":focus-visible");
    expect(html).toContain('role="status" aria-live="polite"');
    expect(script).toContain("navigator.clipboard.writeText");
  });
});
