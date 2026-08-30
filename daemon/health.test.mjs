import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { checkVibedHealth } from "./health.mjs";

const temporaryDirectories = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe("vibed health CLI boundary", () => {
  it("reads private endpoint files and never passes the token in the URL", async () => {
    const dataDir = await mkdtemp(path.join(tmpdir(), "vibed-health-"));
    temporaryDirectories.push(dataDir);
    await writeFile(path.join(dataDir, "daemon.port"), "7780\n");
    await writeFile(path.join(dataDir, "daemon.token"), `${"a".repeat(64)}\n`);
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "content-type": "application/json" },
    }));

    await expect(checkVibedHealth({ dataDir, fetchImpl })).resolves.toBe(true);
    expect(fetchImpl).toHaveBeenCalledWith("http://127.0.0.1:7780/health", expect.objectContaining({
      headers: { authorization: `Bearer ${"a".repeat(64)}` },
    }));
  });

  it("fails closed for missing or malformed endpoint state", async () => {
    const dataDir = await mkdtemp(path.join(tmpdir(), "vibed-health-"));
    temporaryDirectories.push(dataDir);
    await expect(checkVibedHealth({ dataDir })).resolves.toBe(false);
    await writeFile(path.join(dataDir, "daemon.port"), "not-a-port\n");
    await writeFile(path.join(dataDir, "daemon.token"), "short\n");
    await expect(checkVibedHealth({ dataDir })).resolves.toBe(false);
  });
});
