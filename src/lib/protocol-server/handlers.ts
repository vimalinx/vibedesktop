import type { OperationId } from "@/protocol/v1/operations";
import * as sessionRoute from "@/app/api/me/route";
import * as desktopRoute from "@/app/api/desktop/route";
import * as restoreRoute from "@/app/api/desktop/restore/route";
import * as appsRoute from "@/app/api/apps/route";
import * as appRoute from "@/app/api/apps/[id]/route";
import * as batchRoute from "@/app/api/apps/batch/route";
import * as catalogRoute from "@/app/api/app-directory/route";
import * as catalogAddRoute from "@/app/api/app-directory/[id]/add/route";
import * as installsRoute from "@/app/api/catalog-installs/route";
import * as installRoute from "@/app/api/catalog-installs/[id]/route";
import * as agentInstructionRoute from "@/app/api/catalog-installs/[id]/agent-instruction/route";
import * as marketInstallsRoute from "@/app/api/market-installs/route";
import * as marketPreviewRoute from "@/app/api/market-installs/preview/route";
import * as marketInstallRoute from "@/app/api/market-installs/[id]/route";
import * as metadataRoute from "@/app/api/apps/metadata/resolve/route";
import * as embedRoute from "@/app/api/apps/metadata/embed/route";
import * as localAppsRoute from "@/app/api/local-apps/route";
import * as localAppRoute from "@/app/api/local-apps/[id]/route";
import * as controlRoute from "@/app/api/local-apps/[id]/control/route";
import * as logsRoute from "@/app/api/local-apps/[id]/logs/route";
import * as discoveryRoute from "@/app/api/local-apps/discovery/route";
import * as importPlanRoute from "@/app/api/local-apps/import/plan/route";
import * as importRoute from "@/app/api/local-apps/import/route";
import * as bundleRoute from "@/app/api/local-apps/[id]/bundle/route";
import * as iconRoute from "@/app/api/local-apps/[id]/resolve-icon/route";
import * as localEmbedRoute from "@/app/api/local-apps/[id]/embed-check/route";
import * as daemonStatusRoute from "@/app/api/local-apps/daemon-status/route";
import * as systemRoute from "@/app/api/system/status/route";
import * as versionRoute from "@/app/api/desktop/version/route";
import * as preferencesRoute from "@/lib/protocol-server/package-preferences";

type Handler = (request: Request, context: { params: Promise<{ id: string }> }) => Promise<Response>;
/** Only reviewed, versioned operations are exposed; setup/install scripts remain outside this API. */
export const handlers = {
  "session.read": sessionRoute.GET,
  "desktop.read": desktopRoute.GET,
  "desktop.update": desktopRoute.PATCH,
  "desktop.restore": restoreRoute.POST,
  "apps.create": appsRoute.POST,
  "apps.update": appRoute.PATCH,
  "apps.delete": appRoute.DELETE,
  "apps.batch": batchRoute.POST,
  "catalog.list": catalogRoute.GET,
  "catalog.add": catalogAddRoute.POST,
  "catalog.installs": installsRoute.GET,
  "catalog.install": installRoute.POST,
  "catalog.uninstall": installRoute.DELETE,
  "catalog.agentInstruction": agentInstructionRoute.GET,
  "market.preview": marketPreviewRoute.POST,
  "market.installs": marketInstallsRoute.GET,
  "market.install": marketInstallsRoute.POST,
  "market.uninstall": marketInstallRoute.DELETE,
  "url.resolve": metadataRoute.POST,
  "url.embed": embedRoute.POST,
  "localApps.list": localAppsRoute.GET,
  "localApps.get": localAppRoute.GET,
  "localApps.create": localAppsRoute.POST,
  "localApps.update": localAppRoute.PATCH,
  "localApps.remove": localAppRoute.DELETE,
  "localApps.control": controlRoute.POST,
  "localApps.logs": logsRoute.GET,
  "localApps.discover": discoveryRoute.GET,
  "localApps.importPlan": importPlanRoute.POST,
  "localApps.import": importRoute.POST,
  "localApps.bundle": bundleRoute.GET,
  "localApps.icon": iconRoute.POST,
  "localApps.embed": localEmbedRoute.GET,
  "localApps.status": daemonStatusRoute.GET,
  "system.read": systemRoute.GET,
  "version.read": versionRoute.GET,
  "version.change": versionRoute.POST,
  "packages.preferences.read": preferencesRoute.GET,
  "packages.preferences.replace": preferencesRoute.PUT,
} satisfies Record<OperationId, Handler>;
