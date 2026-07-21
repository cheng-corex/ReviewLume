# Security Policy

## Supported Versions

| Version | Supported             |
| ------- | --------------------- |
| 0.x     | ✅ Active development |

## Reporting a Vulnerability

ReviewLume takes security and privacy seriously. If you discover a security
vulnerability within this project, **do not** open a public GitHub issue or
discussion.

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
- Git command injection through malicious repository names, paths, refs, or content.
- Unauthorized file-system access outside the selected repository.
- Bypasses of sensitive-path or SecretScanner controls.
- Local MCP authentication, Origin, request-size, rate-limit, and lifecycle failures.
- Secure MCP Tunnel configuration or credential leakage.
- Unexpected write, shell, patch, or Git mutation capabilities.
- Residual access after a connection is stopped or VS Code exits.

The following are **out of scope**:

- Social engineering of project contributors.
- Attacks requiring physical access to the developer's machine.
- Vulnerabilities in OpenAI, ChatGPT, VS Code, Git, or other third-party services unless ReviewLume exposes or amplifies them through its own implementation.

## Privacy and Data Flow

ReviewLume is designed to be privacy-first and read-only-first:

- ReviewLume does not provide shell, terminal, file-write, patch-application, or Git mutation tools.
- One active MCP connection is bound to one explicitly selected Git repository.
- The local MCP listens only on a random `127.0.0.1` port and uses a fresh high-entropy token for each run.
- The OpenAI Runtime API key is stored only in VS Code SecretStorage and is not written to the repository, settings JSON, command arguments, clipboard, or logs.
- Repository paths, files, diffs, search results, and commit titles are filtered through path, size, binary, symlink, and sensitive-content controls before they can be returned.
- ReviewLume does not collect telemetry.
- When the user enables the ReviewLume connector in ChatGPT and asks a project question, ChatGPT may request permitted repository metadata or content through the OpenAI Secure MCP Tunnel. Those returned results leave the local machine and are processed by OpenAI under the user's OpenAI account and applicable OpenAI terms and privacy settings.
- ReviewLume does not read browser cookies, sessions, passwords, browsing history, or ChatGPT responses.
- P8 Advanced review history and exported Review Packs remain local unless the user deliberately sends or copies them elsewhere.

See [PRIVACY.md](PRIVACY.md) and
[docs/security-and-compliance.md](docs/security-and-compliance.md) for the full
boundaries and data-flow description.
