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
