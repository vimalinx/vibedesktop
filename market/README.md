# App market

The market on [vibedesktop.online/apps](https://vibedesktop.online/apps) is built from GitHub with no server
or database:

1. An author commits [`.vibedesktop/app.json`](../docs/app-format.md) and adds the GitHub topic
   `vibedesktop-app` to the repository. That is the whole submission.
2. `scripts/market-build.mjs` (run every 6 hours by `.github/workflows/market.yml`) searches the topic,
   pins each repository's default-branch commit, validates the manifest with the same
   `src/lib/app-manifest.mjs` the desktop uses, and writes `market.json` plus one icon per app.
3. The workflow publishes the result with the rest of the static site.

## Trust tiers

| Tier | Meaning | How |
| --- | --- | --- |
| Community | Listed automatically; nobody reviewed the code | Topic + valid manifest |
| Reviewed | The maintainer reviewed one exact commit; the market installs that commit | Entry in `reviewed.json`, added by pull request after a review request issue |

Whatever the tier, the desktop shows the repository, commit, every setup command, every service
command and port, and the data folder before anything runs, and the user must confirm.

## Maintainer tasks

- **Review:** read the commit, run it with `skills/vibedesktop-app/scripts/check.py --run`, then add
  `{ "repository": "owner/repo", "ref": "<40-char sha>", "reviewedAt": "YYYY-MM-DD" }` to `reviewed.json`.
- **Remove:** add `"owner/repo"` to `blocked.json`. The next build drops it.
- **Build locally:** `GITHUB_TOKEN=… node scripts/market-build.mjs --out dist/site` (a token raises the
  API rate limit; without one the build still works for a handful of repositories).
