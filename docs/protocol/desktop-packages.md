# Browser-native desktop packages

Vibe Desktop includes two complete, editable desktop packages: **Windows 11** and **macOS**. They run through the same host interface used by imported packages. Window frames, desktop icons, taskbars, menus, effects, and interactions are ordinary HTML, CSS, and JavaScript owned by the package. These are browser desktop appearances; they do not install or emulate either operating system.

Open **桌面外观 / Desktop appearance** in the taskbar or Dock to switch, export, import, or remove packages. `Ctrl/Cmd + Alt + P` opens the manager independently of package code. The default is Windows 11. A classic recovery desktop is available at `/?desktop=classic`; `/?desktop=windows` and `/?desktop=macos` explicitly select either built-in. Selecting a package in the manager removes that URL override and saves the selection in this browser.

## Included desktops

| Detail | Windows 11 | macOS |
| --- | --- | --- |
| Desktop | Blue folded wallpaper, left-aligned icons | Layered color wallpaper, right-aligned icons |
| Navigation | Centered taskbar, Start, search, window overview | Global menu, magnifying Dock, launchpad, Spotlight-style search |
| Windows | Right-side controls, maximize hover layout, edge snapping | Traffic lights, translucent title bars, window menu and snapping |
| Effects | Glass, shadows, entry/minimize transitions, ambient light, Canvas particles | Glass, Dock magnification, entry/minimize transitions, ambient light, Canvas particles |
| Personalization | Per-package dark mode, accent, glass, motion, icon and Dock size, icon positions | Same settings in the control center |

Menus operate Vibe Desktop applications, windows, scenes, groups, tasks, appearance, and service status. A local-service indicator reflects the host's actual connection state. Mobile layouts keep menus and windows within the viewport and provide scrollable Dock app lists. `prefers-reduced-motion`, the motion toggle, and page visibility suspend the supplied continuous effects. Window overview and package switching retain mounted application bodies, including embedded-page drafts. A reload, restore, closed window, or switch to the classic recovery frontend does not promise to retain unsaved application state.

## Make a package

The working, framework-free [Aurora Lab example](../../examples/effects-desktop) contains a Canvas background, CSS animated gradients, a Web Animations entry effect, application launchers, live application slots, and persistent effect settings.

```sh
npm run packages:pack -- examples/effects-desktop /tmp/aurora.vibepack.json
```

Import that file in the appearance manager, review the trust prompt, install, and choose **Use**. The packer writes a new file and refuses to overwrite an existing destination. To customize a built-in desktop, export it from the manager, edit its `files` entries, and assign a new `manifest.id` before importing. Built-in IDs cannot be overwritten. Built-in author sources live in `public/desktop-packages/source`; `npm run packages:build` regenerates the two distributed bundles and also runs before `npm run build`.

An author directory has:

```text
manifest.json
desktop.html   # HTML fragment, no document wrapper needed
desktop.css    # complete shell stylesheet
desktop.js     # ES module exporting mount(host)
assets/        # optional images, fonts, shaders, media, WASM, etc.
```

The CLI uses those exact entry filenames. It skips dotfiles, `node_modules`, `README.md`, and the metadata file, and rejects asset symlinks. Use path names made of ASCII letters, digits, `_`, `-`, `.`, and `/`, without empty, `.` or `..` path segments. Bundle dependencies into the module entry. No React, Next.js, or application-internal import is required.

The portable `.vibepack.json` format has four independent version boundaries:

```json
{
  "format": "vibedesktop-bundle",
  "bundleVersion": 1,
  "manifest": {
    "format": "vibedesktop-package",
    "manifestVersion": 1,
    "id": "org.example.my-desktop",
    "name": "My desktop",
    "version": "1.0.0",
    "protocol": { "major": 1, "minMinor": 0 },
    "requiredCapabilities": ["desktop"],
    "optionalCapabilities": [],
    "preferencesSchemaVersion": 1
  },
  "shell": { "major": 1, "minMinor": 0 },
  "entry": { "html": "desktop.html", "css": "desktop.css", "module": "desktop.js" },
  "files": {
    "desktop.html": { "mediaType": "text/html", "text": "<main><h1>My desktop</h1></main>" },
    "desktop.css": { "mediaType": "text/css", "text": "main{position:absolute;inset:0;background:#122238;color:white}" },
    "desktop.js": { "mediaType": "text/javascript", "text": "export function mount(host) { /* build your desktop */ }" }
  }
}
```

The metadata manifest describes service compatibility and configuration schema; `shell` describes the browser host API; `bundleVersion` describes packaging; the package author's `version` describes its release. None is the Vibe Desktop application release version. Read the actual capability IDs from `/api/v1` or `host.data.describe()`. Missing required capabilities or incompatible versions prevent activation.

Each asset contains a MIME type and **exactly one** of UTF-8 `text` or `base64`. The three entries must be text with their declared MIME types. Arbitrary asset MIME types are accepted. Limits are 16 MiB of encoded bundle JSON, 256 files, and 16 imported packages per browser. Base64 encoding contributes to the size limit. The packer infers common image, font, video, audio, shader, and WASM types; set an uncommon MIME type in the resulting bundle when needed.

The first-run guide starts with built-in system selection or importing a shared package. Afterwards the same collection is available inside Settings → Appearance → Desktop system. Shared packages are explicitly imported into the browser library; no hosted community catalogue is implied. The six-step guide can be replayed from Settings.

## Host API 1.1 (compatible with 1.0 packages)

Types are in `src/protocol/shell/package.ts`. Export one `mount(host)` function. It may return a cleanup function directly or through a promise. The host mounts the HTML fragment and stylesheet first, then loads the ES module. Package startup has a 15-second timeout with retry, package selection, and recovery actions. Synchronous code that blocks the browser event loop cannot be interrupted by that timeout.

```js
export function mount(host) {
  const windows = new Map();
  const stop = host.subscribe(state => {
    for (const [id, element] of windows) {
      if (!state.windows.some(window => window.id === id)) {
        element.remove(); windows.delete(id);
      }
    }
    for (const window of state.windows) {
      let element = windows.get(window.id);
      if (!element) {
        element = document.createElement('section');
        const close = document.createElement('button');
        close.textContent = 'Close';
        close.addEventListener('click', () => host.close(window.id), { signal: host.signal });
        element.append(close, host.content(window.id));
        host.root.append(element); windows.set(window.id, element);
      }
      Object.assign(element.style, {
        position: 'absolute', left: `${window.x}px`, top: `${window.y}px`,
        width: `${window.width}px`, height: `${window.height}px`,
        zIndex: String(window.z), display: window.mode === 'minimized' ? 'none' : 'block'
      });
    }
  });
  return () => stop();
}
```

| API | Behavior |
| --- | --- |
| `root`, `signal`, `packageId`, `version` | Open ShadowRoot, package lifetime signal, selected namespace, host version |
| `snapshot()` | A cloned current state, safe for the author to read and transform |
| `subscribe(listener)` | Immediate state delivery, then updates; returns an unsubscribe function |
| `content(windowId)` | Stable named slot for an existing live app body; append it to your frame |
| `asset(path)` | Blob URL for a file in this bundle; valid for the active package lifetime |
| `styleContent(css)` | Managed stylesheet for host app bodies and desktop dialogs; returns a remover |
| `presentSystemTools({ appearance, colorScheme, accent })` | Since 1.1: select the hosted tool layout and theme; appearance is `windows`, `macos`, or an author-defined identifier, color scheme is `light` or `dark`, accent is a six-digit hex color |
| `open(appId)`, `external(appId)` | Open an app in its configured mode, or request a browser tab |
| `focus(id)`, `close(id)`, `patch(id, patch)` | Manage host window state |
| `addApp()`, `editApp(id)`, `removeApp(id)` | Open host application management flows |
| `arrangeApps()`, `moveApp(id, x, y)` | Update shared desktop application placement |
| `wallpaper()`, `managePackages()` | Open host personalization or package manager |
| `workspace(tool)` | Open `windows`, `scenes`, `organize`, or `activity` tools |
| `notify(message)` | Show a host notification |
| `data` | Framework-independent v1 service SDK; see [protocol v1](v1.md) |
| `savePreferences(values, schemaVersion?)` | Replace this package's JSON preferences using the last known revision |

Snapshots include apps (wire fields plus display `label`, `imageUrl`, `running`), an optional desktop-only `desktopAppIds` group filter, windows, locale, clock, user name, local-service state, wallpaper URL, reduced-motion preference, and versioned package preferences. Window patches accept only position, dimensions, minimized/open mode, maximized, and tiled state. The host controls identity, app ownership, and focus order; geometry is finite and bounded.

Keep each frame keyed by window ID. `content()` returns a slot, **not the actual application DOM**. The host keeps app bodies connected in light DOM across package switches so their iframe browsing contexts survive. Place each returned slot once; rebuilding only the surrounding author frame is safe. Do not find and move `.package-app-content` nodes yourself. Package removal unmounts its shell, aborts its signal, invokes returned cleanup, removes managed content styles, and revokes asset URLs. An imported bundle remains in browser storage until explicitly removed or replaced by a backup restore.

## Style and effect freedom

There is no layout schema or animation preset whitelist. Use native HTML elements, SVG, CSS Grid/Flexbox, typography, fonts, gradients, transforms, filters, masks, blend modes, `backdrop-filter`, keyframes, Web Animations, pointer interactions, Canvas, and other browser APIs directly. Browser support, hardware capability, browser permissions, CORS, autoplay restrictions, and deployment CSP still apply. Packaging does not make an unsupported API available. The supplied regression tests exercise DOM/CSS, SVG assets, Canvas pixels, Web Animations activation, reduced motion, and app integration in Chromium; they do not certify every API on every browser.

Shadow DOM keeps the shell's selectors separate from the host UI. Use `:host` or your own shell root and define your design tokens there. Slotted application bodies inherit CSS variables, but shell selectors do not traverse their internals. For hosted app content use a managed stylesheet:

```js
host.styleContent(`
  :host > .package-app-content { height:100%; overflow:auto; background:#f5f8fc; }
  :host .settings-card { border-radius:18px; }
`);
```

Here `:host` is replaced with the active package's `.package-surface` selector. In host 1.1, `:desktop` selects the enclosing desktop while this package is mounted, including its dialogs and select popups. Use it for shared tokens and dialog styling. `presentSystemTools()` exposes the current presentation through `data-system-appearance` and `data-system-color-scheme` on both surfaces. The shipped layouts use a Windows sidebar with home cards and a macOS sidebar with grouped settings rows. Their appearance settings update the active package's preferences; unknown author-defined layouts expose package selection and wallpaper without assuming support for the shipped preference keys. Set `shell.minMinor` to `1` when depending on these additions. This is a scoping convention, not a CSS sanitizer; prefix your rules. The host retains application behavior and baseline styles. Cross-origin iframe contents follow browser isolation and cannot be restyled by shell CSS. Window chrome around an iframe remains fully customizable. This follows the browser's [Shadow DOM and slot model](https://developer.mozilla.org/en-US/docs/Web/API/Web_components/Using_shadow_DOM).

For bundled assets, shell CSS and `styleContent` accept `asset("path")` in place of `url(...)`:

```css
@font-face { font-family:Custom; src:asset("assets/custom.woff2") format("woff2"); }
.wallpaper { background-image:asset("assets/background.svg"); }
```

HTML URLs are not rewritten. Set them in `mount`, for example `host.root.querySelector('video').src = host.asset('assets/wallpaper.webm')`. Regular external URLs can be used according to browser rules. Blob module entries have no filesystem-relative import base: bundle dependencies, or explicitly use `await import(host.asset('helper.js'))` for a self-contained auxiliary module. Its own relative imports also need bundling or explicit URLs. Workers and WASM can consume `host.asset(...)` under normal browser policy. See the browser's [dynamic import behavior](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/import).

Attach DOM listeners with `{ signal: host.signal }`. Return cleanup that cancels RAF and timers, disconnects observers, terminates Workers, cancels animations, and disposes graphics/audio resources you create. Check `host.signal.aborted` after asynchronous work. Subscribe to `reducedMotion` and page visibility; continuous decorative effects should stop while inactive. The host cannot automatically discover or clean up arbitrary resources created by custom JavaScript.

## Configuration, trust, and backups

Package preferences are server-side namespaced JSON. A save returns the new revision and broadcasts it in the snapshot. Serialize rapid saves within your package. On `revision_conflict`, read current state and reconcile; writes are never retried automatically. Each namespace supports up to 64 KiB; a desktop supports 32 namespaces. Uninstalling code leaves its preferences available for later reinstallation. The author migrates `preferencesSchemaVersion`; the server does not execute migration code.

Imported packages execute trusted **same-origin JavaScript with the current desktop's authority**. The manager shows a trust confirmation before installation. Shadow DOM and namespaces do not sandbox code. A malicious package could access the page, storage, and available APIs. Do not describe the bundle as an untrusted plugin sandbox.

Full desktop backups include imported package code, browser selection, assets, and server package preferences. Restore previews warn when code is included. A restore replaces the imported collection; a legacy backup without `packages` restores an empty imported collection. Built-ins ship with the application and are not embedded in backups. The previous desktop is saved before restore; if the service rejects restoration, browser assets, preferences, and packages are rolled back. Successful restoration reloads the page. The full backup limit is 48 MiB, so a large installed collection may need individual package exports instead of a single full backup. No app source repositories, daemon registrations, external app databases, or website login sessions are included.

## Verification

- `src/lib/desktop-packages/bundle.test.ts` checks format, traversal, encodings, version gates, build freshness, and window-patch boundaries.
- `src/lib/desktop-backup-contract.test.ts` checks package collections before restore.
- `e2e/packages.spec.ts` covers both shells, windows and snap controls, iframe draft continuity, effects and reduced motion, trusted import/export/remove, failed startup recovery, mobile bounds, icon persistence, and package backup rollback/restore.
- The classic desktop and live protocol suites remain part of `npm run test:e2e`.
