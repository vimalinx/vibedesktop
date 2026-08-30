# Open-source and product boundary

Vibe Desktop is one complete, local-only, single-user product. The web desktop,
local Next.js service, `vibed` process manager, dedicated-browser companion,
installers, update and rollback implementation, tests, release automation, and
documentation required to build and verify the program are public product
source.

The product has no hosted edition, account service, multi-tenant control plane,
telemetry service, or remote command channel. It does not depend on a private
backend. Optional catalog entries are static links and cannot express executable
commands.

The entire published product source is licensed under Apache License 2.0. That
license permits personal and commercial use, modification, distribution, and
private use, and includes an express patent grant, subject to its conditions.
See [LICENSE](LICENSE) for the controlling terms.

`package.json` contains `"private": true` only to prevent accidental publication
to the npm package registry. It does not make any Vibe Desktop source
proprietary and does not limit the Apache-2.0 grant.

The maintainer checkout can also contain material that is not product source and
is not published:

- `.ai/` experiment ledgers and raw local evidence;
- `.data/`, `.next/`, `dist/`, logs, caches, and other generated or user state;
- private release-signing keys and machine-specific paths;
- rejected design explorations and maintainer-only review artifacts.

These exclusions contain no runtime, build, installation, update, test, or
release implementation needed to use, modify, verify, or redistribute Vibe
Desktop.
