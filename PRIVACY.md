# ReviewLume Privacy Policy

Last updated: 2026-08-03

## Overview

ReviewLume is a privacy-aware VS Code extension that can expose one selected Git repository to ChatGPT through a controlled, read-only local Model Context Protocol (MCP) server and the official OpenAI Secure MCP Tunnel.

ReviewLume also has an optional local verification assistant. That assistant can execute fixed repository-local test and type-check rules only after the user approves them in a Trusted Workspace. ChatGPT cannot start, retry, change, or compose those processes; it can only read completed verification evidence through read-only MCP tools.

ReviewLume is an independent open-source project. It is not affiliated with or endorsed by OpenAI, Microsoft, Anthropic, Google, or other service providers.

**Important:** the ReviewLume MCP connection does not automatically run SecretScanner and does not automatically block files merely because they are named `.env`, `credentials`, `secrets`, or appear to contain tokens, passwords, private keys, connection strings, personal data, or internal addresses. Users must connect only repositories and content they are authorized and willing to provide to OpenAI.

**Important:** tests are executable repository code. Even when ReviewLume launches a fixed approved runner without a shell, the runner or tests may modify files, start child processes, access the network, read environment data, or contact local services. The local verification assistant is not a sandbox.

## Data ReviewLume Does Not Collect

ReviewLume does not operate a developer-owned cloud service and does not collect:

- telemetry or analytics;
- advertising identifiers;
- browser cookies, sessions, passwords, or browsing history;
- ChatGPT conversation history or responses;
- payment information;
- repository data on ReviewLume-owned servers.

ReviewLume does not call a model API and does not use an OpenAI model API key. The OpenAI credential used by the extension is a Secure MCP Tunnel Runtime API Key supplied by the user.

## Data Stored Locally

Depending on the features used, ReviewLume may store the following on the user's machine:

- the selected official `tunnel-client` executable path;
- the OpenAI Tunnel ID;
- the normalized OpenAI control-plane proxy URL;
- the preferred browser used to open ChatGPT;
- repository-specific local verification approvals in VS Code global state;
- the latest local verification metadata and sanitized bounded output in VS Code global storage;
- P8 Advanced Review Pack exports and review history under the selected repository's `.reviewlume/` directory.

Local verification approvals and output are not intentionally written into the selected repository.

The OpenAI Runtime API Key is stored only in VS Code SecretStorage. ReviewLume does not intentionally write that key to repository files, VS Code settings JSON, process arguments, the clipboard, or logs.

Each local MCP run uses a fresh random loopback port and a fresh high-entropy local token. Stopping the connection or closing the extension invalidates that local endpoint and token.

## When Repository Data Can Leave the Machine

ReviewLume sends no repository content merely because VS Code starts or the extension activates.

Repository data can leave the local machine only after the user:

1. explicitly starts a ReviewLume Secure MCP connection for a selected Git repository;
2. enables the ReviewLume app or connector in a ChatGPT conversation; and
3. asks a question that causes ChatGPT to call one or more ReviewLume tools.

ChatGPT may then request permitted data such as:

- repository identity, branch, HEAD, remote metadata, and working-tree status;
- recent commit authors, timestamps, subjects, and hashes;
- bounded working-tree, staged, or commit-range diffs;
- tracked and non-ignored untracked file paths;
- bounded text-file line ranges;
- bounded literal code-search matches;
- local verification status, target paths, exit codes, durations, parsed test counts, evidence messages, and stale-state information;
- bounded sanitized stdout/stderr excerpts from a completed local verification step.

ReviewLume does not automatically send verification output merely because a local verification run occurred. It becomes eligible to leave the machine only when ChatGPT calls one of the read-only verification evidence tools.

## Actual MCP Read Boundaries

The MCP tools enforce repository and resource boundaries, but they are not a secret-classification system.

The following are enforced:

- one active connection is bound to one Git repository;
- absolute paths, parent traversal, `.git`, and paths outside the bound repository are rejected;
- symbolic links that resolve outside the repository are rejected;
- directories, binary files, and oversized files are rejected by file-reading tools;
- Git external diff and textconv execution are disabled;
- result size, file count, line count, request size, concurrency, and call rate are bounded;
- credential-bearing usernames and passwords are removed from returned remote URLs;
- no shell, terminal, write, delete, patch, Git-mutation, or process-start MCP tool is exposed.

The following are **not** automatically enforced by the MCP tools:

- `.env`, credential, secret, certificate, key, database, or production-configuration filenames are not blocked solely because of their names;
- `read_file` may read any explicitly addressed regular text file inside the repository, including ignored files, when the caller knows or guesses the path;
- `list_files` and `search_code` enumerate tracked files and non-ignored untracked files, so tracked sensitive files remain eligible;
- diffs, file excerpts, commit subjects, search results, test target paths, and verification output may contain API keys, tokens, passwords, private-key text, connection strings, personal data, customer data, or internal addresses;
- SecretScanner is not automatically applied to MCP tool calls.

Repository files and AI responses are treated as untrusted input, but that does not make their contents non-sensitive.

## Optional Local Verification Assistant

The local verification assistant is controlled from VS Code, not from ChatGPT.

The following are enforced:

- local verification requires a Trusted Workspace;
- an approval is bound to one canonical Git repository;
- the user sees the executable, fixed arguments, target mode, timeout, and risk warning before approving;
- the launcher uses an executable and argv array with `shell: false`;
- ReviewLume does not execute free-form command strings, package scripts, AI responses, repository instructions, or commands found in test output;
- only supported repository-local runner entry points are discovered from fixed locations;
- runner and relevant configuration changes invalidate the approval;
- output and execution time are bounded;
- cancellation attempts to terminate the process tree;
- common credential patterns and ANSI control sequences are removed from stored output on a best-effort basis;
- the result is bound to HEAD and a staged, unstaged, and non-ignored untracked workspace fingerprint;
- a changed workspace makes prior evidence stale.

The following are **not** guaranteed:

- test code cannot modify files or external systems;
- test code cannot access the network or local services;
- the reduced environment contains no sensitive value relevant to every possible test;
- output redaction detects every secret or personal value;
- a successful exit code proves coverage, isolation, correctness, or absence of side effects.

See [docs/local-verification-assistant.md](docs/local-verification-assistant.md) for the detailed execution and evidence boundaries.

## Data Sent to OpenAI and ChatGPT

Data returned through the connector is transmitted through the official OpenAI Secure MCP Tunnel and processed by OpenAI under the user's OpenAI account, workspace controls, terms, privacy settings, and applicable data policies. ReviewLume does not control OpenAI's retention, residency, training, workspace administration, or downstream processing after data reaches OpenAI.

ReviewLume does not proxy repository content or verification evidence through a ReviewLume-operated server.

Users should review OpenAI's current product, privacy, workspace, and data-control documentation before enabling the connector. OpenAI product availability and behavior may change independently of ReviewLume.

## User Responsibilities and Data Minimization

Before connecting a repository or enabling local verification, users should:

- remove, rotate, or redact real secrets and credentials;
- avoid connecting repositories or running tests that expose production databases or real customer data;
- use a sanitized copy, test branch, dedicated review repository, or isolated test environment when necessary;
- inspect the exact verification rules shown by VS Code before approval;
- confirm that their organization permits the selected content and verification output to be processed by OpenAI;
- stop the connection when the review is complete;
- clear the verification approval when it is no longer needed;
- revoke the Runtime API Key immediately if exposure is suspected.

`.gitignore` can reduce enumeration of untracked files, but it is not a complete confidentiality boundary: tracked files remain eligible, and an explicitly addressed ignored text file can still be read by `read_file`.

## P8 Advanced Features

P8 Advanced Review Packs, imported responses, review history, issue state, implementation summaries, and re-review records are stored locally.

The P8 Advanced Review Pack workflow has a separate SecretScanner and export-gating process. Those controls apply only to content collected and exported through that workflow. They do not automatically filter or protect MCP tool calls or local verification output.

ReviewLume does not automatically upload P8 records. They leave the machine only when the user deliberately copies, exports, opens, or sends them through another service.

## Logs

ReviewLume diagnostic logs are designed not to contain Runtime API keys, local MCP tokens, Authorization headers, file contents, diffs, search terms, search results, or raw verification output. Users should still review diagnostic output before sharing it publicly.

Local verification stdout/stderr is stored separately as bounded, sanitized evidence. Redaction is best-effort. Users must review it before allowing ChatGPT to read it or sharing it elsewhere.

Raw HTTP logging and payload capture are disabled in the controlled `tunnel-client` environment. Long-running `tunnel-client` stdout and stderr are not collected by ReviewLume.

## Security Boundaries

ReviewLume does not provide MCP tools for:

- shell or terminal execution;
- starting or retrying local verification processes;
- writing or deleting project files;
- applying patches;
- Git add, commit, checkout, reset, clean, merge, rebase, fetch, or push;
- executing instructions contained in repository files or AI responses.

The optional local verification assistant is a separate VS Code-controlled capability. It runs only fixed, previously approved repository-local rules and does not make the MCP connector writable or executable.

ReviewLume cannot guarantee that ChatGPT's analysis is correct or that every sensitive value will be noticed by the user, the model, or output redaction.

## Deleting Local Data

Users can:

- stop the active MCP connection from the `ReviewLume MCP` status-bar menu;
- run `ReviewLume: Clear Local Verification Approval` to remove the current repository's approval and stored result;
- delete `.reviewlume/` exports and history through ReviewLume's Advanced commands or normal file-system controls;
- remove stored extension state by uninstalling ReviewLume and clearing its VS Code extension storage;
- remove the Runtime API Key through ReviewLume reconfiguration or VS Code secret-storage cleanup;
- delete or revoke the OpenAI Tunnel and Runtime API Key in the OpenAI Platform;
- disable or delete the ReviewLume app or connector in ChatGPT.

## Third-Party Services

Use of ChatGPT, OpenAI Secure MCP Tunnel, Visual Studio Code, Git, test runners, browsers, and other third-party products is governed by those providers' terms and privacy policies. ReviewLume does not promise availability, retention behavior, plan eligibility, workspace controls, or privacy guarantees for third-party services.

## Changes

Material changes to this policy will be recorded in the repository history and release notes.

## Contact and Security Reports

For security vulnerabilities, use the private reporting process described in [SECURITY.md](SECURITY.md). For ordinary privacy questions, use the repository's public issue or discussion channels without including secrets, credentials, private project content, Runtime API Keys, Tunnel credentials, raw diagnostic payloads, or raw verification output.
