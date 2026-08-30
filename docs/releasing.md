# Releasing Vibe Desktop

Vibe Desktop releases are version tags containing a clean public-source snapshot and signed, one-command Linux installers. Do not create a public release until the licence shown in `LICENSE`, `package.json`, `README.md`, installer notices, and `CONTRIBUTING.md` all describe the same terms.

## Qualify a release

Run the complete release gate from the maintainer checkout:

```bash
npm run release:verify
```

This stages the complete public product source in a disposable Git repository
and then runs the local-only product-boundary check, lint, type checking, tests,
a production build, signed-asset generation, checksum validation, a three-Agent
`add-app` Skill install, a live `vibed` health check, a tagged whole-program
clone/build, and a live Next.js health check. It does not touch the real HOME or
user services.

For inspection after a failure:

```bash
VIBE_KEEP_RELEASE_VERIFY=1 npm run release:verify
```

The command prints the disposable directory it retained under `/tmp`.

## Configure signing

Generate the Ed25519 signing key once on a trusted machine outside the repository:

```bash
node scripts/generate-release-signing-key.mjs
```

Store the complete JSON file as the GitHub Actions secret `VIBE_RELEASE_SIGNING_KEY_JSON`. Never commit or upload the private key. The Release workflow publishes only `release-public-key.json`; `install.sh` embeds that same public key so `vibed update` rejects unsigned or incorrectly signed future manifests.

## Publish the source snapshot

The maintainer checkout contains non-product local evidence and private signing
material that must not be published. Stage and inspect the explicit, complete
product-source allowlist first:

```bash
node scripts/publish-public.mjs --output /tmp/vibedesktop-public-review
git -C /tmp/vibedesktop-public-review status --short
npm --prefix /tmp/vibedesktop-public-review run release:verify
```

After the staged commit has been reviewed, publishing the source snapshot is an explicit maintainer action:

```bash
node scripts/publish-public.mjs --push
```

`--push` force-replaces the public repository's intentionally single-commit history. It must never be run from automation or by an Agent without the maintainer explicitly authorising that external change.

## Cut the GitHub Release

The release tag must exactly equal `v` plus the version in `package.json`. For example, package version `0.1.3` uses tag `v0.1.3`:

```bash
git tag -s v0.1.3 -m "Vibe Desktop v0.1.3"
git push origin v0.1.3
```

Pushing the tag runs `.github/workflows/release.yml`. The workflow repeats the full qualification with a disposable signing key, regenerates the final assets with the protected production key, validates their checksums and signature metadata, and creates or updates the GitHub Release.

The Release contains:

| Asset | Purpose |
| --- | --- |
| `install-app.sh` | Whole-program installer: Vibe Desktop app plus `vibed` composition |
| `install.sh` | Standalone `vibed` and cross-Agent `add-app` Skill installer |
| `manifest.json` | Signed atomic-update payload |
| `release-public-key.json` | Public Ed25519 verification key and key id |
| `catalog.json` | Optional static public app catalog |
| `SHA256SUMS` | SHA-256 checksums for every release asset above |

## Verify the published release

Use a disposable Linux account or virtual machine with systemd user services:

```bash
curl -fsSL 'https://github.com/vimalinx/vibedesktop/releases/latest/download/install-app.sh' | sh
vibedesktop status
vibed health
vibedesktop open
```

If port 3000 is already occupied, the installer automatically selects the first
free loopback port through 3010 and persists it in the CLI and systemd unit.
Use `sh -s -- --port 3002` when the deployment requires a fixed port.

Confirm that a single click opens an app inside Vibe Desktop, a double click opens a browser tab, and an Agent can invoke `add-app` to plan, install, start, and health-check a local WebUI. Publication is not complete until this post-release smoke test passes against the actual GitHub asset URLs.
