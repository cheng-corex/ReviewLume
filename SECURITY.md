# Security Policy

## Supported Versions

| Version | Supported             |
| ------- | --------------------- |
| 0.x     | ✅ Active development |

## Reporting a Vulnerability

ReviewLume takes security and privacy seriously. If you discover a security vulnerability within this project, **do not** open a public GitHub issue or discussion.

Use GitHub's private vulnerability reporting flow from the repository **Security** tab and choose **Report a vulnerability**. If that option is not available, contact the repository maintainer through their GitHub profile and request a private reporting channel before sharing technical details.

Please include:

- the affected version or commit;
- reproduction steps or a minimal proof of concept;
- the expected impact;
- any suggested mitigation, if available.

## What to Expect

- We will acknowledge receipt within 48 hours when possible.
- We will provide an estimated timeline for a fix and coordinated disclosure.
- We will notify the reporter when the issue is resolved and published.

## Scope

The following are considered in scope:

- VS Code extension vulnerabilities;
- Git command injection through malicious repository names, paths, refs, or content;
- unauthorized file-system access outside the selected repository;
- `.git`, parent-traversal, absolute-path, symlink, junction, binary, size, or request-limit bypasses;
- local MCP authentication, Origin, request-size, rate-limit, and lifecycle failures;
- Secure MCP Tunnel configuration or credential leakage;
- write tools appearing while write access is disabled;
- writes occurring without explicit VS Code confirmation;
- stale SHA-256 or unsaved-editor protection bypasses;
- deleting, renaming, shell, process, package-manager, or Git mutation capabilities exposed through MCP;
- partial writes incorrectly reported as complete success;
- residual read or write access after a connection is stopped or VS Code exits.

The following are **out of scope**:

- social engineering of project contributors;
- attacks requiring physical access to the developer's machine;
- vulnerabilities in OpenAI, ChatGPT, VS Code, Git, or other third-party services unless ReviewLume exposes or amplifies them through its own implementation.

## Privacy and Data Flow

ReviewLume is designed to be privacy-first and least-privilege-first:

- MCP is read-only by default.
- A user may explicitly enable `confirmEachRequest` for the current VS Code window.
- Confirmed-write mode can only create or completely replace bounded text files inside the single bound repository.
- Every effective write batch requires an explicit modal confirmation in VS Code.
- Existing files require an exact SHA-256 returned by `read_file_for_edit`; the hash is checked again after confirmation.
- Dirty VS Code target documents block the write before and after confirmation.
- ReviewLume does not provide shell, terminal, arbitrary process execution, deletion, rename, package installation, or Git mutation tools.
- One active MCP connection is bound to one explicitly selected Trusted Workspace Git repository.
- The local MCP listens only on a random `127.0.0.1` port and uses a fresh high-entropy token for each run.
- The OpenAI Runtime API key is stored only in VS Code SecretStorage and is not written to the repository, settings JSON, command arguments, clipboard, or logs.
- Repository paths and write targets are constrained by repository binding, path normalization, `.git`, binary, size, and symlink/junction controls.
- ReviewLume may return actual text from the bound repository, including configuration and security-related files. Users must not connect content they are not authorized to share with OpenAI.
- ReviewLume does not collect telemetry.
- When the user enables the ReviewLume connector in ChatGPT and asks a project question, ChatGPT may request permitted repository metadata or content through the OpenAI Secure MCP Tunnel. In confirmed-write mode, proposed file content also travels through the tunnel back to the local MCP. OpenAI processes these requests under the user's OpenAI account and applicable terms and privacy settings.
- ReviewLume does not read browser cookies, sessions, passwords, browsing history, or ChatGPT responses.
- P8 Advanced review history and exported Review Packs remain local unless the user deliberately sends or copies them elsewhere.

See [PRIVACY.md](PRIVACY.md) and [docs/security-and-compliance.md](docs/security-and-compliance.md) for the full boundaries and data-flow description.
