import { describe, expect, it } from "vitest";
import { isBlockedHostname, isLoopbackAddress, isPrivateIpAddress, parseHttpUrl } from "@/lib/url-safety";

describe("url safety", () => {
  it("accepts http and https URLs", () => {
    expect(parseHttpUrl("https://example.com").hostname).toBe("example.com");
    expect(parseHttpUrl("http://example.com").hostname).toBe("example.com");
  });

  it("rejects unsupported protocols", () => {
    expect(() => parseHttpUrl("file:///etc/passwd")).toThrow("Only http and https");
  });

  it("identifies blocked local hostnames", () => {
    expect(isBlockedHostname("localhost")).toBe(true);
    expect(isBlockedHostname("app.localhost")).toBe(true);
    expect(isBlockedHostname("example.com")).toBe(false);
  });

  it("identifies private IPv4 ranges", () => {
    expect(isPrivateIpAddress("127.0.0.1")).toBe(true);
    expect(isPrivateIpAddress("10.0.0.1")).toBe(true);
    expect(isPrivateIpAddress("172.16.0.1")).toBe(true);
    expect(isPrivateIpAddress("192.168.1.1")).toBe(true);
    expect(isPrivateIpAddress("8.8.8.8")).toBe(false);
  });

  it("recognizes loopback (127/8, ::1, localhost) without matching other private ranges", () => {
    expect(isLoopbackAddress("127.0.0.1")).toBe(true);
    expect(isLoopbackAddress("127.255.255.255")).toBe(true);
    expect(isLoopbackAddress("::1")).toBe(true);
    expect(isLoopbackAddress("[::1]")).toBe(true);
    expect(isLoopbackAddress("localhost")).toBe(true);
    // Private-but-not-loopback must stay excluded so the SSRF guard holds.
    expect(isLoopbackAddress("10.0.0.1")).toBe(false);
    expect(isLoopbackAddress("192.168.1.1")).toBe(false);
    expect(isLoopbackAddress("169.254.169.254")).toBe(false); // cloud metadata
    expect(isLoopbackAddress("8.8.8.8")).toBe(false);
  });
});
