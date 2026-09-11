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
- **Folder Project** — Git discovery is unavailable or fails at the selected root, so the canonical selected Workspace Folder becomes the outer authorized root.

A missing Git repository is not a security error and does not cause Git metadata to be fabricated.

A Folder Project may contain multiple real nested Git repositories. ReviewLume may inspect one such child repository read-only only after it is discovered inside the authorized Folder root and explicitly selected by project-relative path. Separate child repositories are never merged into synthetic Git state.

Folder Project support does not enable cross-root reads and does not start the optional browser bridge.

## In-Scope Security Issues

The following are in scope:

- VS Code extension vulnerabilities;
- Git command injection through malicious repository names, paths, refs, or content;
- unauthorized filesystem access outside the selected Project Root;
- bypasses of absolute-path, parent-traversal, `.git`, canonical-root, symlink/junction/reparse-point, binary, file-size, result-size, request-size, or rate-limit boundaries;
- Folder Project enumeration escaping the root, following a link outside the root, or exposing a documented blocked credential-like path;
- nested Git discovery accepting a repository top-level or Git metadata directory outside the authorized Folder root;
- nested Git selectors escaping the Folder root, selecting an ordinary directory, or selecting a repository that was not allowed by discovery;
- capability confusion where a Folder Project exposes Local Verification or Git mutation tools;
- project-identity confusion that permits one MCP connection to read another Workspace Folder/root;
- SecretScanner or export-gate bypasses in the separate P8 Advanced Review Pack workflow;
- local MCP authentication, Origin, content-type, lifecycle, cancellation, and residual-access failures;
- Secure MCP Tunnel configuration, proxy isolation, credential leakage, or unsafe subprocess invocation;
- unexpected MCP write, shell, terminal, patch, delete, Git mutation, arbitrary command, or general process-start capabilities;
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
- absolute-path, Windows drive-path, UNC-path, parent-traversal, NUL, and direct `.git` file-read rejection;
- `realpath` containment checks before project file reads;
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

Folder Project exposes project-wide file tools:

- `project_summary`
- `list_files`
- `read_file`
- `search_code`

It also exposes explicitly scoped nested Git read tools:

- `list_git_repositories`
- `repository_summary`
- `git_status`
- `recent_commits`
- `get_diff`

`repository_summary`, `git_status`, `recent_commits`, and `get_diff` require one explicit `repository` path returned by `list_git_repositories`. The Folder root is not a synthetic repository and multiple child repositories are not combined.

Folder Project does **not** register `verification_status` or `read_verification_output` and never starts Local Verification for discovered child repositories.

### Folder file enumeration

Folder file enumeration is process-free and bounded. It uses filesystem APIs only, does not follow symbolic-link/junction-like entries, canonicalizes candidate directories/files, and requires every resolved path to remain under the canonical Folder Project root.

The enumerator skips VCS metadata, common dependency/build/cache trees, and common credential-store directories. Folder file tools also block obvious credential-like names such as `.env` secrets, common credentials/secrets files, private-key names, and common key/certificate container extensions. Template files such as `.env.example` remain eligible.

This policy reduces accidental exposure but is not content DLP and cannot detect every secret embedded in ordinary source/configuration files.

### Nested Git discovery and execution

Nested Git discovery is separately bounded:

- maximum 64 discovered child repositories;
- maximum 20,000 visited entries;
- maximum traversal depth 32;
- dependency/build/cache/credential-store directories are skipped;
- directory symlinks/junction-like entries are not followed;
- candidates require a local `.git` file or directory marker;
- `git rev-parse --show-toplevel` must resolve to the candidate directory itself;
- `git rev-parse --absolute-git-dir` must resolve inside the authorized Folder root;
- external Git metadata, external links, root escapes, and ordinary non-repository directories are rejected.

After selection, nested Git queries reuse the existing Git Project read-only command allowlist and diff/ref safeguards. This is an intentionally narrow process capability, not a general process runner. It adds no checkout, add, commit, reset, clean, merge, rebase, fetch, push, shell, package script, or arbitrary executable capability.

The Folder direct-file filename block does not sanitize nested Git status/history/diff output. Explicitly selected nested Git metadata or diffs can include sensitive-looking tracked paths/content under the existing Git read semantics. That is documented privacy behavior, not an authorization bypass.

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

For Folder Projects, connection startup does not perform verification discovery, does not run an approved verification rule, and does not register verification evidence tools. Nested Git discovery also never triggers Local Verification. If verification is needed, the child repository must be connected directly as a Git Project under the existing approval model.

## Privacy and Data Flow

ReviewLume does not collect telemetry and does not operate a repository/project data relay server.

When the user enables ReviewLume in ChatGPT and asks a project question, ChatGPT may request only the tools exposed for the current Project Kind. Returned results leave the machine through the official OpenAI Secure MCP Tunnel and are processed by OpenAI under the user's account, workspace controls, terms, and privacy settings.

ReviewLume does not read browser cookies, sessions, passwords, browsing history, or ChatGPT responses.

P8 Advanced review history and Review Packs remain local unless deliberately copied/sent elsewhere. P8 has its own SecretScanner/export gates; those controls do not automatically apply to MCP or Local Verification evidence.

See [PRIVACY.md](PRIVACY.md), [docs/security-and-compliance.md](docs/security-and-compliance.md), [docs/folder-project-support.md](docs/folder-project-support.md), [docs/chatgpt-secure-mcp-setup.md](docs/chatgpt-secure-mcp-setup.md), and [docs/local-verification-assistant.md](docs/local-verification-assistant.md) for detailed boundaries.
