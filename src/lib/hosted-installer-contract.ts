export function buildHostedShellInstallCommand(requestUrl: string, installerPath: string): string {
  const installerUrl = new URL(installerPath, requestUrl).toString();
  return `curl -fsSL ${shellQuote(installerUrl)} | sh`;
}

function shellQuote(value: string): string {
  const apostrophe = String.fromCharCode(39);
  return apostrophe + value.split(apostrophe).join(`${apostrophe}"${apostrophe}"${apostrophe}`) + apostrophe;
}
