import { buildHostedShellInstallCommand } from "@/lib/hosted-installer-contract";

export const appInstallerPath = "/api/setup/app";

export function buildAppInstallCommand(requestUrl: string): string {
  return buildHostedShellInstallCommand(requestUrl, appInstallerPath);
}
