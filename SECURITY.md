# Security policy

## Reporting a vulnerability

Please use GitHub's private vulnerability reporting for this repository. If that feature is unavailable, contact the maintainer through the address in the repository profile and avoid including exploit details in a public issue.

Include the affected version, a minimal reproduction, expected impact, and whether the issue requires a malicious local process, a browser page, or remote network access. Do not include real credentials or private user data.

## Supported versions

Security fixes are provided for the latest published release. Users should update with:

```bash
vibedesktop update
vibed update
```

Published daemon updates are checksum-verified and, once the production release key is configured, signature-verified with the Ed25519 public key embedded by the installer.

## Security model

Vibe Desktop is a single-user tool for the machine it runs on.

- **Local only.** The desktop and `vibed` listen on `127.0.0.1`. Requests for any other host
  name are refused (DNS-rebinding protection) and cross-site writes are rejected. `vibed`
  accepts only requests carrying its private token, which never leaves the user's runtime
  directory.
- **Imported projects** run exactly the commands shown in their generated, readable `run.sh`.
  Source trees are never modified.
- **The link catalog** (`catalog/`) can only describe links; its parser cannot represent a
  command.
- **App market installs run third-party code**, so they are gated:
  - A web page, a `vibedesktop://install` link, or `vibedesktop install` can only *open* the
    confirmation dialog. Nothing runs before the user confirms in the local desktop.
  - The dialog shows the repository, the exact commit, the trust tier (Reviewed / Community /
    not in the market), every `setup` command, every service command and port, and the data
    folder. The install must present the digest of that previewed manifest; a different
    manifest is refused.
  - The preview fetches the commit without file contents and reads only `app.json` and the
    icon. Installs are pinned to one commit and run as the user, without `sudo`, with services
    bound to loopback.
  - A failed install or update is rolled back; a failed update restarts the previous commit.
  - **Community** apps are listed automatically and are not reviewed. **Reviewed** covers one
    exact commit. Neither is a sandbox: only install apps from authors you trust.
- Report a malicious market app through GitHub issues (or privately, as above); listings are
  removed through `market/blocked.json`.
