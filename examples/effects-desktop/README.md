# Aurora Lab

A complete desktop package written in plain HTML, CSS, and JavaScript. It demonstrates CSS animated gradients, Canvas particles, Web Animations, persistent effect preferences, live app content slots, and package cleanup. No frontend framework or internal application import is used.

From the Vibe Desktop repository root:

```sh
npm run packages:pack -- examples/effects-desktop /tmp/aurora.vibepack.json
```

Open Desktop appearance (`Ctrl/Cmd + Alt + P`), import the generated file, review and accept the code trust prompt, then choose **Use** for Aurora Lab. **Desktop packages** returns to the manager. **Pause effects** saves this package's own preference. Application buttons open the host's live app bodies inside example frames.

Edit `desktop.html`, `desktop.css`, and `desktop.js` freely. Give a derivative package a unique reverse-domain `id` in `manifest.json`. Rebuild to a new output filename, import, and switch to it. This teaching shell intentionally keeps its window controls simple; the two built-in package sources demonstrate dragging, resizing, snapping, minimizing, menus, and keyboard control.

Read the [full author contract](../../docs/protocol/desktop-packages.md) for assets and fonts, code splitting, app-body styles, lifecycle, backups, limits, and the trusted JavaScript execution model.
