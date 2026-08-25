# Security Policy

## Supported versions

Until DragView reaches 1.0, security fixes are provided for the latest published version only.

| Version | Supported |
|---|---|
| 0.1.x | Yes |
| Older versions | No |

## Reporting a vulnerability

Please do not disclose a suspected vulnerability in a public issue. Use the repository's **Security → Report a vulnerability** flow to open a private GitHub security advisory:

<https://github.com/anzhaohao/DragView/security/advisories/new>

Include the affected version, operating system, DSH version, reproduction steps, impact, and any suggested mitigation. Do not include real local paths, private file contents, access tokens, or other secrets.

The maintainer will normally acknowledge a complete report within seven days. Validation and remediation timelines depend on severity and reproducibility. A coordinated disclosure date will be agreed before public details are released.

If private reporting is unavailable, open a minimal public issue asking for a private contact channel without including vulnerability details.

## Security boundaries

DragView intentionally keeps absolute paths on the host and exposes only short-lived opaque file capabilities to the browser. Reports about arbitrary-path preview/open, path traversal, symlink or junction escape, token/session isolation, active-content execution, unsafe shell invocation, or sensitive path disclosure are in scope.

The documented narrow same-user TOCTOU boundary around controlled writes and the final system-open handoff is a known platform limitation, not a claim of complete race elimination. Demonstrations that materially widen or exploit that boundary are still welcome.
