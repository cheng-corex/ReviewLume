# ReviewLume VS Code Marketplace Listing

## Publisher and extension identity

- Publisher name: `ReviewLume`
- Publisher ID: `ReviewLume`
- Extension name: `reviewlume-vscode`
- Full extension ID: `ReviewLume.reviewlume-vscode`
- Public version: `0.3.3`
- Release channel: Preview
- Pricing: Free

## Marketplace title

> ReviewLume – Secure Read-only Project MCP

## Short description

> Connect ChatGPT to one VS Code Git repository or Trusted Folder Project through bounded, read-only MCP tools, with optional user-approved Local Verification for direct Git projects.

## Overview

ReviewLume is a privacy-aware VS Code extension for AI-assisted code review. One connection binds one selected local Project Root and exposes a controlled, read-only MCP server through the official OpenAI Secure MCP Tunnel.

The connected root can be:

- **Git Project** — Git-aware inspection plus optional repository-bound Local Verification evidence.
- **Folder Project** — bounded file inspection across one Trusted Workspace Folder plus explicitly scoped read-only Git queries for real child repositories under that folder.

ReviewLume does not expose MCP shell execution, terminal access, arbitrary commands, process-start commands, file writes/deletion, patch application, or Git mutation.

Version 0.3.3 combines Folder Project support and the stable 11-tool MCP contract with the nested Local Verification runner fixes from 0.3.1. It supersedes 0.3.2, which was published before those two development lines had been reconciled.

ReviewLume is an independent open-source project and is not affiliated with or endorsed by OpenAI, Microsoft, Anthropic, Google, or other service providers.

## Requirements

- VS Code 1.100 or later.
- A Trusted Workspace Folder.
- Git only when Git-specific inspection or Local Verification is needed.
- An OpenAI Platform Tunnel and least-privilege Runtime API Key.
- The official `openai/tunnel-client`, downloaded separately by the user.
- A ChatGPT account/workspace whose current interface provides the custom MCP app/connector entry.

OpenAI controls ChatGPT plan eligibility, Developer mode, workspace permissions, and staged feature availability. ReviewLume cannot enable or bypass unavailable ChatGPT features.

## Stable read-only MCP tools

Git Project and Folder Project advertise the same 11 tool names and public input schemas:

- `project_summary`
- `list_git_repositories`
- `repository_summary`
- `git_status`
- `recent_commits`
- `get_diff`
- `list_files`
- `read_file`
- `search_code`
- `verification_status`
- `read_verification_output`

The tools are read-only/non-mutating. Project kind changes runtime semantics rather than the public tool list.

### Direct Git Project

Git queries operate directly on the connected repository and do not require a `repository` selector. `list_git_repositories` reports that the root is already the Git Project.

`verification_status` and `read_verification_output` may read completed Local Verification evidence. They explicitly cannot start, retry, change, or compose a process.

### Folder Project

`list_git_repositories` performs bounded discovery of real child repositories under the authorized Folder root. `repository_summary`, `git_status`, `recent_commits`, and `get_diff` require one exact Folder-relative repository path returned by discovery. The outer Folder root has no aggregate Git branch, HEAD, status, history, or diff.

For stable ChatGPT schemas, Folder mode still advertises `verification_status` and `read_verification_output`, but calls return unavailable. Folder mode never discovers or runs Local Verification and never exposes child-repository verification evidence.

## Optional Local Verification

Local Verification is direct-Git-only and controlled from VS Code, not from ChatGPT.

The current approval schema binds a fixed rule to the canonical repository, executable, fixed argv, repository-relative package working directory, target mode, timeout, relevant package/config files, lockfiles, and repository-local runner content. Boundary changes require approval again.

ReviewLume performs bounded discovery of Node package roots such as `server/`, `client/`, and `packages/*` and supports package-local or repository-hoisted:

- Vitest;
- Jest;
- Mocha;
- Node test runner when explicitly referenced by package configuration;
- TypeScript `tsc --noEmit`;
- per-file `node --check` for changed JavaScript files.

Changed tests are passed as package-relative argv to the matching package runner; tests belonging to other package roots are excluded.

ReviewLume does not run arbitrary package scripts, `npx`, downloaded runners, AI responses, repository instructions, process output, or free-form command text. The launcher uses executable/argv with `shell: false`.

Local Verification is not a sandbox. Repository tests/tooling can modify files, start child processes, access the network, read local data, or contact services. Users must review approval details and run only repositories/tests they trust.

## Important privacy notice

ReviewLume does not collect telemetry and does not operate a project-data relay service. Project data is not sent merely because VS Code starts or the extension activates.

Data can leave the machine after the user starts a ReviewLume connection, enables the ReviewLume app/connector in ChatGPT, and ChatGPT calls a ReviewLume tool. Results travel through the official OpenAI Secure MCP Tunnel and are processed by OpenAI under the user's account/workspace controls, terms, and privacy settings.

The MCP boundary is not a universal secret classifier:

- P8 SecretScanner does not automatically filter ordinary MCP calls or Local Verification evidence.
- Git Project and explicitly selected nested Git queries can expose tracked sensitive-looking paths/content under documented read-only Git semantics.
- Folder direct-file tools apply a more conservative path/filename policy, but that policy is not content DLP.
- Diffs, file excerpts, commit subjects, search results, test paths, and verification output may contain credentials, personal data, customer data, or internal addresses.
- Verification-output redaction is best-effort and cannot guarantee detection of every secret format.

Users must remove, rotate, or redact real secrets before connecting a project and must not provide data they are not authorized to share with OpenAI.

## Security boundaries

ReviewLume:

- binds one active connection to one canonical outer Project Root;
- listens only on a random `127.0.0.1` port;
- generates a fresh local token per connection;
- stores the Runtime API Key only in VS Code SecretStorage;
- rejects absolute paths, parent traversal, direct `.git` reads, root escapes, directories, binary files, and oversized reads;
- does not follow Folder enumeration symlink/junction-like escapes;
- validates nested Git top-level and Git metadata containment;
- disables Git external diff and textconv;
- bounds files/results/requests/concurrency/rate;
- does not read browser cookies, sessions, passwords, browsing history, or ChatGPT responses;
- exposes no MCP shell, general process-start, write, delete, patch, or Git-mutation tool.

## Setup and policies

- Setup guide: https://github.com/cheng-corex/ReviewLume/blob/main/docs/chatgpt-secure-mcp-setup.md
- Stable tool contract: https://github.com/cheng-corex/ReviewLume/blob/main/docs/stable-mcp-tool-contract.md
- Folder Project support: https://github.com/cheng-corex/ReviewLume/blob/main/docs/folder-project-support.md
- Local Verification: https://github.com/cheng-corex/ReviewLume/blob/main/docs/local-verification-assistant.md
- Privacy policy: https://github.com/cheng-corex/ReviewLume/blob/main/PRIVACY.md
- Security policy: https://github.com/cheng-corex/ReviewLume/blob/main/SECURITY.md
- Source: https://github.com/cheng-corex/ReviewLume

## Upload checklist

- [ ] Publisher ID is exactly `ReviewLume`.
- [ ] Extension version and VSIX filename are `0.3.3`.
- [ ] Preview and Free metadata are present.
- [ ] Four-platform CI is green for the exact release head.
- [ ] VSIX content validation is green.
- [ ] Final VSIX SHA-256 is recorded.
- [ ] The exact final VSIX is installed on Windows.
- [ ] Direct Git nested-package Local Verification behavior is smoke-tested on the combined 0.3.3 artifact.
- [ ] ChatGPT sees the stable 11-tool contract; Folder evidence calls are unavailable and cannot start a process.
- [ ] Folder → Git switching with the same app keeps the same tool contract.
- [ ] Stopping the connection removes local MCP/tunnel access.
- [ ] Screenshots and test projects contain no private data.
- [ ] GitHub release/prerelease and Marketplace use the same byte-identical VSIX when both are published.
