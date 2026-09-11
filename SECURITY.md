# Security Policy

## Supported Versions

| Version | Supported             |
| ------- | --------------------- |
| 0.x     | ✅ Active development |

## Reporting a Vulnerability

ReviewLume takes security and privacy seriously. If you discover a security vulnerability, **do not** open a public GitHub issue or discussion.

Use GitHub's private vulnerability reporting flow from the repository **Security** tab and choose **Report a vulnerability**. If that option is unavailable, contact the maintainer through their GitHub profile and request a private reporting channel before sharing technical details.

Please include the affected version/commit, minimal reproduction, expected impact, and suggested mitigation when available. Never include a real Runtime API Key, local MCP token, Authorization header, customer source code, private project content, production secret, raw verification output, or raw payload in the initial report.

## Project Security Model

One ReviewLume MCP connection binds exactly one canonical project root selected from a Trusted VS Code Workspace Folder.

The project kind is detected automatically:

- **Git Project** — read-only Git discovery succeeds and the canonical Git top-level becomes the root.
- **Folder Project** — Git discovery is unavailable or fails, so the canonical selected Workspace Folder becomes the root with a smaller capability set.

A missing Git repository is not a security error and does not cause Git metadata to be fabricated.

Folder Project support does not enable multi-project cross-root reads and does not start the optional browser bridge.

## In-Scope Security Issues

The following are in scope:

- VS Code extension vulnerabilities;
- Git command injection through malicious repository names, paths, refs, or content;
- unauthorized filesystem access outside the selected Project Root;
- bypasses of absolute-path, parent-traversal, `.git`, canonical-root, symlink/junction/reparse-point, binary, file-size, result-size, request-size, or rate-limit boundaries;
- Folder Project enumeration escaping the root, following a link outside the root, or exposing a documented blocked credential-like path;
- capability confusion where a Folder Project exposes Git-only or Local Verification tools;
- project-identity confusion that permits one MCP connection to read another Workspace Folder/root;
- SecretScanner or export-gate bypasses in the separate P8 Advanced Review Pack workflow;
- local MCP authentication, Origin, content-type, lifecycle, cancellation, and residual-access failures;
- Secure MCP Tunnel configuration, proxy isolation, credential leakage, or unsafe subprocess invocation;
- unexpected MCP write, shell, terminal, patch, delete, Git mutation, arbitrary command, or process-start capabilities;
- Git Project Local Verification approval bypasses, repository-binding bypasses, argument substitution, shell invocation, runner symlink escapes, approval-fingerprint bypasses, or execution in an untrusted workspace;
- Folder Project connection unexpectedly discovering/running Local Verification or exposing verification evidence tools;
- Local Verification timeout, cancellation, process-tree termination, stale-result, workspace-fingerprint, output-bound, ANSI-control, or secret-redaction failures;
- project content, diffs, search terms/results, verification output, Runtime API Keys, local MCP tokens, or Authorization headers entering ReviewLume diagnostic logs;
- residual access after a connection is stopped or VS Code exits.

The following are out of scope unless ReviewLume introduces or amplifies the issue:

- social engineering of contributors;
- attacks requiring physical access to the developer machine;
- vulnerabilities in OpenAI, ChatGPT, VS Code, Git, browsers, test runners, or other third-party services;
- exposure caused solely by a user intentionally connecting content that ReviewLume is documented to allow;
- side effects intentionally performed by Git Project test code/dependencies after the user approved the disclosed Local Verification rule, unless ReviewLume exceeded the approved executable, arguments, repository, timeout, or environment boundary;
- incorrect or unsafe ChatGPT recommendations when ReviewLume has not executed or applied them.

## Shared MCP Security Boundary

All project types enforce:

- Trusted Workspace before connection;
- one active MCP connection bound to one Project Root;
- canonical root resolution with `realpath`;
- local MCP listening only on a random `127.0.0.1` port;
- a fresh high-entropy local token per run;
- absolute-path, Windows drive-path, UNC-path, parent-traversal, NUL, and `.git` rejection;
- `realpath` containment checks before file reads;
- rejection of external symlink targets, directories, binary files, and oversized files;
- bounded result sizes, file counts, line counts, request sizes, concurrency, and call rates;
- no MCP shell, terminal, file write/delete/rename, patch apply, Git mutation, arbitrary command, package-script, or general process-start capability;
- project files and AI responses treated as untrusted input and unable to authorize extra capabilities.

The OpenAI Runtime API Key is stored only in VS Code SecretStorage and is not intentionally written to project files, settings JSON, argv, clipboard, or logs.

## Git Project Boundary

Git Project preserves the established repository tool contract:

- `repository_summary`
- `git_status`
- `recent_commits`
- `get_diff`
- `list_files`
- `read_file`
- `search_code`

Git subprocesses use the existing read-only allowlist, argument arrays, `shell: false`, disabled external diff, and disabled textconv. Commit references are verified before diff use, and credential-bearing remote URLs are sanitized before return.

For backward compatibility, Git Project MCP is not a filename-based secret filter: tracked `.env`, credential, secret, key, database, or production configuration files can still be eligible under the documented Git read boundary. P8 SecretScanner does not automatically filter MCP calls.

When Local Verification is available, Git Projects may additionally expose read-only `verification_status` and `read_verification_output` evidence tools. Those tools cannot start processes.

## Folder Project Boundary

Folder Project registers exactly:

- `project_summary`
- `list_files`
- `read_file`
- `search_code`

It does **not** register or simulate `repository_summary`, `git_status`, `recent_commits`, `get_diff`, `verification_status`, or `read_verification_output`. Hidden calls to those capabilities are rejected.

Folder enumeration is process-free and bounded. It uses filesystem APIs only, does not follow symbolic-link/junction-like entries, canonicalizes candidate directories/files, and requires every resolved path to remain under the canonical Folder Project root.

The enumerator skips VCS metadata, common dependency/build/cache trees, and common credential-store directories. Folder Projects also block obvious credential-like names such as `.env` secrets, common credentials/secrets files, private-key names, and common key/certificate container extensions. Template files such as `.env.example` remain eligible.

This policy reduces accidental exposure but is not content DLP and cannot detect every secret embedded in ordinary source/configuration files.

A Folder Project has no reliable Git history. ReviewLume must not infer recent changes, commit/branch history, staged/unstaged state, or diffs from file timestamps or content.

## Local Verification Execution Boundary

Local Verification remains **Git Project only** and is not an MCP action tool or general terminal.

For Git Projects, the approved boundary remains:

- Trusted Workspace only;
- one canonical Git repository per approval;
- fixed executable, fixed argument prefix, fixed target mode, and fixed timeout shown before approval;
- repository-local runner entry points from supported fixed locations;
- `spawn(executable, argv)` with `shell: false`;
- no arbitrary package scripts, `npx` downloads, free-form commands, or instructions from AI responses/project files/process output;
- relevant runner/config changes invalidate approval;
- bounded output, reduced environment, timeout, cancellation, process-tree termination, and stale-result fingerprinting;
- approvals/results stored in extension storage rather than repository files.

Tests remain executable untrusted repository code and can have side effects; ReviewLume is not a sandbox.

For Folder Projects, connection startup does not perform verification discovery, does not run an approved verification rule, and does not register verification evidence tools. Folder Verification requires a separate design and approval before implementation.

## Privacy and Data Flow

ReviewLume does not collect telemetry and does not operate a repository/project data relay server.

When the user enables ReviewLume in ChatGPT and asks a project question, ChatGPT may request only the tools exposed for the current Project Kind. Returned results leave the machine through the official OpenAI Secure MCP Tunnel and are processed by OpenAI under the user's account, workspace controls, terms, and privacy settings.

ReviewLume does not read browser cookies, sessions, passwords, browsing history, or ChatGPT responses.

P8 Advanced review history and Review Packs remain local unless deliberately copied/sent elsewhere. P8 has its own SecretScanner/export gates; those controls do not automatically apply to MCP or Local Verification evidence.

See [PRIVACY.md](PRIVACY.md), [docs/security-and-compliance.md](docs/security-and-compliance.md), [docs/folder-project-support.md](docs/folder-project-support.md), [docs/chatgpt-secure-mcp-setup.md](docs/chatgpt-secure-mcp-setup.md), and [docs/local-verification-assistant.md](docs/local-verification-assistant.md) for detailed boundaries.
