import { buildHostedShellInstallCommand } from "@/lib/hosted-installer-contract";

export const addAppSkillInstallerPath = "/api/setup/add-app-skill";

export function buildAddAppSkillInstallCommand(requestUrl: string): string {
  return buildHostedShellInstallCommand(requestUrl, addAppSkillInstallerPath);
}
