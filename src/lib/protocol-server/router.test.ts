import { beforeEach, expect, it, vi } from "vitest";
const { handler } = vi.hoisted(() => ({ handler: vi.fn() }));
vi.mock("./handlers", () => ({ handlers: { "apps.create": handler, "session.read": handler, "catalog.add": handler, "localApps.remove": handler } }));
import { handleProtocolRequest } from "./router";
const origin = "http://127.0.0.1:3000";
beforeEach(() => { vi.clearAllMocks(); handler.mockResolvedValue(Response.json({ user: null })); });
it("stamps discovery and keeps unknown routes outside the protocol", async () => {
  const discovery = await handleProtocolRequest(new Request(origin + "/api/v1"));
  expect(discovery.headers.get("x-vibe-protocol")).toBe("1.2");
  expect((await discovery.json()).operations["desktop.read"].path).toBe("/desktop");
  expect((await handleProtocolRequest(new Request(origin), ["setup"])).status).toBe(404);
});
it("rejects cross-origin mutations before any handler", async () => {
  const result = await handleProtocolRequest(new Request(origin, { method: "POST", headers: { Origin: "https://evil.example" } }), ["apps"]);
  expect(result.status).toBe(403); expect(handler).not.toHaveBeenCalled();
  expect((await result.json()).error.outcome).toBe("not_started");
});
it("reserves static paths even when another method matches a dynamic ID", async () => {
  const result = await handleProtocolRequest(new Request(origin, { method: "DELETE", headers: { Origin: origin } }), ["local-apps", "discovery"]);
  expect(result.status).toBe(405); expect(result.headers.get("allow")).toBe("GET"); expect(handler).not.toHaveBeenCalled();
});
it.each([
  ["text/plain", "{}", 415], ["application/json", "{", 400], ["application/json", "[]", 400],
  ["application/json", '{"title":3,"url":"https://example.com"}', 400],
  ["application/json", '{"title":"' + "x".repeat(8 * 1024 * 1024) + '"}', 413],
])("rejects invalid input (%s) with status %s", async (contentType, body, status) => {
  const result = await handleProtocolRequest(new Request(origin, { method: "POST", headers: { Origin: origin, "Content-Type": contentType }, body }), ["apps"]);
  expect(result.status).toBe(status); expect(handler).not.toHaveBeenCalled();
});
it("returns invalid UTF-8 as a client error", async () => {
  const result = await handleProtocolRequest(new Request(origin, { method: "POST", headers: { Origin: origin, "Content-Type": "application/json" }, body: new Uint8Array([255]) }), ["apps"]);
  expect(result.status).toBe(400); expect(handler).not.toHaveBeenCalled();
});
it("normalizes unexpected failures without leaking internals or promising a retry", async () => {
  handler.mockRejectedValue(new Error("private server path"));
  const result = await handleProtocolRequest(new Request(origin, { method: "POST", headers: { Origin: origin } }), ["app-directory", "test", "add"]);
  expect(result.status).toBe(500);
  const { error } = await result.json();
  expect(error).toMatchObject({ code: "internal_error", outcome: "unknown", retryable: false, requestId: result.headers.get("x-request-id") });
  expect(error.message).not.toContain("private server path");
});
