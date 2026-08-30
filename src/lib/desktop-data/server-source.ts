import type {
  AppDirectoryItem,
  ApiErrorBody,
  DaemonHealth,
  DesktopPayload,
  EmbedCheckResult,
  LocalAppControlAction,
  LocalAppDiscoveryCandidate,
  LocalAppView,
  MetadataResolveResult,
  SystemStatus,
  VibeUser
} from "@/lib/contracts";
import {
  DesktopDataError,
  type CreateUrlAppInput,
  type DesktopAppPatch,
  type DesktopDataSource,
  type DesktopPatch,
  type EmbedVerdict,
  type LocalAppInput,
  type LocalAppsCapability,
  type LocalProbeCapability,
  type LocalProbeStatus,
  type UrlMetadataCapability
} from "@/lib/desktop-data/contract";

/**
 * The product's local-machine data source: the same `/api/*` requests the
 * components used to issue inline, moved behind the shared interface.
 *
 * Two things happen here that used to be scattered across call sites:
 *
 * - Response envelopes (`{ user }`, `{ items }`, `{ apps }`, `{ app }`,
 *   `{ logs }`) are unwrapped, so components only ever see domain types.
 * - A non-OK response becomes a `DesktopDataError` carrying the server's own
 *   `code` and `message` when it sent an `ApiErrorBody`. `ApiErrorBody` was
 *   declared and unused while three call sites re-declared its shape inline;
 *   this is now the only place it is read.
 */
export function createServerDataSource(): DesktopDataSource {
  return {
    async getUser(): Promise<VibeUser | null> {
      // No login: /api/me auto-provisions the single local user.
      const body = await requestJson<{ user: VibeUser | null }>("/api/me");
      return body.user;
    },

    loadDesktop(): Promise<DesktopPayload> {
      return requestJson<DesktopPayload>("/api/desktop");
    },

    createUrlApp(input: CreateUrlAppInput): Promise<DesktopPayload> {
      return requestJson<DesktopPayload>("/api/apps", { method: "POST", json: input });
    },

    updateApp(appId: string, patch: DesktopAppPatch): Promise<DesktopPayload> {
      return requestJson<DesktopPayload>(`/api/apps/${appId}`, { method: "PATCH", json: patch });
    },

    deleteApp(appId: string): Promise<DesktopPayload> {
      return requestJson<DesktopPayload>(`/api/apps/${appId}`, { method: "DELETE" });
    },

    updateDesktop(patch: DesktopPatch): Promise<DesktopPayload> {
      return requestJson<DesktopPayload>("/api/desktop", { method: "PATCH", json: patch });
    },

    async listCatalog(): Promise<AppDirectoryItem[]> {
      const body = await requestJson<{ items: AppDirectoryItem[] }>("/api/app-directory");
      return body.items ?? [];
    },

    addCatalogApp(itemId: string): Promise<DesktopPayload> {
      return requestJson<DesktopPayload>(`/api/app-directory/${itemId}/add`, { method: "POST" });
    },

    urlMetadata: serverUrlMetadata,
    localApps: serverLocalApps,
    localProbe: serverLocalProbe,
    systemStatus: {
      read(): Promise<SystemStatus> {
        return requestJson<SystemStatus>("/api/system/status");
      }
    }
  };
}

const serverUrlMetadata: UrlMetadataCapability = {
  resolve(url: string): Promise<MetadataResolveResult> {
    return requestJson<MetadataResolveResult>("/api/apps/metadata/resolve", { method: "POST", json: { url } });
  },

  async checkEmbeddable(url: string): Promise<EmbedVerdict> {
    const result = await requestJson<EmbedCheckResult>("/api/apps/metadata/embed", { method: "POST", json: { url } });
    return { embeddable: result.embeddable, message: result.message };
  }
};

const serverLocalApps: LocalAppsCapability = {
  async list(): Promise<LocalAppView[]> {
    const body = await requestJson<{ apps: LocalAppView[] }>("/api/local-apps");
    return body.apps ?? [];
  },

  async get(id: string): Promise<LocalAppView> {
    const body = await requestJson<{ app: LocalAppView }>(`/api/local-apps/${id}`);
    return body.app;
  },

  async create(input: LocalAppInput): Promise<LocalAppView> {
    const body = await requestJson<{ app: LocalAppView }>("/api/local-apps", { method: "POST", json: input });
    return body.app;
  },

  async update(id: string, patch: Partial<LocalAppInput>): Promise<LocalAppView> {
    const body = await requestJson<{ app: LocalAppView }>(`/api/local-apps/${id}`, { method: "PATCH", json: patch });
    return body.app;
  },

  async remove(id: string): Promise<void> {
    await requestJson<{ deleted: string }>(`/api/local-apps/${id}`, { method: "DELETE" });
  },

  async control(id: string, action: LocalAppControlAction): Promise<void> {
    await requestJson<{ app: LocalAppView }>(`/api/local-apps/${id}/control`, { method: "POST", json: { action } });
  },

  async logs(id: string): Promise<string[]> {
    const body = await requestJson<{ logs: string[] }>(`/api/local-apps/${id}/logs`);
    return body.logs ?? [];
  },

  async discover(): Promise<LocalAppDiscoveryCandidate[]> {
    const body = await requestJson<{ candidates: LocalAppDiscoveryCandidate[] }>("/api/local-apps/discovery");
    return body.candidates ?? [];
  },

  /** The one endpoint that answers with image bytes rather than JSON. */
  async resolveIcon(id: string): Promise<Blob | null> {
    const response = await fetch(`/api/local-apps/${id}/resolve-icon`, { method: "POST" });
    if (!response.ok) return null;
    const blob = await response.blob();
    return blob.size > 0 ? blob : null;
  },

  async checkEmbeddable(id: string): Promise<boolean | null> {
    try {
      const result = await requestJson<{ embeddable?: boolean }>(`/api/local-apps/${id}/embed-check`);
      return typeof result.embeddable === "boolean" ? result.embeddable : null;
    } catch {
      // The check could not run. That is not a refusal, so say "unknown".
      return null;
    }
  },

  async daemonStatus(): Promise<DaemonHealth> {
    try {
      return await requestJson<DaemonHealth>("/api/local-apps/daemon-status");
    } catch {
      return { ok: false };
    }
  }
};

const serverLocalProbe: LocalProbeCapability = {
  /**
   * Reachability ping, not a data fetch: `no-cors` means the response is opaque,
   * so a resolved promise is the whole signal.
   */
  async probe(url: string): Promise<LocalProbeStatus> {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 1600);

    try {
      await fetch(url, { mode: "no-cors", cache: "no-store", signal: controller.signal });
      return "found";
    } catch {
      return "missing";
    } finally {
      window.clearTimeout(timeout);
    }
  }
};

interface RequestOptions {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  json?: unknown;
}

async function requestJson<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const method = options.method ?? "GET";
  let response: Response;

  try {
    response = await fetch(
      path,
      options.json === undefined
        ? { method }
        : { method, headers: { "content-type": "application/json" }, body: JSON.stringify(options.json) }
    );
  } catch {
    throw new DesktopDataError("The desktop service is unreachable.", { code: "network_error" });
  }

  if (!response.ok) {
    throw await errorFromResponse(response);
  }

  return (await response.json()) as T;
}

async function errorFromResponse(response: Response): Promise<DesktopDataError> {
  const body = (await response.json().catch(() => null)) as ApiErrorBody | null;
  const error = body?.error;

  return new DesktopDataError(error?.message || `Request failed with status ${response.status}.`, {
    code: error?.code,
    status: response.status,
    // Only a real `ApiErrorBody` message is fit to show a user; a bare status
    // line is not. See `reasonFor` in contract.ts.
    serverMessage: error?.message || undefined
  });
}
