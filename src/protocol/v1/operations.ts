/** Wire paths are protocol-owned. Server adapters and clients consume this same inventory. */
export const operations = {
  "session.read": { method: "GET", path: "/me", capability: "desktop", required: ["user"] },
  "desktop.read": { method: "GET", path: "/desktop", capability: "desktop", required: ["user", "desktop", "apps", "wallpapers", "themes", "shellStyles"] },
  "desktop.update": { method: "PATCH", path: "/desktop", capability: "desktop", required: ["user", "desktop", "apps"] },
  "desktop.restore": { method: "POST", path: "/desktop/restore", capability: "backup", required: ["user", "desktop", "apps"] },
  "apps.create": { method: "POST", path: "/apps", capability: "desktop", required: ["user", "desktop", "apps"] },
  "apps.update": { method: "PATCH", path: "/apps/:id", capability: "desktop", required: ["user", "desktop", "apps"] },
  "apps.delete": { method: "DELETE", path: "/apps/:id", capability: "desktop", required: ["user", "desktop", "apps"] },
  "apps.batch": { method: "POST", path: "/apps/batch", capability: "desktop", required: ["user", "desktop", "apps"] },
  "catalog.list": { method: "GET", path: "/app-directory", capability: "catalog", required: ["items"] },
  "catalog.add": { method: "POST", path: "/app-directory/:id/add", capability: "catalog", required: ["user", "desktop", "apps"] },
  "catalog.installs": { method: "GET", path: "/catalog-installs", capability: "catalog.install", required: ["installs"] },
  "catalog.install": { method: "POST", path: "/catalog-installs/:id", capability: "catalog.install", required: ["install"] },
  "catalog.uninstall": { method: "DELETE", path: "/catalog-installs/:id", capability: "catalog.install", required: ["install"] },
  "catalog.agentInstruction": { method: "GET", path: "/catalog-installs/:id/agent-instruction", capability: "catalog.install", required: ["instruction"] },
  "url.resolve": { method: "POST", path: "/apps/metadata/resolve", capability: "metadata", required: ["url", "title", "description", "iconCandidates"] },
  "url.embed": { method: "POST", path: "/apps/metadata/embed", capability: "metadata", required: ["url", "embeddable", "reason", "message"] },
  "localApps.list": { method: "GET", path: "/local-apps", capability: "localApps", required: ["apps"] },
  "localApps.get": { method: "GET", path: "/local-apps/:id", capability: "localApps", required: ["app"] },
  "localApps.create": { method: "POST", path: "/local-apps", capability: "localApps.manage", required: ["app"] },
  "localApps.update": { method: "PATCH", path: "/local-apps/:id", capability: "localApps.manage", required: ["app"] },
  "localApps.remove": { method: "DELETE", path: "/local-apps/:id", capability: "localApps.manage", required: ["deleted"] },
  "localApps.control": { method: "POST", path: "/local-apps/:id/control", capability: "localApps", required: ["app"] },
  "localApps.logs": { method: "GET", path: "/local-apps/:id/logs", capability: "localApps", required: ["logs"] },
  "localApps.discover": { method: "GET", path: "/local-apps/discovery", capability: "localApps.manage", required: ["candidates"] },
  "localApps.importPlan": { method: "POST", path: "/local-apps/import/plan", capability: "localApps.manage", required: ["plan"] },
  "localApps.import": { method: "POST", path: "/local-apps/import", capability: "localApps.manage", required: ["result"] },
  "localApps.bundle": { method: "GET", path: "/local-apps/:id/bundle", capability: "localApps", required: ["bundle"] },
  "localApps.icon": { method: "POST", path: "/local-apps/:id/resolve-icon", capability: "metadata", required: [], binary: true },
  "localApps.embed": { method: "GET", path: "/local-apps/:id/embed-check", capability: "metadata", required: ["embeddable"] },
  "localApps.status": { method: "GET", path: "/local-apps/daemon-status", capability: "localApps", required: ["ok"] },
  "system.read": { method: "GET", path: "/system/status", capability: "system.metrics", required: ["sampledAt", "hostname", "desktop"] },
  "version.read": { method: "GET", path: "/desktop/version", capability: "version", required: ["version", "managed", "local", "canUpdate", "canRollback", "task"] },
  "version.change": { method: "POST", path: "/desktop/version", capability: "version", required: ["ok", "state"] },
  "packages.preferences.read": { method: "GET", path: "/desktop/packages/:id/preferences", capability: "packages.preferences", required: ["revision", "schemaVersion", "values"] },
  "packages.preferences.replace": { method: "PUT", path: "/desktop/packages/:id/preferences", capability: "packages.preferences", required: ["revision", "schemaVersion", "values"] },
} as const;
export type OperationId = keyof typeof operations;
export type CapabilityId = (typeof operations)[OperationId]["capability"];
export type ProtocolMethod = (typeof operations)[OperationId]["method"];
export const capabilityIds = [...new Set(Object.values(operations).map(operation => operation.capability))];

/** IDs are opaque path segments. Never allow one to change the addressed operation. */
export function operationPath(id: OperationId, resourceId?: string): string {
  const path = operations[id].path;
  if (!path.includes(":id")) return path;
  if (!resourceId || resourceId.length > 160 || !/^[A-Za-z0-9][A-Za-z0-9_.:-]*$/.test(resourceId) || resourceId === "." || resourceId === "..") {
    throw new Error("Invalid resource ID.");
  }
  return path.replace(":id", encodeURIComponent(resourceId));
}

/** Exact routes win over dynamic IDs (for example /apps/batch). */
export function matchOperation(method: string, path: string): { operation: OperationId; id?: string } | null {
  const entries = Object.entries(operations) as [OperationId, (typeof operations)[OperationId]][];
  const exact = entries.filter(([, spec]) => spec.path === path);
  if (exact.length) {
    const found = exact.find(([, spec]) => spec.method === method);
    return found ? { operation: found[0] } : null;
  }
  const candidates = entries.sort((a, b) => Number(a[1].path.includes(":id")) - Number(b[1].path.includes(":id")));
  for (const [operation, spec] of candidates) {
    if (spec.method !== method) continue;
    const actual = path.split("/"), expected = spec.path.split("/");
    if (actual.length !== expected.length) continue;
    const index = expected.indexOf(":id");
    if (!expected.every((part, i) => part === ":id" || part === actual[i])) continue;
    if (index < 0) return { operation };
    try {
      const id = decodeURIComponent(actual[index]);
      operationPath(operation, id);
      return { operation, id };
    } catch { return null; }
  }
  return null;
}
