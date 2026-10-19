# Independent desktop consumer

`client.ts` uses only the public SDK and the package's own manifest. Bundle it with the frontend framework of your choice, serve it on the desktop service's origin (or use a same-origin reverse proxy), and call `connectDesktopPackage()` during initialization.

This is a connection example and compatibility manifest, not an executable package loader or a replacement layout. The package can render its own dock, windows, settings, and interactions from the returned app state. Server mutations stay behind the SDK; ephemeral window geometry stays in the frontend. A separately copied SDK should preserve its relative imports.

See [protocol v1](../../docs/protocol/v1.md) for operations, compatibility policy, preferences, errors, and trust boundaries.

For an executable HTML/CSS/JS shell, use the [Aurora Lab example](../effects-desktop) and [desktop package host guide](../../docs/protocol/desktop-packages.md). This directory demonstrates the independent service SDK connection rather than a complete visual shell.
