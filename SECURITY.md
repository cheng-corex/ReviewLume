# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 0.x     | ✅ Active development |

## Reporting a Vulnerability

ReviewLume takes security and privacy seriously. If you discover a security
vulnerability within this project, **please do not** open a public GitHub issue.

Instead, report it privately by emailing the maintainers. We will acknowledge
receipt within 48 hours and provide a timeline for a fix.

**Contact:** Please open a GitHub Discussion with the label `security` or
reach out to the repository maintainers directly.

## What to Expect

- We will acknowledge receipt of your report within 48 hours.
- We will provide an estimated timeline for a fix and disclosure.
- We will notify you when the issue is resolved and published.

## Scope

The following are considered in scope:

- VS Code extension vulnerabilities.
- Git command injection via malicious repository names or paths.
- Unauthorized file system access outside the workspace.
- Secret scanner bypass or false negatives.
- Local bridge protocol vulnerabilities (Phase 2+).

The following are **out of scope**:

- Social engineering of project contributors.
- Attacks requiring physical access to the developer's machine.
- Vulnerabilities in third-party AI services used with ReviewLume.

## Privacy

ReviewLume is designed to be privacy-first:

- No telemetry is collected without explicit consent.
- No data is sent to external servers except what the user deliberately
  copies or exports for AI review.
- Sensitive content scanning is performed entirely locally.
- See [docs/security-and-compliance.md](docs/security-and-compliance.md) for details.
