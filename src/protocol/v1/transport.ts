import { DesktopDataError } from "./data-source";
import { operationPath, operations, type OperationId } from "./operations";
import { protocolHeader } from "./manifest";

export interface DesktopClientOptions {
  /** Same-origin mount, useful when the local server sits behind a local path prefix. */
  basePath?: string;
  fetch?: typeof fetch;
  timeoutMs?: number;
}
interface RequestInput { id?: string; json?: unknown; query?: Record<string, string>; signal?: AbortSignal; timeoutMs?: number }
export function createProtocolTransport(options: DesktopClientOptions = {}) {
  const basePath = options.basePath ?? "/api/v1";
  if (!/^\/(?:[A-Za-z0-9_-]+\/)*api\/v1$/.test(basePath)) throw new Error("The v1 API must use a same-origin path ending in /api/v1.");
  const fetcher = options.fetch ?? ((input, init) => fetch(input, init));
  const timeoutMs = options.timeoutMs ?? 20_000;
  if (!Number.isFinite(timeoutMs) || timeoutMs < 1) throw new Error("Invalid request timeout.");
  const reads = new Map<string, { until: number; promise: Promise<unknown> }>();

  async function perform<T>(operation: OperationId | "describe", input: RequestInput = {}): Promise<T> {
    const spec = operation === "describe" ? null : operations[operation];
    const method = spec?.method ?? "GET";
    const mutation = method !== "GET";
    let pathname: string;
    try { pathname = operation === "describe" ? "" : operationPath(operation, input.id); }
    catch { throw new DesktopDataError("Invalid resource ID.", { code: "invalid_request", outcome: "not_started" }); }
    const query = input.query ? `?${new URLSearchParams(input.query)}` : "";
    const controller = new AbortController();
    const abort = () => controller.abort();
    if (input.signal?.aborted) controller.abort();
    else input.signal?.addEventListener("abort", abort, { once: true });
    const timeout = setTimeout(abort, input.timeoutMs ?? timeoutMs);
    let received = false;
    try {
      const response = await fetcher(basePath + pathname + query, {
        method, credentials: "same-origin", cache: "no-store", signal: controller.signal,
        ...(input.json === undefined ? {} : { headers: { "content-type": "application/json" }, body: JSON.stringify(input.json) }),
      });
      received = true;
      if (!response.ok) {
        const body = await response.json().catch(() => null) as { error?: Record<string, unknown> } | null;
        const error = body?.error;
        const message = typeof error?.message === "string" ? error.message : undefined;
        throw new DesktopDataError(message || `Request failed with status ${response.status}.`, {
          code: typeof error?.code === "string" ? error.code : undefined, status: response.status, serverMessage: message,
          requestId: (typeof error?.requestId === "string" ? error.requestId : undefined) ?? response.headers.get("x-request-id") ?? undefined,
          retryable: !mutation && [429, 502, 503, 504].includes(response.status),
          outcome: error?.outcome === "not_started" ? "not_started" : mutation ? "unknown" : "not_started",
        });
      }
      if (!/^1\.\d+$/.test(response.headers.get(protocolHeader) || "")) throw new DesktopDataError("The server did not return a compatible v1 protocol response.", { code: "protocol_mismatch", outcome: mutation ? "unknown" : "not_started" });
      if (spec && "binary" in spec) {
        if (!response.headers.get("content-type")?.startsWith("image/")) throw new DesktopDataError("Expected an image response.", { code: "invalid_response", outcome: mutation ? "unknown" : "not_started" });
        return await response.blob() as T;
      }
      const result: unknown = await response.json();
      if (!result || typeof result !== "object" || Array.isArray(result) || (spec && !spec.required.every(key => Object.hasOwn(result, key)))) {
        throw new DesktopDataError("The service response is missing required protocol fields.", { code: "invalid_response", outcome: mutation ? "unknown" : "not_started" });
      }
      const body = result as Record<string, unknown>;
      for (const key of ["apps", "items", "installs", "logs", "candidates", "iconCandidates", "wallpapers", "themes", "shellStyles"]) {
        if (key in body && !Array.isArray(body[key])) throw new DesktopDataError(`Invalid ${key} response.`, { code: "invalid_response", outcome: mutation ? "unknown" : "not_started" });
      }
      return result as T;
    } catch (error) {
      if (error instanceof DesktopDataError) throw error;
      throw new DesktopDataError(controller.signal.aborted ? "The desktop request timed out or was cancelled." : received ? "The service returned an invalid response." : "The desktop service is unreachable.", {
        code: controller.signal.aborted ? "request_aborted" : received ? "invalid_response" : "network_error",
        retryable: !mutation, outcome: mutation ? "unknown" : "not_started",
      });
    } finally {
      clearTimeout(timeout);
      input.signal?.removeEventListener("abort", abort);
    }
  }
  function request<T>(operation: OperationId | "describe", input: RequestInput = {}): Promise<T> {
    const method = operation === "describe" ? "GET" : operations[operation].method;
    if (method !== "GET") reads.clear();
    const coalesce = ["localApps.list", "localApps.status", "catalog.installs"].includes(operation) && !input.signal;
    if (!coalesce) return perform<T>(operation, input);
    const key = operation + JSON.stringify(input);
    const existing = reads.get(key);
    if (existing && existing.until > Date.now()) return existing.promise as Promise<T>;
    const promise = perform<T>(operation, input);
    reads.set(key, { until: Date.now() + 750, promise });
    void promise.catch(() => { if (reads.get(key)?.promise === promise) reads.delete(key); });
    return promise;
  }
  return { request };
}
