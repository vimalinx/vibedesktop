/** Build with any TypeScript frontend bundler and serve on the desktop's origin. */
import { createDesktopClient, packageCompatibility, validatePackageManifest } from "../../src/protocol/v1";
import rawManifest from "./manifest.json";

export async function connectDesktopPackage() {
  const manifest = validatePackageManifest(rawManifest);
  const desktop = createDesktopClient();
  const host = await desktop.describe();
  const support = packageCompatibility(manifest, host);
  if (!support.compatible) throw new Error(`Incompatible desktop service: ${JSON.stringify(support)}`);
  const [state, preferences] = await Promise.all([
    desktop.loadDesktop(), desktop.packagePreferences.read(manifest.id),
  ]);
  // Render state.apps using this frontend's own CSS, layout and event handlers.
  // For a save, use preferences.revision as ifRevision and handle conflict 409.
  return { desktop, manifest, state, preferences };
}
