# ReviewLume Privacy Policy

Last updated: 2026-07-21

## Overview

ReviewLume is a privacy-first, least-privilege-first VS Code extension that can expose one selected Git repository to ChatGPT through a controlled local Model Context Protocol (MCP) server and the official OpenAI Secure MCP Tunnel.

ReviewLume is read-only by default. A user may explicitly enable a confirmed-write mode for the current VS Code window. In that mode, ChatGPT can request bounded text-file creation or replacement, but every effective batch requires an explicit modal confirmation in VS Code.

ReviewLume is an independent open-source project. It is not affiliated with or endorsed by OpenAI, Microsoft, Anthropic, Google, or other service providers.

## Data ReviewLume Does Not Collect

ReviewLume does not operate a developer-owned cloud service and does not collect:

- telemetry or analytics;
- advertising identifiers;
- browser cookies, sessions, passwords, or browsing history;
- ChatGPT conversation history or responses;
- payment information;
- repository data on ReviewLume-owned servers.

## Data Stored Locally

Depending on the features used, ReviewLume may store the following on the user's machine:

- the selected official `tunnel-client` executable path;
- the OpenAI Tunnel ID;
- the normalized OpenAI control-plane proxy URL;
- the preferred browser used to open ChatGPT;
- the VS Code setting that keeps MCP write access disabled or enables confirmation for each request;
- P8 Advanced Review Pack exports and review history under the selected repository's `.reviewlume/` directory;
- ordinary repository working-tree changes that the user explicitly approves in confirmed-write mode.

The OpenAI Runtime API key is stored only in VS Code SecretStorage. ReviewLume does not intentionally write that key to repository files, VS Code settings JSON, process arguments, the clipboard, or logs.

Each local MCP run uses a fresh random loopback port and a fresh high-entropy local token. Stopping the connection or closing the extension invalidates that local endpoint and token.

## Data Sent to OpenAI and ChatGPT

ReviewLume sends no repository content merely because VS Code starts or the extension activates.

Data can leave the local machine only after the user:

1. explicitly starts a ReviewLume Secure MCP connection for a selected Git repository;
2. enables the ReviewLume connector in a ChatGPT conversation; and
3. asks ChatGPT a question that causes ChatGPT to call one or more ReviewLume tools.

ChatGPT may then request permitted data such as:

- repository summary and current branch information;
- Git status and recent commit metadata;
- bounded Git diffs;
- repository file paths;
- bounded text-file content;
- bounded literal code-search results;
- in confirmed-write mode, complete bounded text files plus SHA-256 values used to prepare a proposed replacement.

ReviewLume can return actual text from the bound repository, including configuration and security-related files. It does not promise to detect or remove every secret before returning repository content. Users must not connect repositories or approve requests containing content they are not authorized to share with OpenAI.

Data returned through the connector is transmitted through the official OpenAI Secure MCP Tunnel and processed by OpenAI under the user's OpenAI account, workspace controls, terms, and privacy settings. ReviewLume does not control OpenAI's retention or processing after the data reaches OpenAI.

## Confirmed-write Requests

When confirmed-write mode is enabled, ChatGPT may send proposed file content back through the tunnel to the local ReviewLume MCP endpoint. ReviewLume validates repository boundaries, path rules, file type, size limits, expected SHA-256 values, and unsaved VS Code editor state before asking for confirmation.

The confirmation dialog may show:

- the repository name;
- ChatGPT's requested reason;
- repository-relative target paths;
- whether each target will be created or replaced;
- old and new byte counts.

The proposed file body is not written until the user approves. Declining or closing the dialog leaves the batch unapplied. Approved files remain ordinary local working-tree changes; ReviewLume does not automatically stage, commit, or push them.

## P8 Advanced Features

Review Packs, imported responses, review history, issue state, implementation summaries, and re-review records are stored locally. ReviewLume does not upload those records automatically. They leave the machine only when the user deliberately copies, exports, opens, or sends them through another service.

## Logs

ReviewLume diagnostic logs are designed not to contain Runtime API keys, local MCP tokens, Authorization headers, file contents, diffs, search terms, search results, or proposed write bodies. Tool names and high-level connection state may be logged. Users should still review diagnostic output before sharing it publicly. Raw HTTP logging is disabled in the controlled tunnel-client environment.

## Security Boundaries

ReviewLume does not provide MCP tools for:

- shell or terminal execution;
- deleting or renaming project files;
- arbitrary filesystem access outside the bound repository;
- Git add, commit, checkout, reset, clean, merge, rebase, fetch, or push;
- package installation or arbitrary process execution;
- executing instructions contained in repository files or AI responses.

Confirmed-write mode only permits bounded text-file creation or complete replacement after explicit VS Code confirmation. Repository files, AI-supplied reasons, proposed content, and AI responses are treated as untrusted input.

## Deleting Local Data

Users can:

- stop the active MCP connection from the `ReviewLume MCP` status-bar menu;
- revert or delete confirmed working-tree changes using normal editor or Git controls;
- delete `.reviewlume/` exports and history through ReviewLume's Advanced commands or normal file-system controls;
- remove stored extension state by uninstalling ReviewLume and clearing its VS Code extension storage;
- remove the Runtime API key through ReviewLume reconfiguration or VS Code secret storage cleanup;
- delete or revoke the OpenAI Tunnel and Runtime API key in the OpenAI Platform.

## Third-Party Services

Use of ChatGPT, OpenAI Secure MCP Tunnel, Visual Studio Code, Git, browsers, and other third-party products is governed by those providers' terms and privacy policies. ReviewLume does not promise availability, retention behavior, or privacy controls for third-party services.

## Changes

Material changes to this policy will be recorded in the repository history and release notes.

## Contact and Security Reports

For security vulnerabilities, use the private reporting process described in [SECURITY.md](SECURITY.md). For ordinary privacy questions, use the repository's public issue or discussion channels without including secrets or private project content.
