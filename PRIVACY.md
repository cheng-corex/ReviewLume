# ReviewLume Privacy Policy

Last updated: 2026-07-21

## Overview

ReviewLume is a privacy-first, read-only-first VS Code extension that can expose
one selected Git repository to ChatGPT through a controlled local Model Context
Protocol (MCP) server and the official OpenAI Secure MCP Tunnel.

ReviewLume is an independent open-source project. It is not affiliated with or
endorsed by OpenAI, Microsoft, Anthropic, Google, or other service providers.

## Data ReviewLume Does Not Collect

ReviewLume does not operate a developer-owned cloud service and does not collect:

- telemetry or analytics;
- advertising identifiers;
- browser cookies, sessions, passwords, or browsing history;
- ChatGPT conversation history or responses;
- payment information;
- repository data on ReviewLume-owned servers.

## Data Stored Locally

Depending on the features used, ReviewLume may store the following on the user's
machine:

- the selected official `tunnel-client` executable path;
- the OpenAI Tunnel ID;
- the normalized OpenAI control-plane proxy URL;
- the preferred browser used to open ChatGPT;
- P8 Advanced Review Pack exports and review history under the selected repository's
  `.reviewlume/` directory.

The OpenAI Runtime API key is stored only in VS Code SecretStorage. ReviewLume does
not intentionally write that key to repository files, VS Code settings JSON,
process arguments, the clipboard, or logs.

Each local MCP run uses a fresh random loopback port and a fresh high-entropy local
token. Stopping the connection or closing the extension invalidates that local
endpoint and token.

## Data Sent to OpenAI and ChatGPT

ReviewLume sends no repository content merely because VS Code starts or the
extension activates.

Data can leave the local machine only after the user:

1. explicitly starts a ReviewLume Secure MCP connection for a selected Git
   repository;
2. enables the ReviewLume connector in a ChatGPT conversation; and
3. asks ChatGPT a question that causes ChatGPT to call one or more ReviewLume tools.

ChatGPT may then request permitted data such as:

- repository summary and current branch information;
- Git status and recent commit metadata;
- bounded Git diffs;
- eligible repository file paths;
- bounded text-file excerpts;
- bounded literal code-search results.

Before returning data, ReviewLume applies repository binding, path normalization,
symlink, `.git`, sensitive-path, binary, size, request, rate, and SecretScanner
controls. These controls reduce risk but cannot guarantee that every sensitive or
personal value will be detected. Users should not connect repositories containing
content they are not authorized to share with OpenAI.

Data returned through the connector is transmitted through the official OpenAI
Secure MCP Tunnel and processed by OpenAI under the user's OpenAI account,
workspace controls, terms, and privacy settings. ReviewLume does not control
OpenAI's retention or processing after the data reaches OpenAI.

## P8 Advanced Features

Review Packs, imported responses, review history, issue state, implementation
summaries, and re-review records are stored locally. ReviewLume does not upload
those records automatically. They leave the machine only when the user deliberately
copies, exports, opens, or sends them through another service.

## Logs

ReviewLume diagnostic logs are designed not to contain Runtime API keys, local MCP
tokens, Authorization headers, file contents, diffs, search terms, or search
results. Users should still review diagnostic output before sharing it publicly.
Raw HTTP logging is disabled in the controlled tunnel-client environment.

## Security Boundaries

ReviewLume does not provide MCP tools for:

- shell or terminal execution;
- writing or deleting project files;
- applying patches;
- Git add, commit, checkout, reset, clean, merge, rebase, fetch, or push;
- executing instructions contained in repository files or AI responses.

Repository files and AI responses are treated as untrusted input.

## Deleting Local Data

Users can:

- stop the active MCP connection from the `ReviewLume MCP` status-bar menu;
- delete `.reviewlume/` exports and history through ReviewLume's Advanced commands
  or normal file-system controls;
- remove stored extension state by uninstalling ReviewLume and clearing its VS Code
  extension storage;
- remove the Runtime API key through ReviewLume reconfiguration or VS Code secret
  storage cleanup;
- delete or revoke the OpenAI Tunnel and Runtime API key in the OpenAI Platform.

## Third-Party Services

Use of ChatGPT, OpenAI Secure MCP Tunnel, Visual Studio Code, Git, browsers, and
other third-party products is governed by those providers' terms and privacy
policies. ReviewLume does not promise availability, retention behavior, or privacy
controls for third-party services.

## Changes

Material changes to this policy will be recorded in the repository history and
release notes.

## Contact and Security Reports

For security vulnerabilities, use the private reporting process described in
[SECURITY.md](SECURITY.md). For ordinary privacy questions, use the repository's
public issue or discussion channels without including secrets or private project
content.
