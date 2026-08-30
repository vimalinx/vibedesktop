import { afterEach, describe, expect, it, vi } from "vitest";
import { rejectCrossOriginMutation } from "@/lib/api-response";

describe("browser mutation origin guard", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("allows the request origin or a same-origin referer", async () => {
    vi.stubEnv("VIBE_PUBLIC_ORIGIN", "https://vibedesktop.example");
    expect(
      rejectCrossOriginMutation(
        new Request("https://0.0.0.0:3000/api/apps", { method: "POST", headers: { origin: "https://vibedesktop.example" } })
      )
    ).toBeNull();
    expect(
      rejectCrossOriginMutation(
        new Request("https://0.0.0.0:3000/api/apps", { method: "POST", headers: { referer: "https://vibedesktop.example/desktop" } })
      )
    ).toBeNull();
  });

  it("rejects an absent or cross-origin caller before a mutation", async () => {
    vi.stubEnv("VIBE_PUBLIC_ORIGIN", "https://vibedesktop.example");
    const crossOrigin = rejectCrossOriginMutation(
      new Request("https://0.0.0.0:3000/api/apps", { method: "POST", headers: { origin: "https://attacker.example" } })
    );
    expect(crossOrigin?.status).toBe(403);
    await expect(crossOrigin?.json()).resolves.toMatchObject({ error: { code: "csrf_invalid" } });

    const internalOrigin = rejectCrossOriginMutation(
      new Request("https://0.0.0.0:3000/api/apps", { method: "POST", headers: { origin: "https://0.0.0.0:3000" } })
    );
    expect(internalOrigin?.status).toBe(403);

    const absentOrigin = rejectCrossOriginMutation(new Request("https://0.0.0.0:3000/api/apps", { method: "POST" }));
    expect(absentOrigin?.status).toBe(403);
  });

  it("fails closed when the production public origin is missing", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("VIBE_PUBLIC_ORIGIN", "");

    const response = rejectCrossOriginMutation(
      new Request("https://0.0.0.0:3000/api/apps", {
        method: "POST",
        headers: { origin: "https://vibedesktop.example" }
      })
    );

    expect(response?.status).toBe(503);
    await expect(response?.json()).resolves.toMatchObject({ error: { code: "origin_not_configured" } });
  });

  it("allows a direct loopback production run with no configuration", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("VIBE_PUBLIC_ORIGIN", "");

    expect(
      rejectCrossOriginMutation(
        new Request("http://localhost:3000/api/apps", { method: "POST", headers: { origin: "http://localhost:3000" } })
      )
    ).toBeNull();
    expect(
      rejectCrossOriginMutation(
        new Request("http://127.0.0.1:3000/api/apps", { method: "POST", headers: { origin: "http://127.0.0.1:3000" } })
      )
    ).toBeNull();
  });

  it("uses the browser Host header when the framework canonicalizes the request URL to localhost", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("VIBE_PUBLIC_ORIGIN", "");

    expect(
      rejectCrossOriginMutation(
        new Request("http://localhost:3002/api/local-apps", {
          method: "POST",
          headers: {
            host: "127.0.0.1:3002",
            origin: "http://127.0.0.1:3002"
          }
        })
      )
    ).toBeNull();
  });

  // Being on loopback is not itself proof of being the desktop: a rogue server on
  // another local port would otherwise be able to write. A real port forward is
  // told apart from it by configuration, not by relaxing the comparison.
  it("still rejects a loopback caller on a different port, and accepts it once configured", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("VIBE_PUBLIC_ORIGIN", "");

    const forwarded = rejectCrossOriginMutation(
      new Request("http://localhost:3000/api/apps", { method: "POST", headers: { origin: "http://localhost:8080" } })
    );
    expect(forwarded?.status).toBe(403);
    await expect(forwarded?.json()).resolves.toMatchObject({ error: { code: "csrf_invalid" } });

    vi.stubEnv("VIBE_PUBLIC_ORIGIN", "http://localhost:8080");
    expect(
      rejectCrossOriginMutation(
        new Request("http://localhost:3000/api/apps", { method: "POST", headers: { origin: "http://localhost:8080" } })
      )
    ).toBeNull();
  });
});
