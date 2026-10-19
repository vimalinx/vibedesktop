import type { DesktopDataSource, LocalProbeStatus } from "./data-source";
import { DesktopDataError } from "./data-source";
import type { AppDirectoryItem, CatalogAgentInstallInstruction, CatalogWorkspaceInstallStatus, DesktopPayload, EmbedCheckResult, LocalAppBundle, LocalAppDiscoveryCandidate, LocalAppImportPlan, LocalAppImportResult, LocalAppView, VibeUser } from "./types";
import { createProtocolTransport, type DesktopClientOptions } from "./transport";
import type { ProtocolManifest } from "./manifest";

/** Framework-independent SDK. The local React UI is one consumer, not the protocol owner. */
export function createDesktopClient(options: DesktopClientOptions = {}): DesktopDataSource {
  const { request } = createProtocolTransport(options);
  return {
    async describe() {
      const info = await request<ProtocolManifest>("describe");
      if (info.protocol !== "vibedesktop" || info.version?.major !== 1 || !Number.isSafeInteger(info.version.minor) || info.version.minor < 0 || !Array.isArray(info.capabilities) || info.capabilities.some(c => typeof c !== "string")) {
        throw new DesktopDataError("Incompatible desktop protocol discovery.", { code: "protocol_mismatch", outcome: "not_started" });
      }
      return info;
    },
    async getUser() { return (await request<{ user: VibeUser | null }>("session.read")).user; },
    loadDesktop: () => request<DesktopPayload>("desktop.read"),
    restoreDesktop: snapshot => request<DesktopPayload>("desktop.restore", { json: snapshot }),
    createUrlApp: input => request<DesktopPayload>("apps.create", { json: input }),
    updateApp: (id, patch) => request<DesktopPayload>("apps.update", { id, json: patch }),
    deleteApp: id => request<DesktopPayload>("apps.delete", { id }),
    batchApps: input => request<DesktopPayload>("apps.batch", { json: input }),
    updateDesktop: patch => request<DesktopPayload>("desktop.update", { json: patch }),
    async listCatalog() { return (await request<{ items: AppDirectoryItem[] }>("catalog.list")).items; },
    addCatalogApp: id => request<DesktopPayload>("catalog.add", { id }),
    catalogInstalls: {
      async list() { return (await request<{ installs: CatalogWorkspaceInstallStatus[] }>("catalog.installs")).installs; },
      async install(id) { return (await request<{ install: CatalogWorkspaceInstallStatus }>("catalog.install", { id })).install; },
      async uninstall(id, purgeData = false) { return (await request<{ install: CatalogWorkspaceInstallStatus }>("catalog.uninstall", { id, json: { purgeData } })).install; },
      async agentInstruction(id) { return (await request<{ instruction: CatalogAgentInstallInstruction }>("catalog.agentInstruction", { id })).instruction; },
    },
    urlMetadata: {
      resolve: url => request("url.resolve", { json: { url } }),
      async checkEmbeddable(url) {
        const result = await request<EmbedCheckResult>("url.embed", { json: { url } });
        return { embeddable: result.embeddable, message: result.message };
      },
    },
    localApps: {
      // One malformed record (older daemon, partial write) is dropped instead of breaking every consumer.
      async list() { return (await request<{ apps: unknown[] }>("localApps.list")).apps.filter(isLocalAppView); },
      async get(id) { return (await request<{ app: LocalAppView }>("localApps.get", { id })).app; },
      async create(input) { return (await request<{ app: LocalAppView }>("localApps.create", { json: input })).app; },
      async update(id, patch) { return (await request<{ app: LocalAppView }>("localApps.update", { id, json: patch })).app; },
      async remove(id) { await request("localApps.remove", { id }); },
      async control(id, action) { await request("localApps.control", { id, json: { action } }); },
      async logs(id) { return (await request<{ logs: string[] }>("localApps.logs", { id })).logs; },
      async discover() {
        const { candidates } = await request<{ candidates: unknown[] }>("localApps.discover");
        return candidates.filter((item): item is LocalAppDiscoveryCandidate => {
          const candidate = item as Partial<LocalAppDiscoveryCandidate> | null;
          return !!candidate && typeof candidate.name === "string" && typeof candidate.port === "number" && Array.isArray(candidate.args);
        });
      },
      async planImport(input) { return (await request<{ plan: LocalAppImportPlan }>("localApps.importPlan", { json: input, timeoutMs: 45_000 })).plan; },
      // A verified start waits for the project to boot and pass its health probe.
      async importProject(input) { return (await request<{ result: LocalAppImportResult }>("localApps.import", { json: input, timeoutMs: 120_000 })).result; },
      async bundle(id) { return (await request<{ bundle: LocalAppBundle | null }>("localApps.bundle", { id })).bundle; },
      async resolveIcon(id) {
        try { return await request<Blob>("localApps.icon", { id }); }
        catch (error) { if (error instanceof DesktopDataError && error.code === "no_icon") return null; throw error; }
      },
      async checkEmbeddable(id) {
        try {
          const result = await request<{ embeddable: boolean }>("localApps.embed", { id });
          return typeof result.embeddable === "boolean" ? result.embeddable : null;
        } catch (error) { if (error instanceof DesktopDataError && ["protocol_mismatch", "invalid_response"].includes(error.code)) throw error; return null; }
      },
      async daemonStatus() {
        try { return await request("localApps.status"); }
        catch (error) { if (error instanceof DesktopDataError && ["protocol_mismatch", "invalid_response"].includes(error.code)) throw error; return { ok: false }; }
      },
    },
    localProbe: {
      async probe(url): Promise<LocalProbeStatus> {
        const parsed = new URL(url);
        if (!["http:", "https:"].includes(parsed.protocol) || parsed.username || parsed.password ||
            !(/^(localhost|\[::1\])$/.test(parsed.hostname) || /^127\.\d+\.\d+\.\d+$/.test(parsed.hostname))) throw new DesktopDataError("Only loopback URLs may be probed.", { code: "invalid_probe", outcome: "not_started" });
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 1600);
        try {
          await (options.fetch ?? fetch)(url, { mode: "no-cors", cache: "no-store", signal: controller.signal });
          return "found";
        } catch { return "missing"; }
        finally { clearTimeout(timeout); }
      },
    },
    systemStatus: { read: () => request("system.read") },
    version: {
      read: (check = false) => request("version.read", { query: check ? { check: "1" } : undefined }),
      change: (action, confirm) => request("version.change", { json: { action, confirm } }),
    },
    packagePreferences: {
      read: id => request("packages.preferences.read", { id }),
      replace: (id, input) => request("packages.preferences.replace", { id, json: input }),
    },
  };
}
export type { DesktopClientOptions } from "./transport";

/** The fields every consumer of a local app reads; anything else stays optional. */
function isLocalAppView(value: unknown): value is LocalAppView {
  if (!value || typeof value !== "object") return false;
  const app = value as Record<string, unknown>;
  const status = app.status as Record<string, unknown> | null | undefined;
  return typeof app.id === "string" && typeof app.name === "string" && typeof app.command === "string" &&
    typeof app.port === "number" && !!status && typeof status === "object" &&
    typeof status.running === "boolean" && typeof status.url === "string";
}
