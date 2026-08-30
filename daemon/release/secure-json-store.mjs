// @ts-check
import { chmod, mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

/** @param {string} filePath */
export async function readJsonFile(filePath) {
  try {
    const value = JSON.parse(await readFile(filePath, "utf8"));
    return value && typeof value === "object" && !Array.isArray(value) ? value : null;
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") return null;
    if (error instanceof SyntaxError) return null;
    throw error;
  }
}

/** @param {string} filePath @param {Record<string, unknown>} value */
export async function writeSecureJson(filePath, value) {
  const directory = path.dirname(filePath);
  await mkdir(directory, { recursive: true, mode: 0o700 });
  try { await chmod(directory, 0o700); } catch { /* non-POSIX */ }
  const temporary = `${filePath}.${process.pid}.${crypto.randomUUID()}.tmp`;
  try {
    await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, {
      encoding: "utf8",
      flag: "wx",
      mode: 0o600,
    });
    await rename(temporary, filePath);
    try { await chmod(filePath, 0o600); } catch { /* non-POSIX */ }
  } catch (error) {
    try { await unlink(temporary); } catch { /* absent */ }
    throw error;
  }
}

export class SerializedSecureJsonStore {
  /** @param {string} filePath */
  constructor(filePath) {
    this.filePath = filePath;
    this.mutationTail = Promise.resolve();
  }

  async read() {
    return readJsonFile(this.filePath);
  }

  /** @template T @param {(current: Record<string, any> | null) => Promise<{ value: Record<string, unknown>; result: T }> | { value: Record<string, unknown>; result: T }} operation */
  mutate(operation) {
    const result = this.mutationTail.then(async () => {
      const outcome = await operation(await this.read());
      await writeSecureJson(this.filePath, outcome.value);
      return outcome.result;
    });
    this.mutationTail = result.catch(() => undefined);
    return result;
  }
}
