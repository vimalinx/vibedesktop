import { describe, expect, it } from "vitest";
import { readSystemStatus } from "@/lib/system-status";

describe("readSystemStatus", () => {
  it("reports bounded host and Vibe Desktop process metrics", () => {
    const status = readSystemStatus();

    expect(status.hostname.length).toBeGreaterThan(0);
    expect(status.cpuCount).toBeGreaterThan(0);
    expect(status.totalMemoryBytes).toBeGreaterThan(0);
    expect(status.freeMemoryBytes).toBeGreaterThanOrEqual(0);
    expect(status.freeMemoryBytes).toBeLessThanOrEqual(status.totalMemoryBytes);
    expect(status.desktop.pid).toBe(process.pid);
    expect(status.desktop.rssBytes).toBeGreaterThan(0);
    expect(Number.isFinite(status.loadAverage)).toBe(true);
  });
});
