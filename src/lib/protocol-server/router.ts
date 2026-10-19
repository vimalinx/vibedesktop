import { validateOperationInput } from "@/protocol/v1/input";
import { handlers } from "./handlers";
import { matchOperation } from "@/protocol/v1/operations";
import { protocolHeader, protocolManifest, protocolVersionString } from "@/protocol/v1/manifest";
import { rejectCrossOriginMutation } from "@/lib/api-response";

function jsonError(status: number, code: string, message: string, requestId: string, outcome: "not_started" | "unknown" = "not_started") {
  return Response.json({ error: { code, message, requestId, retryable: false, outcome } }, { status });
}
function methodError(allowed: string[], requestId: string) {
  const response = jsonError(405, "method_not_allowed", "This method is not supported for this protocol path.", requestId);
  response.headers.set("allow", allowed.join(", "));
  return stamped(response, requestId);
}
function stamped(response: Response, requestId: string) {
  response.headers.set(protocolHeader, protocolVersionString);
  response.headers.set("x-request-id", requestId);
  response.headers.set("cache-control", "no-store");
  response.headers.set("x-content-type-options", "nosniff");
  return response;
}
async function limitedBody(request: Request): Promise<string | undefined> {
  if (!request.body) return undefined;
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const item = await reader.read();
      if (item.done) break;
      length += item.value.byteLength;
      if (length > protocolManifest.limits.requestBytes) {
        await reader.cancel();
        throw new Error("request_too_large");
      }
      chunks.push(item.value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  try { return new TextDecoder("utf-8", { fatal: true }).decode(bytes); }
  catch { throw new Error("invalid_json"); }
}

/** The wire boundary owns protocol errors; existing services retain all business rules. */
export async function handleProtocolRequest(request: Request, segments: string[] = []): Promise<Response> {
  const requestId = crypto.randomUUID();
  let started = false;
  try {
    if (segments.length === 0) {
      if (request.method !== "GET") return methodError(["GET"], requestId);
      return stamped(Response.json(protocolManifest), requestId);
    }
    const path = "/" + segments.map(segment => encodeURIComponent(segment)).join("/");
    const match = matchOperation(request.method, path);
    if (!match) {
      const allowed = ["GET", "POST", "PUT", "PATCH", "DELETE"].filter(method => matchOperation(method, path));
      if (allowed.length) return methodError(allowed, requestId);
      return stamped(jsonError(404, "operation_not_found", "This operation is not part of protocol v1.", requestId), requestId);
    }
    const mutation = request.method !== "GET";
    if (mutation) {
      const denied = rejectCrossOriginMutation(request);
      if (denied) {
        const body = await denied.json();
        return stamped(jsonError(denied.status, body.error.code, body.error.message, requestId), requestId);
      }
    }
    let forwarded = request;
    let input: unknown;
    // A bodyless DELETE/POST may still arrive with an empty stream; that is "no body", not a bad one.
    const text = mutation && request.body ? await limitedBody(request) : undefined;
    if (text === "") forwarded = new Request(request.url, { method: request.method, headers: request.headers, signal: request.signal });
    if (text) {
      const contentType = request.headers.get("content-type")?.split(";")[0].trim().toLowerCase();
      if (contentType !== "application/json") return stamped(jsonError(415, "unsupported_media_type", "Send application/json.", requestId), requestId);
      try { input = JSON.parse(text); }
      catch { return stamped(jsonError(400, "invalid_json", "Request body is not valid JSON.", requestId), requestId); }
      if (!input || typeof input !== "object" || Array.isArray(input)) return stamped(jsonError(400, "invalid_request", "Request body must be a JSON object.", requestId), requestId);
      forwarded = new Request(request.url, { method: request.method, headers: request.headers, body: text, signal: request.signal });
    }
    try { validateOperationInput(match.operation, input); }
    catch (error) { return stamped(jsonError(400, "invalid_request", error instanceof Error ? error.message : "Invalid request.", requestId), requestId); }
    const handler = handlers[match.operation] as (request: Request, context: { params: Promise<{ id: string }> }) => Promise<Response>;
    started = true;
    const response = await handler(forwarded, { params: Promise.resolve({ id: match.id ?? "" }) });
    if (!response.ok) {
      const body = await response.json().catch(() => null);
      return stamped(jsonError(response.status, body?.error?.code || "request_failed", body?.error?.message || "The operation failed.", requestId, mutation ? "unknown" : "not_started"), requestId);
    }
    // Binary responses keep their native media type; successful JSON shapes remain compatible with existing routes.
    return stamped(response, requestId);
  } catch (error) {
    if (error instanceof Error && error.message === "invalid_json") return stamped(jsonError(400, "invalid_json", "Request body is not valid UTF-8 JSON.", requestId), requestId);
    if (error instanceof Error && error.message === "request_too_large") return stamped(jsonError(413, "request_too_large", "Request exceeds 8 MiB.", requestId), requestId);
    return stamped(jsonError(500, "internal_error", "The desktop service could not complete this operation.", requestId, started && request.method !== "GET" ? "unknown" : "not_started"), requestId);
  }
}
