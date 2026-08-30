// @ts-check
/**
 * Linux process lifecycle adapter.
 *
 * The local runtime currently targets Linux. Keeping process-group behavior
 * here lets ProcessManager retain process semantics while later platform
 * adapters provide their own spawn/termination behavior.
 */

import { readdir, readFile } from "node:fs/promises";

/**
 * Make a child process its own process-group leader so it can be terminated
 * together with descendants (for example `npm run dev` and the Node process it
 * forks).
 *
 * @param {import("node:child_process").SpawnOptions} options
 * @returns {import("node:child_process").SpawnOptions}
 */
export function prepareSpawnOptions(options) {
  return { ...options, detached: true };
}

/**
 * Signal a process group, falling back to the direct process when the group is
 * already reaped or negative-pid signaling is unavailable.
 *
 * @param {import("node:child_process").ChildProcess} proc
 * @param {NodeJS.Signals} signal
 */
export function signalProcessTree(proc, signal) {
  const pid = proc.pid;
  if (!pid) return;
  try {
    process.kill(-pid, signal);
  } catch {
    try {
      proc.kill(signal);
    } catch {
      // The process may have exited between the liveness check and signal.
    }
  }
}

/**
 * Read one detached process group's aggregate resource usage from procfs.
 * CPU ticks are returned with the host-wide tick counter so ProcessManager can
 * calculate a one-core-normalized percentage between samples without assuming
 * a kernel CLK_TCK value.
 *
 * @param {number} processGroupId
 * @returns {Promise<{ cpuTicks: number; totalCpuTicks: number; memoryBytes: number; processCount: number; readBytes: number; writeBytes: number }>}
 */
export async function readProcessGroupUsage(processGroupId) {
  if (!Number.isInteger(processGroupId) || processGroupId <= 0) return emptyUsage();

  const [entries, procStat] = await Promise.all([
    readdir("/proc", { withFileTypes: true }),
    readFile("/proc/stat", "utf8")
  ]);
  const cpuLine = procStat.split("\n", 1)[0] || "";
  const totalCpuTicks = cpuLine
    .trim()
    .split(/\s+/)
    .slice(1)
    .reduce((sum, value) => sum + (Number(value) || 0), 0);

  const totals = emptyUsage();
  totals.totalCpuTicks = totalCpuTicks;
  await Promise.all(entries.filter((entry) => entry.isDirectory() && /^\d+$/.test(entry.name)).map(async (entry) => {
    try {
      const statText = await readFile(`/proc/${entry.name}/stat`, "utf8");
      const closeParen = statText.lastIndexOf(")");
      if (closeParen < 0) return;
      // Fields after the command begin at proc(5)'s field 3 (`state`).
      const fields = statText.slice(closeParen + 2).trim().split(/\s+/);
      if (Number(fields[2]) !== processGroupId) return;

      totals.processCount += 1;
      totals.cpuTicks += (Number(fields[11]) || 0) + (Number(fields[12]) || 0);

      const [statusText, ioText] = await Promise.all([
        readFile(`/proc/${entry.name}/status`, "utf8").catch(() => ""),
        readFile(`/proc/${entry.name}/io`, "utf8").catch(() => "")
      ]);
      const rssKb = Number(statusText.match(/^VmRSS:\s+(\d+)\s+kB$/m)?.[1] || 0);
      totals.memoryBytes += rssKb * 1024;
      totals.readBytes += Number(ioText.match(/^read_bytes:\s+(\d+)$/m)?.[1] || 0);
      totals.writeBytes += Number(ioText.match(/^write_bytes:\s+(\d+)$/m)?.[1] || 0);
    } catch {
      // A process can exit between /proc enumeration and file reads.
    }
  }));

  return totals;
}

function emptyUsage() {
  return {
    cpuTicks: 0,
    totalCpuTicks: 0,
    memoryBytes: 0,
    processCount: 0,
    readBytes: 0,
    writeBytes: 0
  };
}
