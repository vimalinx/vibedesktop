import type { DesktopPackageBundle, DesktopShellHost, DesktopShellModule } from "@/protocol/shell/package";
/** Trusted same-origin JavaScript; Shadow DOM isolates CSS, not execution authority. */
export async function mountDesktopPackage(bundle: DesktopPackageBundle, host: Omit<DesktopShellHost, "asset" | "styleContent">) {
  const urls = new Map<string, string>();
  const contentStyles = new Set<HTMLStyleElement>();
  for (const [name, file] of Object.entries(bundle.files)) {
    const bytes = file.text !== undefined ? file.text : Uint8Array.from(atob(file.base64!), c => c.charCodeAt(0));
    urls.set(name, URL.createObjectURL(new Blob([bytes], { type: file.mediaType })));
  }
  const asset = (name: string) => {
    const url = urls.get(name);
    if (!url) throw new Error(`Unknown package asset: ${name}`);
    return url;
  };
  const resolveCss = (css: string) => css.replace(/asset\(\s*["']([^"']+)["']\s*\)/g, (_, name) => `url("${asset(name)}")`);
  const cleanupAssets = () => { for (const url of urls.values()) URL.revokeObjectURL(url); urls.clear(); for (const style of contentStyles) style.remove(); contentStyles.clear(); };
  host.signal.addEventListener("abort", cleanupAssets, { once: true });
  let dispose: void | (() => void);
  try {
    // Shell styles stay in the shadow tree. Hosted app bodies use stable light-DOM
    // slots, with a separate managed content stylesheet so iframe state survives switches.
    const template = document.createElement("template");
    template.innerHTML = bundle.files[bundle.entry.html].text!;
    host.root.append(template.content.cloneNode(true));
    const style = document.createElement("style");
    style.textContent = resolveCss(bundle.files[bundle.entry.css].text!);
    host.root.append(style);
    const moduleUrl = asset(bundle.entry.module);
    const entryModule: DesktopShellModule = await import(/* webpackIgnore: true */ moduleUrl);
    if (host.signal.aborted) { cleanupAssets(); return () => {}; }
    if (typeof entryModule.mount !== "function") throw new Error("The package module must export mount(host).");
    dispose = await entryModule.mount({ ...host, asset, styleContent(css) {
      if (host.signal.aborted) throw new Error("The package is no longer active.");
      const style = document.createElement("style");
      style.dataset.desktopContentStyle = host.packageId;
      style.textContent = resolveCss(css)
        .replace(/:desktop\b/g, `.desktop:has(>.package-surface[data-desktop-package="${host.packageId}"])`)
        .replace(/:host\b/g, `.package-surface[data-desktop-package="${host.packageId}"]`);
      document.head.append(style); contentStyles.add(style);
      return () => { style.remove(); contentStyles.delete(style); };
    } });
    if (host.signal.aborted) { if (typeof dispose === "function") dispose(); cleanupAssets(); return () => {}; }
  } catch (error) { cleanupAssets(); throw error; }
  return () => { try { if (typeof dispose === "function") dispose(); } finally { cleanupAssets(); } };
}
