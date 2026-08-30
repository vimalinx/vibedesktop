# Contributing

Thanks for the interest. Before you spend time on a change, please read the
license and project scope below.

## Open-source license

Vibe Desktop is licensed under the [Apache License 2.0](LICENSE). Unless you
explicitly state otherwise, any contribution intentionally submitted for
inclusion in the project is provided under Apache-2.0 without additional terms,
as described in section 5 of the license.

## What fits this project

Vibe Desktop is deliberately narrow:

- **Local-first and single-user.** No login, no accounts, no cloud control
  plane. A change that reintroduces remote control over a user's machine is out
  of scope, not merely unimplemented — that layer was removed on purpose.
- **State lives in a local JSON file.** No database.
- **Optional remote data is read-only and degrades.** The app catalog may be
  fetched, never written back, and its failure must never surface as breakage.
- **Nothing remote decides what runs locally.** Catalog entries are links and
  cannot express a command, working directory, or port. Anything that would let
  fetched data reach the daemon's execution boundary is a hard no.

## Before opening a pull request

Run the full gate set. All four must be clean:

```bash
npm run lint        # eslint + CSS-literal budgets + contrast checks
npm run typecheck
npm test
npm run build
```

Notes on the less obvious ones:

- `lint` enforces **CSS literal budgets** (`scripts/check-css-literals.mjs`).
  The budgets may go down, never up — use semantic tokens instead of raw values.
- `lint` also runs **contrast checks** (`scripts/check-contrast.mjs`). New
  colour pairings need to pass WCAG minimums.
- `lint` enforces the permanent **local-only, single-user, complete
  Apache-2.0 product boundary** (`scripts/check-product-boundary.mjs`).
- Add new visible copy to `src/lib/i18n.ts`. Do not hard-code English strings in
  components.
- Keep changes consistent with the existing component and data-layer patterns;
  explain any deliberate exception in the pull request.

## Testing expectations

- Logic gets unit tests. Route behaviour gets route tests.
- When you parse data from outside the app, test by **shape** (assert on
  `Object.keys`), not only by case — so the test fails when an unexpected field
  starts getting through.
- Failure paths matter as much as success paths. If a feature reads remote data,
  test what happens when that read fails, times out, returns HTML, or returns
  something oversized.

## Reporting a bug

Include: what you did, what you expected, what happened, and the output of
`npm run build` or the failing test if relevant. If it involves the `vibed`
daemon, `vibed status` and `vibed logs` are usually the fastest signal.

## Security

If you find something with security impact, please do not open a public issue
first — report it privately so it can be fixed before it is described publicly.
