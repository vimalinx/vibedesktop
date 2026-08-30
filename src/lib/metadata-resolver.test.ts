import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  checkLocalAppEmbeddability,
  checkUrlEmbeddability,
  classifyEmbeddingPolicy,
  extractMetadataFromHtml
} from "@/lib/metadata-resolver";

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
  vi.restoreAllMocks();
});

describe("metadata resolver", () => {
  it("extracts metadata when attributes are not in a fixed order", () => {
    const metadata = extractMetadataFromHtml(
      `
        <html>
          <head>
            <meta content="Better title" property="og:title">
            <meta content="Useful description" name="description">
            <link href="/apple-touch-icon.png" sizes="180x180" rel="apple-touch-icon">
          </head>
        </html>
      `,
      new URL("https://example.com/path")
    );

    expect(metadata.title).toBe("Better title");
    expect(metadata.description).toBe("Useful description");
    expect(metadata.iconCandidates[0]).toBe("https://example.com/apple-touch-icon.png");
    expect(metadata.iconCandidates).toContain("https://example.com/favicon.ico");
  });

  it("marks x-frame-options sameorigin as blocked for a different embedding origin", () => {
    const headers = new Headers({
      "x-frame-options": "SAMEORIGIN"
    });

    expect(classifyEmbeddingPolicy(headers, new URL("https://example.com"), "http://localhost:3000")).toMatchObject({
      embeddable: false,
      reason: "x_frame_options"
    });
  });

  it("marks compatible frame-ancestors as allowed", () => {
    const headers = new Headers({
      "content-security-policy": "default-src 'self'; frame-ancestors http://localhost:3000"
    });

    expect(classifyEmbeddingPolicy(headers, new URL("https://example.com"), "http://localhost:3000")).toMatchObject({
      embeddable: true,
      reason: "allowed"
    });
  });

  it.each([
    "http://127.0.0.1:7878",
    "http://127.99.99.99:1/",
    "http://localhost:3000",
    "http://[::1]:8080/"
  ])("allows loopback %s to embed without a server-side fetch", async (url) => {
    globalThis.fetch = vi.fn(() => {
      throw new Error("loopback embed check must not perform a server-side fetch");
    }) as unknown as typeof fetch;

    const result = await checkUrlEmbeddability(url, "http://localhost:3000");
    expect(result).toMatchObject({ embeddable: true, reason: "allowed", message: null });
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it("still rejects non-loopback private addresses (SSRF guard intact)", async () => {
    globalThis.fetch = vi.fn(() => {
      throw new Error("must not fetch");
    }) as unknown as typeof fetch;

    // 10.0.0.1 is private but not loopback; the SSRF guard must throw.
    await expect(checkUrlEmbeddability("http://10.0.0.1/", "http://localhost:3000")).rejects.toThrow();
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });
});

describe("registered local app embeddability", () => {
  const servers: Server[] = [];

  async function startLocalApp(headers: Record<string, string>): Promise<number> {
    const server = createServer((_req, res) => {
      res.writeHead(200, { "content-type": "text/html; charset=utf-8", ...headers });
      res.end("<!doctype html><title>probe</title><h1>probe</h1>");
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    servers.push(server);
    return (server.address() as AddressInfo).port;
  }

  afterEach(async () => {
    await Promise.all(servers.splice(0).map((s) => new Promise<void>((resolve) => s.close(() => resolve()))));
  });

  it("reports a frame-refusing local app as blocked instead of trusting the iframe load event", async () => {
    const port = await startLocalApp({
      "x-frame-options": "DENY",
      "content-security-policy": "frame-ancestors 'none'"
    });

    const result = await checkLocalAppEmbeddability({ port, status: null }, "http://localhost:3000");
    expect(result.embeddable).toBe(false);
    expect(result.reason).toBe("x_frame_options");
    expect(result.message).toBeTruthy();
  });

  it("detects frame-ancestors refusal without X-Frame-Options", async () => {
    const port = await startLocalApp({ "content-security-policy": "frame-ancestors https://example.com" });

    const result = await checkLocalAppEmbeddability({ port, status: null }, "http://localhost:3000");
    expect(result).toMatchObject({ embeddable: false, reason: "frame_ancestors" });
  });

  it("follows local redirects and applies the final page embedding policy", async () => {
    const server = createServer((req, res) => {
      if (req.url === "/") {
        res.writeHead(302, { location: "/lab" });
        res.end();
        return;
      }
      if (req.url === "/lab") {
        res.writeHead(302, { location: "/login" });
        res.end();
        return;
      }
      res.writeHead(200, {
        "content-type": "text/html; charset=utf-8",
        "content-security-policy": "frame-ancestors 'self'"
      });
      res.end("<!doctype html><title>login</title>");
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    servers.push(server);
    const port = (server.address() as AddressInfo).port;

    const result = await checkLocalAppEmbeddability({ port, status: null }, "http://localhost:3000");
    expect(result).toMatchObject({ embeddable: false, reason: "frame_ancestors" });
    expect(result.url).toBe(`http://127.0.0.1:${port}/login`);
  });

  it("refuses a redirect away from loopback without fetching the external target", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 302, headers: { location: "https://example.com/login" } }));

    const result = await checkLocalAppEmbeddability(
      { port: 8080, status: null },
      "http://localhost:3000",
      fetchImpl as unknown as typeof fetch
    );

    expect(result).toMatchObject({ embeddable: false, reason: "unreachable" });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("keeps an ordinary local app embeddable", async () => {
    const port = await startLocalApp({});

    const result = await checkLocalAppEmbeddability({ port, status: null }, "http://localhost:3000");
    expect(result).toMatchObject({ embeddable: true, reason: "allowed", message: null });
  });

  it("treats a not-yet-listening app as embeddable so the start-on-demand retry window still owns that case", async () => {
    const port = await startLocalApp({});
    await new Promise<void>((resolve) => servers.splice(0)[0].close(() => resolve()));

    const result = await checkLocalAppEmbeddability({ port, status: null }, "http://localhost:3000");
    expect(result.embeddable).toBe(true);
  });

  it("refuses to probe an app whose recorded URL is not loopback", async () => {
    await expect(
      checkLocalAppEmbeddability({ port: 8080, status: { url: "http://10.0.0.5:8080/" } }, null)
    ).rejects.toThrow(/loopback/i);
  });

  it("prefers the daemon's recorded URL over the bare port", async () => {
    const port = await startLocalApp({ "x-frame-options": "DENY" });

    const result = await checkLocalAppEmbeddability(
      { port: 1, status: { url: `http://127.0.0.1:${port}/` } },
      "http://localhost:3000"
    );
    expect(result.embeddable).toBe(false);
    expect(result.url).toContain(String(port));
  });
});
