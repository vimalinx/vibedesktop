import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const siteRoot = path.join(process.cwd(), "site");
const html = readFileSync(path.join(siteRoot, "index.html"), "utf8");
const css = readFileSync(path.join(siteRoot, "styles.css"), "utf8");
const script = readFileSync(path.join(siteRoot, "app.js"), "utf8");
const headers = readFileSync(path.join(siteRoot, "_headers"), "utf8");
const publisherPath = path.join(process.cwd(), "scripts", "publish-public.mjs");
const publisher = existsSync(publisherPath) ? readFileSync(publisherPath, "utf8") : null;

describe("public product site contract", () => {
  it("points installation and source actions at the public repository", () => {
    expect(html).toContain("releases/latest/download/install-app.sh | sh");
    expect(html).toContain("https://github.com/vimalinx/vibedesktop");
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

  it.runIf(publisher !== null)("publishes a sanitized append-only commit and tag without rewriting public history", () => {
    expect(publisher).toContain("--push --tag v1.2.3");
    expect(publisher).toContain('git("push", "--atomic"');
    expect(publisher).toContain("public tag ${tag} already exists; release tags are immutable");
    expect(publisher).not.toContain('git("push", "--force"');
  });
});
