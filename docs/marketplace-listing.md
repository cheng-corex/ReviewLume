# ReviewLume VS Code Marketplace Listing

## Publisher and extension identity

- Publisher name: `ReviewLume`
- Publisher ID: `ReviewLume`
- Extension name: `reviewlume-vscode`
- Full extension ID: `ReviewLume.reviewlume-vscode`
- Public version: `0.2.0`
- Release channel: Preview
- Pricing: Free

## Marketplace title

> ReviewLume – Secure Read-only Repository MCP

## Short description

> Connect ChatGPT to one VS Code Git repository through the official OpenAI Secure MCP Tunnel and bounded, read-only MCP tools.

## Overview

ReviewLume is a privacy-aware, read-only VS Code extension for AI-assisted code review. It connects one Git repository open in VS Code to ChatGPT through a loopback-only MCP server and the official OpenAI Secure MCP Tunnel.

ChatGPT can inspect repository identity, Git status, recent commits, bounded diffs, file paths, text excerpts, and literal search matches. ReviewLume does not expose shell execution, terminal access, file writes, deletion, patch application, or Git mutation commands.

ReviewLume is an independent open-source project and is not affiliated with or endorsed by OpenAI, Microsoft, Anthropic, Google, or other service providers.

## Requirements

- VS Code 1.100 or later.
- A Trusted Workspace containing one Git repository.
- An OpenAI Platform Tunnel and least-privilege Runtime API Key.
- The official `openai/tunnel-client`, downloaded separately by the user.
- A ChatGPT account or workspace whose current web interface provides a custom MCP app/connector entry.

OpenAI controls ChatGPT plan eligibility, workspace permissions, Developer mode, app management, and staged feature availability. ReviewLume cannot enable or bypass an unavailable ChatGPT feature.

## Read-only MCP tools

- `repository_summary`
- `git_status`
- `recent_commits`
- `get_diff`
- `list_files`
- `read_file`
- `search_code`

All tools are declared read-only, non-destructive, idempotent, and closed-world.

## Important privacy notice

ReviewLume does not collect telemetry and does not operate a repository-data cloud service. Repository content is not sent merely because VS Code starts or ReviewLume activates.

Data can leave the machine only after the user starts a ReviewLume connection, enables the ReviewLume app/connector in ChatGPT, and ChatGPT calls a ReviewLume tool. Returned results are transmitted through the official OpenAI Secure MCP Tunnel and processed by OpenAI under the user's account, workspace controls, terms, and privacy settings.

The P9 MCP tools enforce repository and resource boundaries, but they are not a secret-classification system:

- P9 does not automatically run ReviewLume's SecretScanner.
- `.env`, credentials, secrets, certificates, private-key text, production configuration, and tracked sensitive files are not blocked solely because of their names or contents.
- `read_file` can read an explicitly addressed regular text file inside the bound repository, including an ignored file when the caller knows or guesses the path.
- Diffs, file excerpts, commit subjects, and search results may contain credentials, personal data, customer data, or internal addresses.
- `.gitignore` is not a complete confidentiality boundary.

Users must remove, rotate, or redact real secrets before connecting a repository and must not provide content they are not authorized to share with OpenAI.

The P8 Advanced Review Pack workflow has a separate SecretScanner and export gate. Those controls do not automatically filter P9 MCP tool calls.

## Security boundaries

ReviewLume:

- binds one active connection to one Git repository;
- listens only on a random `127.0.0.1` port;
- generates a fresh local token for each run;
- rejects absolute paths, parent traversal, `.git`, repository-outside symbolic-link escapes, directories, binary files, and oversized files;
- disables Git external diff and textconv;
- limits result size, file count, requests, concurrency, and call rate;
- stores the OpenAI Runtime API Key only in VS Code SecretStorage;
- does not read browser cookies, sessions, passwords, browsing history, or ChatGPT responses;
- does not expose shell, write, delete, patch, or Git-mutation tools.

## Setup

Full setup guide:

https://github.com/cheng-corex/ReviewLume/blob/main/docs/chatgpt-secure-mcp-setup.md

Privacy policy:

https://github.com/cheng-corex/ReviewLume/blob/main/PRIVACY.md

Security policy:

https://github.com/cheng-corex/ReviewLume/blob/main/SECURITY.md

Source code:

https://github.com/cheng-corex/ReviewLume

## Suggested screenshots

All screenshots must use a test repository and must not contain real tokens, Tunnel IDs, email addresses, private paths, customer data, or source code that cannot be published.

1. VS Code status bar showing `ReviewLume MCP` stopped.
2. ReviewLume MCP menu with the main connect/configure/diagnostics actions.
3. Connected status showing a neutral test repository name.
4. ChatGPT conversation showing a read-only review result with tool calls collapsed or sanitized.
5. Optional P8 Advanced Review Panel using synthetic files and findings.

Recommended size: 1280×720 or larger PNG. Crop personal account details and browser profile information.

## Upload checklist

- [ ] Publisher ID in the VSIX is exactly `ReviewLume`.
- [ ] Extension version is `0.2.0`.
- [ ] Marketplace Preview and Free metadata are present.
- [ ] Four-platform CI is green for the exact release head.
- [ ] VSIX content validation is green.
- [ ] Final VSIX SHA-256 is recorded.
- [ ] Windows installs the exact final VSIX successfully.
- [ ] System default browser opens ChatGPT without the VS Code Open/Cancel prompt.
- [ ] A real read-only ChatGPT project check succeeds.
- [ ] Stopping the connection removes the local endpoint and tunnel process.
- [ ] Marketplace screenshots contain no private information.
- [ ] The same byte-identical VSIX is used for GitHub prerelease and Marketplace upload.
