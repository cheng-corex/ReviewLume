# ReviewLume VS Code Marketplace Listing

## Publisher and extension identity

- Publisher name: `ReviewLume`
- Publisher ID: `ReviewLume`
- Extension name: `reviewlume-vscode`
- Full extension ID: `ReviewLume.reviewlume-vscode`
- Public version: `0.3.0`
- Release channel: Preview
- Pricing: Free

## Marketplace title

> ReviewLume – Secure Read-only Repository MCP

## Short description

> Connect ChatGPT to one VS Code Git repository through bounded, read-only MCP tools, with optional user-approved local verification.

## Overview

ReviewLume is a privacy-aware VS Code extension for AI-assisted code review. It connects one Git repository open in VS Code to ChatGPT through a loopback-only MCP server and the official OpenAI Secure MCP Tunnel.

ChatGPT can inspect repository identity, Git status, recent commits, bounded diffs, file paths, text excerpts, literal search matches, and completed local-verification evidence. ReviewLume does not expose shell execution, terminal access, process-start commands, file writes, deletion, patch application, or Git mutation commands through MCP.

Version 0.3.0 adds an optional local verification assistant. In a Trusted Workspace, the user may approve fixed repository-local verification rules. Matching added or modified tests are discovered automatically on later runs. Verification is controlled by VS Code, not ChatGPT. ChatGPT can only read completed, bounded, sanitized evidence through two read-only MCP tools and cannot start, retry, alter, or compose a command.

ReviewLume is an independent open-source project and is not affiliated with or endorsed by OpenAI, Microsoft, Anthropic, Google, or other service providers.

## Requirements

- VS Code 1.100 or later.
- A Trusted Workspace containing one Git repository.
- An OpenAI Platform Tunnel and least-privilege Runtime API Key.
- The official `openai/tunnel-client`, downloaded separately by the user.
- A ChatGPT account or workspace whose current web interface provides a custom MCP app/connector entry.
- Repository-local supported test runners when local verification is enabled.

OpenAI controls ChatGPT plan eligibility, workspace permissions, Developer mode, app management, and staged feature availability. ReviewLume cannot enable or bypass an unavailable ChatGPT feature.

## Read-only MCP tools

Repository tools:

- `repository_summary`
- `git_status`
- `recent_commits`
- `get_diff`
- `list_files`
- `read_file`
- `search_code`

Completed verification evidence tools:

- `verification_status`
- `read_verification_output`

All nine tools are declared read-only, non-destructive, idempotent, and closed-world. The verification tools explicitly report `mcpCanStartProcesses: false`.

## Optional local verification

The first 0.3.0 Preview supports fixed repository-local entry points for:

- Vitest;
- Jest;
- Mocha;
- Node's test runner;
- TypeScript `tsc --noEmit`;
- per-file `node --check` for added or modified `.js`, `.cjs`, and `.mjs` files.

ReviewLume does not run arbitrary package scripts, `npx`, downloaded runners, AI responses, repository instructions, or commands found in test output. It launches an executable with an argv array and `shell: false`.

Approval is bound to one canonical Git repository and to the executable, fixed arguments, target mode, timeout, relevant configuration, package-manager lockfile, and repository-local runner content. Boundary changes invalidate approval and require the user to approve again. Adding or modifying matching tests does not require per-file approval.

Local verification is not a sandbox. Test code may modify files, start child processes, access the network, read environment data, or contact local services. Users must inspect the approval dialog and run only repositories and tests they trust.

## Important privacy notice

ReviewLume does not collect telemetry and does not operate a repository-data cloud service. Repository content is not sent merely because VS Code starts or ReviewLume activates.

Data can leave the machine only after the user starts a ReviewLume connection, enables the ReviewLume app/connector in ChatGPT, and ChatGPT calls a ReviewLume tool. Returned results are transmitted through the official OpenAI Secure MCP Tunnel and processed by OpenAI under the user's account, workspace controls, terms, and privacy settings.

ReviewLume does not automatically send verification output merely because a local verification run occurred. Completed evidence becomes eligible to leave the machine only when ChatGPT calls one of the two read-only verification tools.

The MCP tools enforce repository and resource boundaries, but they are not a secret-classification system:

- MCP does not automatically run ReviewLume's SecretScanner.
- `.env`, credentials, secrets, certificates, private-key text, production configuration, and tracked sensitive files are not blocked solely because of their names or contents.
- `read_file` can read an explicitly addressed regular text file inside the bound repository, including an ignored file when the caller knows or guesses the path.
- Diffs, file excerpts, commit subjects, search results, test paths, and verification output may contain credentials, personal data, customer data, or internal addresses.
- `.gitignore` is not a complete confidentiality boundary.
- Verification-output redaction is best-effort and cannot guarantee detection of every secret or personal value.

Users must remove, rotate, or redact real secrets before connecting a repository and must not provide content or test output they are not authorized to share with OpenAI.

The P8 Advanced Review Pack workflow has a separate SecretScanner and export gate. Those controls do not automatically filter MCP tool calls or local-verification output.

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
- exposes no MCP shell, process-start, write, delete, patch, or Git-mutation tool;
- stores local-verification approval and bounded sanitized output in VS Code extension storage rather than the selected repository.

## Setup and policies

- Setup guide: https://github.com/cheng-corex/ReviewLume/blob/main/docs/chatgpt-secure-mcp-setup.md
- Local verification: https://github.com/cheng-corex/ReviewLume/blob/main/docs/local-verification-assistant.md
- Privacy policy: https://github.com/cheng-corex/ReviewLume/blob/main/PRIVACY.md
- Security policy: https://github.com/cheng-corex/ReviewLume/blob/main/SECURITY.md
- Source code: https://github.com/cheng-corex/ReviewLume

## Suggested screenshots

All screenshots must use a test repository and must not contain real tokens, Tunnel IDs, email addresses, private paths, customer data, or source code that cannot be published.

1. VS Code status bar showing `ReviewLume MCP` stopped.
2. ReviewLume MCP menu with the main connect/configure/diagnostics actions.
3. Local verification approval dialog using a synthetic repository.
4. A completed local verification result with synthetic output.
5. Connected status showing a neutral test repository name.
6. ChatGPT conversation showing a read-only review result with tool calls collapsed or sanitized.
7. Optional P8 Advanced Review Panel using synthetic files and findings.

Recommended size: 1280×720 or larger PNG. Crop personal account details and browser profile information.

## Upload checklist

- [ ] Publisher ID in the VSIX is exactly `ReviewLume`.
- [ ] Extension version is `0.3.0`.
- [ ] Marketplace Preview and Free metadata are present.
- [ ] Four-platform CI is green for the exact release head.
- [ ] VSIX content validation is green.
- [ ] Final VSIX SHA-256 is recorded.
- [ ] The exact final VSIX is installed successfully on Windows.
- [ ] Local-verification approval, automatic test discovery, failure, zero-test, cancellation, stale-state, and clear-approval flows are accepted on Windows.
- [ ] ChatGPT sees nine read-only tools and cannot start a process.
- [ ] System default browser opens ChatGPT without the VS Code Open/Cancel prompt.
- [ ] A real read-only ChatGPT project check succeeds.
- [ ] Stopping the connection removes the local endpoint and tunnel process.
- [ ] Marketplace screenshots contain no private information.
- [ ] The same byte-identical VSIX is used for GitHub prerelease and Marketplace upload.
