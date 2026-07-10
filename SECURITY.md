# Security Policy

## Supported Versions

| Version | Supported             |
| ------- | --------------------- |
| 0.x     | ✅ Active development |

## Reporting a Vulnerability

ReviewLume takes security and privacy seriously. If you discover a security
vulnerability within this project, **please do not** open a public GitHub issue
or discussion.

Use GitHub's private vulnerability reporting flow from the repository
**Security** tab and choose **Report a vulnerability**. If that option is not
available, contact the repository maintainer through their GitHub profile and
request a private reporting channel before sharing technical details.

Please include:

- The affected version or commit.
- Reproduction steps or a minimal proof of concept.
- The expected impact.
- Any suggested mitigation, if available.

## What to Expect

- We will acknowledge receipt within 48 hours when possible.
- We will provide an estimated timeline for a fix and coordinated disclosure.
- We will notify the reporter when the issue is resolved and published.

## Scope

The following are considered in scope:

- VS Code extension vulnerabilities.
- Git command injection via malicious repository names or paths.
- Unauthorized file system access outside the selected repository.
- Secret scanner bypasses or high-confidence false negatives.
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
