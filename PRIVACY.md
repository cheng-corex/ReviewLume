# ReviewLume Privacy Policy

Last updated: 2026-09-11

## Overview

ReviewLume is a privacy-aware VS Code extension that can expose one selected local project to ChatGPT through a controlled, read-only local Model Context Protocol (MCP) server and the official OpenAI Secure MCP Tunnel.

A connected project is one of two kinds:

- **Git Project** — ReviewLume discovers a Git repository from the selected Trusted Workspace Folder.
- **Folder Project** — the selected Trusted Workspace Folder is used directly when no Git repository is available at that root. A Folder Project may contain multiple nested Git repositories that can be inspected read-only only when one child repository is explicitly selected.

One MCP connection is always bound to one canonical project root. ReviewLume does not combine unrelated Workspace Folders into one review context and does not combine nested repositories into synthetic Git history.

ReviewLume also has an optional Local Verification assistant for **Git Projects only**. It can execute fixed repository-local test and type-check rules only after user approval in a Trusted Workspace. Folder Project support does not discover, run, or expose Local Verification evidence, including for nested Git repositories.

ReviewLume is an independent open-source project. It is not affiliated with or endorsed by OpenAI, Microsoft, Anthropic, Google, or other service providers.

## Data ReviewLume Does Not Collect

ReviewLume does not operate a developer-owned cloud service and does not collect:

- telemetry or analytics;
- advertising identifiers;
- browser cookies, sessions, passwords, or browsing history;
- ChatGPT conversation history or responses;
- payment information;
- project data on ReviewLume-owned servers.

ReviewLume does not call a model API and does not use an OpenAI model API key. The OpenAI credential used by the extension is a Secure MCP Tunnel Runtime API Key supplied by the user.

## Data Stored Locally

Depending on the features used, ReviewLume may store:

- the selected official `tunnel-client` executable path;
- the OpenAI Tunnel ID;
- the normalized OpenAI control-plane proxy URL;
- the preferred browser used to open ChatGPT;
- Git-repository-specific Local Verification approvals in VS Code global state;
- the latest Local Verification metadata and sanitized bounded output in VS Code global storage;
- P8 Advanced Review Pack exports and review history under the selected Git repository's `.reviewlume/` directory.

Local Verification approvals and output are not intentionally written into the selected repository.

The OpenAI Runtime API Key is stored only in VS Code SecretStorage. ReviewLume does not intentionally write that key to project files, VS Code settings JSON, process arguments, the clipboard, or logs.

Each local MCP run uses a fresh random loopback port and a fresh high-entropy local token. Stopping the connection or closing the extension invalidates that local endpoint and token.

## When Project Data Can Leave the Machine

ReviewLume sends no project content merely because VS Code starts or the extension activates.

Project data can leave the machine only after the user:

1. explicitly starts a ReviewLume Secure MCP connection for one selected project;
2. enables the ReviewLume app or connector in a ChatGPT conversation; and
3. asks a question that causes ChatGPT to call one or more exposed ReviewLume tools.

### Git Project data

Depending on the tool call, Git Project data can include:

- repository identity, branch, HEAD, remote metadata, and working-tree status;
- recent commit authors, timestamps, subjects, and hashes;
- bounded working-tree, staged, or commit-range diffs;
- tracked and non-ignored untracked file paths;
- bounded text-file line ranges;
- bounded literal code-search matches;
- when Local Verification is available, completed verification status and bounded sanitized output.

### Folder Project data

Folder Projects can expose project-wide file data through:

- `project_summary`;
- bounded project-relative file paths from `list_files`;
- bounded text-file excerpts from `read_file`;
- bounded literal matches from `search_code`.

A Folder Project may also expose **real nested Git repository** information through:

- `list_git_repositories`;
- `repository_summary`;
- `git_status`;
- `recent_commits`;
- `get_diff`.

Those Git query tools require one explicit Folder-relative repository path returned by `list_git_repositories`. They can return that child repository's branch, HEAD, status, commit metadata, remote metadata, and bounded diffs. ReviewLume does not construct aggregate Git history for the Folder root and does not merge state from separate child repositories.

Folder mode never exposes Local Verification evidence and does not automatically run validation in discovered child repositories.

## Shared MCP Read Boundaries

All project types enforce:

- one active connection bound to one canonical project root;
- VS Code Workspace Trust before MCP start;
- absolute-path and parent-traversal rejection;
- direct `.git` file-read rejection;
- canonical `realpath` checks that prevent project file reads outside the bound root;
- rejection of external symlink targets;
- rejection of directories, binary files, and oversized files by file-reading tools;
- bounded result size, file count, line count, request size, concurrency, and call rate;
- no MCP shell, terminal, write, delete, patch, Git-mutation, or arbitrary process-start tool.

Project files and AI responses are untrusted input. Text inside a project cannot authorize a command, enlarge the root, enable a hidden capability, or make the connector writable.

## Git Project Privacy Boundary

For compatibility with the existing Git connector, Git Project MCP remains a repository-bound reader rather than a secret-classification system.

The following are **not** automatically enforced for Git Projects:

- `.env`, credential, secret, certificate, key, database, or production-configuration filenames are not blocked solely because of their names;
- `read_file` may read an explicitly addressed regular text file inside the repository, including an ignored file, when the caller knows or guesses the path;
- `list_files` and `search_code` enumerate tracked files and non-ignored untracked files, so tracked sensitive files remain eligible;
- diffs, excerpts, commit subjects, search results, target paths, and verification output may contain secrets or personal/internal data;
- P8 SecretScanner is not automatically applied to Git MCP tool calls.

Credential-bearing usernames and passwords are removed from returned Git remote URLs, and Git external diff/textconv execution is disabled, but these controls do not make repository contents non-sensitive.

## Folder Project Privacy Boundary

Folder **file enumeration and direct file reads** use a more conservative policy because there is no Git index to define the overall Folder file set.

Folder file enumeration:

- is implemented with bounded filesystem reads and starts no process;
- never follows symbolic-link or junction-like link entries;
- canonicalizes enumerated directories/files and requires them to remain under the canonical project root;
- skips `.git`, `.hg`, `.svn` and common dependency/build/cache trees;
- skips common credential-store directories such as `.ssh`, `.gnupg`, `.aws`, `.azure`, and `.kube`;
- visits at most 20,000 entries and returns at most 5,000 candidate files.

Folder file tools additionally block obvious credential-like paths such as:

- `.env` and non-template `.env.*` files;
- `credentials`, `credentials.json`, and common `secrets.*` names;
- `id_rsa`, `id_ed25519`, `.npmrc`, `.pypirc`, and `.netrc`;
- common private-key/certificate/container extensions such as `.key`, `.pem`, `.p12`, `.pfx`, `.jks`, `.keystore`, and `.kdbx`.

Template files such as `.env.example`, `.env.sample`, `.env.template`, and `.env.dist` remain readable.

**This is not content DLP or a complete SecretScanner.** Ordinary source/config files can still contain API keys, tokens, passwords, connection strings, personal data, customer data, or internal addresses. Users must sanitize projects before connecting them.

### Nested Git privacy boundary

`list_git_repositories` performs bounded directory inspection and uses the existing allowlisted read-only Git runner only for candidate directories that contain a local `.git` marker. The Git top-level and absolute Git metadata directory must both resolve inside the authorized Folder root. Symlink/junction escapes and Git metadata outside the root are rejected.

Once a nested repository is explicitly selected, `repository_summary`, `git_status`, `recent_commits`, and `get_diff` use the existing Git Project semantics for that child repository. Therefore **Folder filename blocking is not a content filter for nested Git metadata/diffs**: a tracked sensitive-looking path, commit subject, status path, or diff inside a child repository may be returned by the Git tools. Users must not rely on `.env` filename blocking to sanitize an explicitly requested nested Git diff.

The nested Git feature does not allow arbitrary process execution. It reuses the existing Git read-only command allowlist, disables external diff/textconv, bounds results, and adds no mutation command.

The stricter Folder file policy does not retroactively change the existing Git Project filename semantics.

## Optional Local Verification Assistant

Local Verification remains **Git Project only**.

For Git Projects:

- it requires a Trusted Workspace;
- approval is bound to one canonical Git repository;
- the user sees executable, fixed arguments, target mode, timeout, and risk warning before approval;
- the launcher uses executable + argv with `shell: false`;
- free-form commands, package scripts, AI responses, repository instructions, and commands found in test output are not executed;
- runner/config changes invalidate approval;
- output and execution time are bounded;
- results are bound to HEAD and working-tree state and become stale after changes.

Tests remain executable untrusted repository code and can potentially modify files, launch child processes, access the network, read environment data, or contact local services. The assistant is not a sandbox.

For Folder Projects:

- no verification discovery occurs during MCP connection;
- no approved verification rule is run;
- `verification_status` and `read_verification_output` are not registered;
- discovered nested Git repositories do not inherit or trigger Local Verification approvals.

If a child repository needs Local Verification, it must be opened/connected directly as a Git Project under the existing repository-bound approval model.

See [docs/local-verification-assistant.md](docs/local-verification-assistant.md) for the Git Project execution/evidence boundary.

## Data Sent to OpenAI and ChatGPT

Data returned through the connector is transmitted through the official OpenAI Secure MCP Tunnel and processed by OpenAI under the user's OpenAI account, workspace controls, terms, privacy settings, and applicable data policies. ReviewLume does not control OpenAI retention, residency, training, workspace administration, or downstream processing after data reaches OpenAI.

ReviewLume does not proxy project content or verification evidence through a ReviewLume-operated server.

Users should review OpenAI's current product, privacy, workspace, and data-control documentation before enabling the connector.

## User Responsibilities and Data Minimization

Before connecting any project, users should:

- remove, rotate, or redact real secrets and credentials;
- avoid connecting projects that expose production databases or real customer data;
- use a sanitized copy, test branch, dedicated review project, or isolated test environment when necessary;
- for Git Project Local Verification, inspect the exact approved rules before running them;
- remember that explicitly requested nested Git status/diff/history can expose data that Folder direct-file filename blocking would otherwise omit;
- confirm that their organization permits the selected content and evidence to be processed by OpenAI;
- stop the connection when review is complete;
- revoke the Runtime API Key immediately if exposure is suspected.

`.gitignore` is not a complete confidentiality boundary for Git Projects. Folder Projects have their own bounded filesystem/path-name policy, but it also cannot detect every secret and does not sanitize explicit nested Git diff/history output.

## P8 Advanced Features

P8 Advanced Review Packs, imported responses, review history, issue state, implementation summaries, and re-review records remain local Git-oriented workflows.

The P8 Advanced Review Pack flow has a separate SecretScanner and export gate. Those controls apply only to content collected/exported through that flow. They do not automatically filter MCP tool calls or Local Verification output.

Folder Project Support does not convert P8 review history or Git diff workflows into Folder workflows.

## Logs

ReviewLume diagnostic logs are designed not to contain Runtime API keys, local MCP tokens, Authorization headers, file contents, diffs, search terms, search results, or raw verification output. Users should still review diagnostic output before sharing it publicly.

Raw HTTP logging and payload capture are disabled in the controlled `tunnel-client` environment. Long-running `tunnel-client` stdout/stderr is not collected by ReviewLume.

## Security Boundaries

ReviewLume does not provide MCP tools for:

- shell or terminal execution;
- arbitrary commands or package scripts;
- starting or retrying Local Verification processes;
- writing, deleting, or renaming project files;
- applying patches;
- Git add, commit, checkout, reset, clean, merge, rebase, fetch, or push;
- executing instructions contained in project files or AI responses.

Local Verification is a separate VS Code-controlled Git Project capability and does not make MCP writable or executable.

## Deleting Local Data

Users can:

- stop the active MCP connection from the `ReviewLume MCP` status-bar menu;
- for Git Projects, clear Local Verification approval/result through the existing command;
- delete `.reviewlume/` P8 exports/history through Advanced commands or normal file-system controls;
- remove extension state by uninstalling ReviewLume and clearing VS Code extension storage;
- remove the Runtime API Key through reconfiguration or VS Code secret-storage cleanup;
- delete or revoke the OpenAI Tunnel/Runtime API Key in OpenAI Platform;
- disable or delete the ReviewLume app/connector in ChatGPT.

## Third-Party Services

Use of ChatGPT, OpenAI Secure MCP Tunnel, Visual Studio Code, Git, test runners, browsers, and other third-party products is governed by those providers' terms and privacy policies. ReviewLume does not promise availability, retention behavior, plan eligibility, workspace controls, or privacy guarantees for third-party services.

## Changes

Material changes to this policy will be recorded in repository history and release notes.

## Contact and Security Reports

For security vulnerabilities, use the private reporting process described in [SECURITY.md](SECURITY.md). For ordinary privacy questions, use public repository channels without including secrets, credentials, private project content, Runtime API Keys, Tunnel credentials, raw diagnostic payloads, or raw verification output.
