"use client";
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import type { DesktopShellCommands, DesktopShellSnapshot, DesktopShellHost, SystemToolPresentation } from "@/protocol/shell/package";
import { desktopData } from "@/lib/desktop-data";
import { packageCompatibility } from "@/protocol/v1/package";
import { loadPackage } from "@/lib/desktop-packages/storage";
import { mountDesktopPackage } from "@/lib/desktop-packages/runtime";
import { WindowVisible } from "@/components/window/window-visibility";
import { SystemToolsContext } from "./system-tools-context";
import "./packages.css";

type Snapshot = Omit<DesktopShellSnapshot, "preferences" | "reducedMotion">;
export function PackageShell({ packageId, snapshot, commands, renderWindow }: {
  packageId: string; snapshot: Snapshot; commands: DesktopShellCommands;
  renderWindow: (id: string) => ReactNode;
}) {
  const surface = useRef<HTMLDivElement>(null);
  const bodies = useRef(new Map<string, HTMLDivElement>());
  const slots = useRef(new Map<string, HTMLSlotElement>());
  const listeners = useRef(new Set<(state: DesktopShellSnapshot) => void>());
  const props = useRef({ snapshot, commands }); props.current = { snapshot, commands };
  const preferences = useRef<DesktopShellSnapshot["preferences"]>({ revision: null, schemaVersion: 1, values: {} });
  const [toolPreferences, setToolPreferences] = useState(preferences.current);
  const [presentation, setPresentation] = useState<SystemToolPresentation>({ appearance: "custom", colorScheme: "light", accent: "#2979ed" });
  const saveToolPreferences = useRef<DesktopShellHost["savePreferences"] | null>(null);
  const [ready, setReady] = useState(false);
  const [, updateBodies] = useState(0);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const reduced = useRef(false);
  // Stable containers survive a package switch, including mounted iframe/form state.
  if (typeof document !== "undefined") for (const w of snapshot.windows) if (!bodies.current.has(w.id)) {
    const node = document.createElement("div"); node.className = "package-app-content"; node.dataset.windowContent = w.id; node.slot = `window-${w.id}`;
    bodies.current.set(w.id, node);
  }
  const readSnapshot = () => structuredClone({ ...props.current.snapshot, preferences: preferences.current, reducedMotion: reduced.current });
  useLayoutEffect(() => {
    let attached = false;
    for (const node of bodies.current.values()) if (node.parentNode !== surface.current) { surface.current?.append(node); attached = true; }
    if (attached) updateBodies(v => v + 1);
    for (const [id, node] of bodies.current) if (!snapshot.windows.some(w => w.id === id)) { node.remove(); bodies.current.delete(id); slots.current.delete(id); }
  }, [snapshot.windows]);
  useLayoutEffect(() => {
    for (const listener of listeners.current) listener(readSnapshot());
  });
  useEffect(() => {
    const element = surface.current!;
    const root = element.shadowRoot ?? element.attachShadow({ mode: "open" });
    root.replaceChildren();
    const controller = new AbortController();
    const desktop = element.closest<HTMLElement>(".desktop");
    const media = matchMedia("(prefers-reduced-motion: reduce)"); reduced.current = media.matches;
    const broadcast = () => { for (const listener of listeners.current) listener(readSnapshot()); };
    media.addEventListener("change", () => { reduced.current = media.matches; broadcast(); }, { signal: controller.signal });
    setReady(false); setError("");
    let unmount: (() => void) | undefined;
    const emitFailure = (error: unknown) => { if (!controller.signal.aborted) setError(error instanceof Error ? error.message : "Desktop package failed."); };
    const startupTimer = setTimeout(() => { emitFailure(new Error("桌面包启动超时，请重试或选择其他桌面。")); controller.abort(); }, 15000);
    async function mount() {
      const data = desktopData();
      const [bundle, hostManifest, saved] = await Promise.all([loadPackage(packageId), data.describe(), data.packagePreferences.read(packageId)]);
      if (controller.signal.aborted) return;
      if (!packageCompatibility(bundle.manifest, hostManifest).compatible) throw new Error("The package requires an incompatible desktop protocol or capability.");
      preferences.current = saved;
      setToolPreferences(saved);
      const proxy = Object.fromEntries(Object.keys(props.current.commands).map(key => [key, (...args: unknown[]) => {
        if (controller.signal.aborted) return;
        const fn = props.current.commands[key as keyof DesktopShellCommands] as (...args: unknown[]) => void;
        return fn(...args);
      }])) as unknown as DesktopShellCommands;
      const host: Omit<DesktopShellHost, "asset" | "styleContent"> = {
        ...proxy, version: { major: 1, minor: 1 }, packageId, root, signal: controller.signal, data,
        snapshot: readSnapshot,
        presentSystemTools(next) {
          if (controller.signal.aborted) return;
          if (!/^[a-z][a-z0-9-]{0,39}$/.test(next.appearance) || !["light", "dark"].includes(next.colorScheme) || !/^#[a-f\d]{6}$/i.test(next.accent)) throw new Error("Invalid system-tool presentation.");
          setPresentation(current => current.appearance === next.appearance && current.colorScheme === next.colorScheme && current.accent === next.accent ? current : { ...next });
          for (const target of [element, desktop]) if (target) {
            target.dataset.systemAppearance = next.appearance;
            target.dataset.systemColorScheme = next.colorScheme;
            target.style.setProperty("--system-accent", next.accent);
          }
        },
        subscribe(listener) {
          if (controller.signal.aborted) return () => {};
          const safe = (state: DesktopShellSnapshot) => { try { listener(state); } catch (error) { emitFailure(error); } };
          listeners.current.add(safe); safe(readSnapshot()); return () => { listeners.current.delete(safe); };
        },
        content(id) {
          if (controller.signal.aborted || !bodies.current.has(id)) throw new Error("Unknown or inactive window content.");
          let slot = slots.current.get(id);
          if (!slot) { slot = document.createElement("slot"); slot.name = `window-${id}`; slot.className = "package-content-slot"; slots.current.set(id, slot); }
          return slot;
        },
        async savePreferences(values, schemaVersion = bundle.manifest.preferencesSchemaVersion) {
          if (controller.signal.aborted) throw new Error("This desktop package is no longer active.");
          const next = await data.packagePreferences.replace(packageId, { ifRevision: preferences.current.revision, schemaVersion, values });
          if (!controller.signal.aborted) { preferences.current = next; setToolPreferences(next); broadcast(); }
          return next;
        },
      };
      host.presentSystemTools({ appearance: "custom", colorScheme: "light", accent: "#2979ed" });
      saveToolPreferences.current = host.savePreferences;
      const cleanup = await mountDesktopPackage(bundle, host);
      if (controller.signal.aborted) cleanup();
      else { unmount = cleanup; setReady(true); }
    }
    void mount().catch(emitFailure).finally(() => clearTimeout(startupTimer));
    const currentListeners = listeners.current;
    return () => {
      clearTimeout(startupTimer); controller.abort(); currentListeners.clear();
      saveToolPreferences.current = null;
      for (const target of [element, desktop]) if (target) {
        delete target.dataset.systemAppearance; delete target.dataset.systemColorScheme;
        target.style.removeProperty("--system-accent");
      }
      try { unmount?.(); } catch { /* The host must still clear a failed package. */ }
      // Only slots and author chrome change. Live app bodies remain connected.
      root.replaceChildren();
    };
  }, [packageId, attempt]);
  return <>
    <div ref={surface} className="package-surface" data-desktop-package={packageId} />
    {snapshot.windows.map(w => {
      const node = bodies.current.get(w.id);
      return node?.isConnected ? createPortal(
        <SystemToolsContext.Provider value={{ presentation, packageId, userName: snapshot.userName, preferences: toolPreferences,
          savePreferences: values => { if (!saveToolPreferences.current) return Promise.reject(new Error("桌面正在切换，请稍后重试。")); return saveToolPreferences.current(values); },
          patchPreferences: values => { if (!saveToolPreferences.current) return Promise.reject(new Error("桌面正在切换，请稍后重试。")); return saveToolPreferences.current({ ...preferences.current.values, ...values }); },
          managePackages: commands.managePackages, wallpaper: commands.wallpaper }}>
          <WindowVisible.Provider value={w.mode === "open"}>{renderWindow(w.id)}</WindowVisible.Provider>
        </SystemToolsContext.Provider>, node, w.id) : null;
    })}
    {!ready || error ? <div className="package-loading" role={error ? "alert" : "status"}>
      <strong>{error ? "桌面包暂时无法启动" : "正在准备你的桌面"}</strong>
      {error ? <><p>{error}</p><button onClick={() => setAttempt(v => v + 1)}>重试</button><button onClick={commands.managePackages}>选择其他桌面</button><button onClick={() => { window.location.href = "/?desktop=classic"; }}>进入恢复桌面</button></> : <span className="package-loader" />}
    </div> : null}
  </>;
}
