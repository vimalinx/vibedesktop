import { describe, expect, it } from "vitest";
import { PublicOriginConfigurationError, resolvePublicOrigin } from "@/lib/public-origin";

describe("resolvePublicOrigin", () => {
  it("uses and normalizes the configured public origin instead of the internal request origin", () => {
    expect(
      resolvePublicOrigin("https://0.0.0.0:3000/api/desktop", {
        NODE_ENV: "production",
        VIBE_PUBLIC_ORIGIN: "https://vibedesktop.example/"
      })
    ).toBe("https://vibedesktop.example");
  });

  it.each([
    "ftp://vibedesktop.example",
    "https://user:secret@vibedesktop.example",
    "https://vibedesktop.example/a",
    "https://vibedesktop.example?source=test",
    "https://vibedesktop.example/#fragment"
  ])("rejects a malformed configured origin: %s", (configured) => {
    expect(() =>
      resolvePublicOrigin("http://localhost:3000/api", {
        NODE_ENV: "test",
        VIBE_PUBLIC_ORIGIN: configured
      })
    ).toThrow(PublicOriginConfigurationError);
  });

  it("requires an HTTPS configured origin in production", () => {
    expect(() =>
      resolvePublicOrigin("http://0.0.0.0:3000/api", {
        NODE_ENV: "production",
        VIBE_PUBLIC_ORIGIN: "http://vibedesktop.example"
      })
    ).toThrow("VIBE_PUBLIC_ORIGIN must use HTTPS in production.");
  });

  it("requires an explicit configured origin in production behind a proxy", () => {
    expect(() =>
      resolvePublicOrigin("https://0.0.0.0:3000/api", {
        NODE_ENV: "production"
      })
    ).toThrow("VIBE_PUBLIC_ORIGIN is required in production unless the app is served over loopback.");
  });

  it.each([
    "http://localhost:3000/api/apps",
    "http://127.0.0.1:3000/api/apps",
    "http://127.0.0.53:3000/api/apps",
    "http://[::1]:3000/api/apps",
    "http://vibe.localhost:3000/api/apps"
  ])("infers a loopback origin in production without configuration: %s", (requestUrl) => {
    expect(resolvePublicOrigin(requestUrl, { NODE_ENV: "production" })).toBe(new URL(requestUrl).origin);
  });

  it.each(["http://localhost:3000", "http://127.0.0.1:3000", "http://[::1]:3000"])(
    "accepts a plain-HTTP loopback origin in production: %s",
    (configured) => {
      expect(
        resolvePublicOrigin("http://127.0.0.1:3000/api/apps", {
          NODE_ENV: "production",
          VIBE_PUBLIC_ORIGIN: configured
        })
      ).toBe(new URL(configured).origin);
    }
  );

  // URL normalizes shorthand and decimal IPv4 before the host is ever compared,
  // so these reach isLoopbackHost already spelled 127.0.0.x.
  it.each(["http://127.1:3000/api", "http://127.0.0:3000/api", "http://2130706433:3000/api"])(
    "treats a normalized shorthand loopback address as loopback: %s",
    (requestUrl) => {
      expect(resolvePublicOrigin(requestUrl, { NODE_ENV: "production" })).toBe(new URL(requestUrl).origin);
    }
  );

  it.each([
    "http://1270.0.0.1:3000/api",
    "http://128.0.0.1:3000/api",
    "http://notlocalhost:3000/api",
    "http://localhost.evil.example:3000/api"
  ])("does not mistake a lookalike host for loopback: %s", (requestUrl) => {
    expect(() => resolvePublicOrigin(requestUrl, { NODE_ENV: "production" })).toThrow(
      PublicOriginConfigurationError
    );
  });

  it("falls back to the request origin outside production", () => {
    expect(
      resolvePublicOrigin("http://localhost:3000/api/apps", {
        NODE_ENV: "development"
      })
    ).toBe("http://localhost:3000");
  });
});
