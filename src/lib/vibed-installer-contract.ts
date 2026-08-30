import { buildHostedShellInstallCommand } from "@/lib/hosted-installer-contract";

export const vibedInstallerPath = "/api/setup/vibed";

export function buildVibedInstallCommand(requestUrl: string): string {
  return buildHostedShellInstallCommand(requestUrl, vibedInstallerPath);
}
