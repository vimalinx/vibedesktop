# App catalog

This directory holds the **source list** for the public app catalog. The catalog
is an optional, read-only list of links a Vibe Desktop can offer in its app
store. It is data, not infrastructure: there is no account, no sync, no
telemetry, and no server involved in consuming it.

## What a catalog entry is

A link. That is the whole type:

```json
{ "id": "excalidraw", "url": "https://excalidraw.com", "category": "tools" }
```

An entry **cannot** describe anything the machine could run. There is no
`command`, no `args`, no `cwd`, no `port`. That is not a policy the reviewer has
to remember — `parseCatalogArtifact` in `src/lib/catalog-contract.ts` constructs
each entry from a fixed set of keys, so an unexpected field is structurally
absent from the result rather than filtered out of it.

For the same reason every catalog entry opens in a **new browser tab**.
`openingMode` is not read from the artifact: an entry that could ask to be
framed into the desktop would turn every review into a framing-policy judgement.

## Submitting an entry

Send one URL. Optionally a sentence about it.

Title, description, and icon are resolved from the page itself at build time, so
there is nothing else to fill in. No account or contact address is collected,
which is deliberate: no personal data is stored, so there is nothing to delete
later.

Submitting an entry says nothing about the linked site's own licence or terms —
a catalog entry is a link, not a redistribution of what it points at. It does
mean the entry itself (the id, title, description, category, and the icon fetched
from the page) may be published in the catalog artifact and, like the rest of
this repository, is covered by the project's [licence](../LICENSE).

## Reviewing and publishing (maintainer)

1. Append the entry to `catalog/source.json`.
2. `npm run catalog:build` — writes `dist/catalog.json`.
3. Publish `dist/catalog.json` as a static file (a release asset, Pages, any
   static host). No server code is involved.

Fields written explicitly in `source.json` override whatever the page
advertises, so a review decision always wins over a site's own metadata. Set
`"noResolve": true` on an entry to skip network resolution entirely and publish
exactly what is written — useful for a site that is down or that advertises
metadata you do not want to repeat.

The generator prints one line per entry (`ok` / `literal` / `warn` / `skip`) and
exits non-zero if it produced an entry the runtime parser would reject.

## Why icons are inlined

Each icon is fetched at build time and stored in the artifact as a `data:` URL.

A remote icon URL would mean every desktop that opens its app store issues a
request to a host chosen by whoever submitted the entry — handing that submitter
the IP address and User-Agent of every user who browses the catalog. Inlining
removes that channel entirely, and also makes entries immune to an icon
disappearing or being swapped for something else after review.

An entry whose icon cannot be fetched (too large, wrong content type,
unreachable) is published without one and renders as initials.

## Why the artifact is not signed

The release manifest that `vibed update` consumes **is** signed, because it
ships executable runtime code. A link-only catalog's worst case is a bad link,
and what prevents a bad link is review, not a signature: the maintainer is the
only publisher, and HTTPS already authenticates them.

If catalog content ever grows the ability to affect execution, that is the point
at which signing becomes a precondition rather than an option —
`verifyManifestSignature` is already available for it.

## Consuming a catalog

Set `VIBE_CATALOG_URL` to the artifact's URL. It is **empty by default**: a
local-first desktop should not call out to a third party on first run without
being asked.

Entries merge with the built-in seed and with your own local collection, and
**local always wins**:

```
local collection  >  public catalog  >  built-in seed
```

Your own collection is `.data/local-catalog.json` (override with
`VIBE_LOCAL_CATALOG_FILE`) — the same entry format, in a file you own and can
edit by hand. A bare JSON array is accepted, so it needs no envelope:

```json
[{ "id": "my-tool", "title": "My Tool", "url": "https://tool.internal.example" }]
```

That is what makes a personal collection unprivileged: the maintainer's own
curated list is the same mechanism, in the same place, as anyone else's.

Fetch failure is a non-event. The ladder is: fetch → last-good cache → built-in
seed. A catalog host that is unreachable, slow, or serving garbage never
degrades into a broken desktop.
