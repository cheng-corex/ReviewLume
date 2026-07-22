# ReviewLume Privacy Policy

Last updated: 2026-07-22

## Overview

ReviewLume is a privacy-aware, read-only VS Code extension that can expose one selected Git repository to ChatGPT through a controlled local Model Context Protocol (MCP) server and the official OpenAI Secure MCP Tunnel.

ReviewLume is an independent open-source project. It is not affiliated with or endorsed by OpenAI, Microsoft, Anthropic, Google, or other service providers.

**Important:** the ReviewLume P9 MCP connection does not automatically run SecretScanner and does not automatically block files merely because they are named `.env`, `credentials`, `secrets`, or appear to contain tokens, passwords, private keys, connection strings, personal data, or internal addresses. Users must connect only repositories and content they are authorized and willing to provide to OpenAI.

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
- P8 Advanced Review Pack exports and review history under the selected repository's `.reviewlume/` directory.

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
- bounded literal code-search matches.

## Actual P9 MCP Read Boundaries

The P9 MCP tools enforce repository and resource boundaries, but they are not a secret-classification system.

The following are enforced:

- one active connection is bound to one Git repository;
- absolute paths, parent traversal, `.git`, and paths outside the bound repository are rejected;
- symbolic links that resolve outside the repository are rejected;
- directories, binary files, and oversized files are rejected by file-reading tools;
- Git external diff and textconv execution are disabled;
- result size, file count, line count, request size, concurrency, and call rate are bounded;
- credential-bearing usernames and passwords are removed from returned remote URLs;
- no shell, terminal, write, delete, patch, or Git-mutation tool is exposed.

The following are **not** automatically enforced by the P9 MCP tools:

- `.env`, credential, secret, certificate, key, database, or production-configuration filenames are not blocked solely because of their names;
- `read_file` may read any explicitly addressed regular text file inside the repository, including ignored files, when the caller knows or guesses the path;
- `list_files` and `search_code` enumerate tracked files and non-ignored untracked files, so tracked sensitive files remain eligible;
- diffs, file excerpts, commit subjects, and search results may contain API keys, tokens, passwords, private-key text, connection strings, personal data, customer data, or internal addresses;
- SecretScanner is not automatically applied to P9 MCP tool calls.

Repository files and AI responses are treated as untrusted input, but that does not make their contents non-sensitive.

## Data Sent to OpenAI and ChatGPT

Data returned through the connector is transmitted through the official OpenAI Secure MCP Tunnel and processed by OpenAI under the user's OpenAI account, workspace controls, terms, privacy settings, and applicable data policies. ReviewLume does not control OpenAI's retention, residency, training, workspace administration, or downstream processing after data reaches OpenAI.

ReviewLume does not proxy repository content through a ReviewLume-operated server.

Users should review OpenAI's current product, privacy, workspace, and data-control documentation before enabling the connector. OpenAI product availability and behavior may change independently of ReviewLume.

## User Responsibilities and Data Minimization

Before connecting a repository, users should:

- remove, rotate, or redact real secrets and credentials;
- avoid connecting repositories containing production databases or real customer data;
- use a sanitized copy, test branch, or dedicated review repository when necessary;
- confirm that their organization permits the selected content to be processed by OpenAI;
- stop the connection when the review is complete;
- revoke the Runtime API Key immediately if exposure is suspected.

`.gitignore` can reduce enumeration of untracked files, but it is not a complete confidentiality boundary: tracked files remain eligible, and an explicitly addressed ignored text file can still be read by `read_file`.

## P8 Advanced Features

P8 Advanced Review Packs, imported responses, review history, issue state, implementation summaries, and re-review records are stored locally.

The P8 Advanced Review Pack workflow has a separate SecretScanner and export-gating process. Those controls apply only to content collected and exported through that workflow. They do not automatically filter or protect P9 MCP tool calls.

ReviewLume does not automatically upload P8 records. They leave the machine only when the user deliberately copies, exports, opens, or sends them through another service.

## Logs

ReviewLume diagnostic logs are designed not to contain Runtime API keys, local MCP tokens, Authorization headers, file contents, diffs, search terms, or search results. Users should still review diagnostic output before sharing it publicly.

Raw HTTP logging and payload capture are disabled in the controlled `tunnel-client` environment. Long-running `tunnel-client` stdout and stderr are not collected by ReviewLume.

## Security Boundaries

ReviewLume does not provide MCP tools for:

- shell or terminal execution;
- writing or deleting project files;
- applying patches;
- Git add, commit, checkout, reset, clean, merge, rebase, fetch, or push;
- executing instructions contained in repository files or AI responses.

ReviewLume cannot guarantee that ChatGPT's analysis is correct or that every sensitive value will be noticed by the user or model.

## Deleting Local Data

Users can:

- stop the active MCP connection from the `ReviewLume MCP` status-bar menu;
- delete `.reviewlume/` exports and history through ReviewLume's Advanced commands or normal file-system controls;
- remove stored extension state by uninstalling ReviewLume and clearing its VS Code extension storage;
- remove the Runtime API Key through ReviewLume reconfiguration or VS Code secret-storage cleanup;
- delete or revoke the OpenAI Tunnel and Runtime API Key in the OpenAI Platform;
- disable or delete the ReviewLume app or connector in ChatGPT.

## Third-Party Services

Use of ChatGPT, OpenAI Secure MCP Tunnel, Visual Studio Code, Git, browsers, and other third-party products is governed by those providers' terms and privacy policies. ReviewLume does not promise availability, retention behavior, plan eligibility, workspace controls, or privacy guarantees for third-party services.

## Changes

Material changes to this policy will be recorded in the repository history and release notes.

## Contact and Security Reports

For security vulnerabilities, use the private reporting process described in [SECURITY.md](SECURITY.md). For ordinary privacy questions, use the repository's public issue or discussion channels without including secrets, credentials, private project content, Runtime API Keys, Tunnel credentials, or raw diagnostic payloads.