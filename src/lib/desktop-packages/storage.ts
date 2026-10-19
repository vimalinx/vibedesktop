import type { DesktopPackageBundle } from "@/protocol/shell/package";
import { builtInPackages, validateBundle } from "./bundle";
const database = "vibedesktop-shell-packages-v1";
async function transact<T>(mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    const opening = indexedDB.open(database, 1);
    opening.onupgradeneeded = () => opening.result.createObjectStore("packages", { keyPath: "manifest.id" });
    opening.onerror = () => reject(opening.error);
    opening.onsuccess = () => {
      const db = opening.result;
      const transaction = db.transaction("packages", mode);
      const request = action(transaction.objectStore("packages"));
      transaction.oncomplete = () => { const result = request.result; db.close(); resolve(result); };
      transaction.onabort = transaction.onerror = () => { db.close(); reject(transaction.error || new Error("Package storage failed.")); };
    };
  });
}
export const installedPackages = () => transact<DesktopPackageBundle[]>("readonly", s => s.getAll());
export async function savePackage(bundle: DesktopPackageBundle) {
  validateBundle(bundle);
  if (builtInPackages.some(p => p.id === bundle.manifest.id)) throw new Error("Built-in packages cannot be overwritten. Give your package a unique ID.");
  const current = await installedPackages();
  if (!current.some(p => p.manifest.id === bundle.manifest.id) && current.length >= 16) throw new Error("Remove a package before importing another (16 maximum).");
  await transact("readwrite", s => s.put(bundle));
}
export const removePackage = (id: string) => transact("readwrite", s => s.delete(id));
export async function loadPackage(id: string): Promise<DesktopPackageBundle> {
  const builtin = builtInPackages.find(p => p.id === id);
  if (builtin) {
    const response = await fetch(builtin.url, { cache: "no-cache" });
    if (!response.ok) throw new Error("Desktop package could not be loaded.");
    return validateBundle(await response.json());
  }
  const result = await transact("readonly", s => s.get(id));
  if (!result) throw new Error("This desktop package is not installed in this browser.");
  return validateBundle(result);
}
export function downloadPackage(bundle: DesktopPackageBundle) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(bundle, null, 2)], { type: "application/json" }));
  const a = document.createElement("a"); a.href = url; a.download = `${bundle.manifest.id}-${bundle.manifest.version}.vibepack.json`; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Replace imported code atomically; callers must first show the backup trust confirmation. */
export async function replacePackages(bundles: DesktopPackageBundle[]) {
  if (bundles.length > 16 || new Set(bundles.map(b => b.manifest.id)).size !== bundles.length) throw new Error("Invalid package collection.");
  for (const b of bundles) { validateBundle(b); if (builtInPackages.some(p => p.id === b.manifest.id)) throw new Error("A backup cannot replace a built-in package."); }
  await transact("readwrite", store => {
    store.clear();
    let last: IDBRequest = store.count();
    for (const bundle of bundles) last = store.put(bundle);
    return last;
  });
}
