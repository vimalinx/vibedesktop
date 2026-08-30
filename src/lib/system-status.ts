import os from "node:os";
import type { SystemStatus } from "@/lib/contracts";

export function readSystemStatus(): SystemStatus {
  const memory = process.memoryUsage();
  const [loadAverage = 0] = os.loadavg();

  return {
    sampledAt: new Date().toISOString(),
    hostname: os.hostname(),
    platform: os.platform(),
    release: os.release(),
    architecture: os.arch(),
    uptimeSeconds: os.uptime(),
    cpuCount: os.availableParallelism?.() ?? os.cpus().length,
    loadAverage,
    totalMemoryBytes: os.totalmem(),
    freeMemoryBytes: os.freemem(),
    desktop: {
      pid: process.pid,
      uptimeSeconds: process.uptime(),
      rssBytes: memory.rss,
      heapUsedBytes: memory.heapUsed,
      nodeVersion: process.version
    }
  };
}
