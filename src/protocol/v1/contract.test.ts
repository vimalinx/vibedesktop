import { describe, expect, it, vi } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { createDesktopClient } from "./client";
import { createProtocolTransport } from "./transport";
import { matchOperation, operationPath, operations } from "./operations";
import { protocolManifest } from "./manifest";
import { validateOperationInput } from "./input";
import { packageCompatibility, validatePreferencesReplacement, validatePreferencesValues } from "./package";

const response = (body: unknown, stamp = "1.0") => Response.json(body, { headers: { "x-vibe-protocol": stamp } });
describe("v1 compatibility boundary", () => {
  it("keeps the published operation inventory stable while allowing additions", () => {
    const baseline = JSON.parse(readFileSync(new URL("./compatibility-v1.json", import.meta.url), "utf8"));
    for (const [id, shape] of Object.entries(baseline)) expect(operations[id as keyof typeof operations]).toEqual(shape);
  });
  it("keeps the SDK independent from framework, persistence and UI imports", () => {
    for (const file of readdirSync(new URL(".", import.meta.url)).filter(f => f.endsWith(".ts") && !f.endsWith(".test.ts"))) {
      const source = readFileSync(new URL(file, import.meta.url), "utf8");
      for (const match of source.matchAll(/(?:from\s+|import\s*\()["']([^"']+)/g)) expect(match[1]).toMatch(/^\.\//);
    }
  });
  it("reserves literal paths for every method and rejects traversal IDs", () => {
    expect(matchOperation("GET", "/local-apps/discovery")?.operation).toBe("localApps.discover");
    expect(matchOperation("DELETE", "/local-apps/discovery")).toBeNull();
    for (const id of ["..", "a/b", "%2f", "?x", "a#b"]) expect(() => operationPath("apps.delete", id)).toThrow();
    expect(matchOperation("DELETE", "/apps/%2E%2E")).toBeNull();
  });
  it("discovers a compatible service through a same-origin mount", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(response(protocolManifest));
    expect((await createDesktopClient({ basePath: "/desktop/api/v1", fetch: fetcher }).describe()).version.major).toBe(1);
    expect(fetcher.mock.calls[0][0]).toBe("/desktop/api/v1");
    expect(() => createDesktopClient({ basePath: "https://elsewhere/api/v1" })).toThrow();
  });
  it.each(["", "2.0"])("rejects incompatible response stamp %s", async stamp => {
    const client = createDesktopClient({ fetch: vi.fn<typeof fetch>().mockResolvedValue(response({ user: null }, stamp)) });
    await expect(client.getUser()).rejects.toMatchObject({ code: "protocol_mismatch" });
  });
  it("accepts additive minor responses but rejects malformed required fields", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(response({ user: null, future: true }, "1.9")).mockResolvedValueOnce(response({ apps: {} }));
    const client = createDesktopClient({ fetch: fetcher });
    expect(await client.getUser()).toBeNull();
    await expect(client.localApps.list()).rejects.toMatchObject({ code: "invalid_response" });
  });
  it("never retries an interrupted mutation and reports its unknown outcome", async () => {
    const fetcher = vi.fn<typeof fetch>().mockRejectedValue(new TypeError("connection lost"));
    await expect(createDesktopClient({ fetch: fetcher }).deleteApp("app-1")).rejects.toMatchObject({ code: "network_error", outcome: "unknown", retryable: false });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("preserves conflict correlation and rejects untrusted error field types", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(Response.json({ error: { code: "revision_conflict", message: "Reload", requestId: "trace", outcome: "not_started" } }, { status: 409 })).mockResolvedValueOnce(Response.json({ error: { code: {}, message: [] } }, { status: 500 }));
    const client = createDesktopClient({ fetch: fetcher });
    await expect(client.packagePreferences.replace("org.test.shell", { ifRevision: null, schemaVersion: 1, values: {} })).rejects.toMatchObject({ code: "revision_conflict", requestId: "trace", outcome: "not_started" });
    await expect(client.getUser()).rejects.toMatchObject({ code: "request_failed", serverMessage: undefined });
  });
  it("coalesces reads within a client only and invalidates them on mutation", async () => {
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async () => response({ apps: [], user: null, desktop: {} }));
    const a = createDesktopClient({ fetch: fetcher }); const b = createDesktopClient({ fetch: fetcher });
    await Promise.all([a.localApps.list(), a.localApps.list(), b.localApps.list()]);
    expect(fetcher).toHaveBeenCalledTimes(2);
    await a.deleteApp("app-1"); await a.localApps.list(); expect(fetcher).toHaveBeenCalledTimes(4);
  });
  it("validates IDs before sending a mutation", async () => {
    const fetcher = vi.fn<typeof fetch>();
    await expect(createProtocolTransport({ fetch: fetcher }).request("apps.delete", { id: "../desktop" })).rejects.toMatchObject({ outcome: "not_started" });
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("validates package requirements and bounded JSON preferences", () => {
    const manifest = { format: "vibedesktop-package" as const, manifestVersion: 1 as const, id: "org.example.shell", name: "Shell", version: "1.0.0", protocol: { major: 1, minMinor: 0 }, requiredCapabilities: ["desktop"], preferencesSchemaVersion: 1 };
    expect(packageCompatibility(manifest).compatible).toBe(true);
    expect(packageCompatibility({ ...manifest, requiredCapabilities: ["future"] }).missingCapabilities).toEqual(["future"]);
    expect(packageCompatibility({ ...manifest, protocol: { major: 2, minMinor: 0 } }).compatible).toBe(false);
    expect(() => validatePreferencesReplacement({ schemaVersion: 1, values: {} })).toThrow();
    expect(() => validatePreferencesValues(JSON.parse('{"__proto__":{}}'))).toThrow();
    expect(() => validatePreferencesValues({ huge: "a".repeat(65536) })).toThrow();
  });
  it("rejects bad wire field types before domain handlers", () => {
    for (const [op, body] of [["apps.create", { title: 8, url: "https://example.com" }], ["localApps.create", { name: "x", command: "x", port: 3.5 }], ["version.change", { action: "update", confirm: "true" }], ["desktop.update", undefined]] as const) expect(() => validateOperationInput(op, body)).toThrow();
    expect(() => validateOperationInput("desktop.update", { themeId: "future-theme", futureField: 4 })).not.toThrow();
  });
});
