# ReviewLume – Secure Read-only Project MCP

> Preview release. ReviewLume is an independent open-source project and is not affiliated with or endorsed by OpenAI, Microsoft, Anthropic, Google, or other service providers.

ReviewLume connects one local project open in VS Code to ChatGPT through a loopback-only, read-only MCP server and the official OpenAI Secure MCP Tunnel.

A connection binds exactly one canonical Project Root:

- **Git Project** — Git-aware read tools plus optional user-approved Local Verification evidence.
- **Folder Project** — bounded file inspection across one Trusted Workspace Folder plus explicitly scoped read-only Git queries for real child repositories inside that root.

ReviewLume does not provide MCP shell, terminal, arbitrary command execution, file write/delete, patch application, Git mutation, or AI-command execution.

## Stable 11-tool contract

Git Project and Folder Project advertise the same tool names and public input schemas:

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

Project kind changes runtime semantics, not the public tool list.

### Direct Git Project

Git query tools target the connected repository directly. The optional `repository` selector must be omitted, and `list_git_repositories` reports that no nested selection is required.

`verification_status` and `read_verification_output` can read completed repository-bound Local Verification evidence when configured. They cannot start, retry, alter, or compose processes.

### Folder Project

Folder file tools operate across the authorized root under bounded path/file/result controls. `list_git_repositories` can discover real child Git repositories inside that root.

`repository_summary`, `git_status`, `recent_commits`, and `get_diff` require one exact Folder-relative repository path returned by discovery. The outer Folder root has no aggregate Git branch, HEAD, status, history, or diff, and separate child repositories are never combined into synthetic Git state.

For stable ChatGPT schemas, Folder mode still advertises `verification_status` and `read_verification_output`, but calls return unavailable. Folder mode does not discover, approve, or run Local Verification and does not expose child-repository verification evidence.

## Optional Local Verification

Local Verification is direct-Git-only and controlled from VS Code.

The current schema-2 approval model binds each fixed rule to the canonical repository, executable, fixed argv, repository-relative package working directory, target mode, timeout, relevant package/config files, lockfiles, and repository-local runner content.

ReviewLume performs bounded discovery of nested Node package roots such as `server/`, `client/`, and `packages/*`. It can resolve supported package-local or repository-hoisted Vitest, Jest, Mocha, Node test, and TypeScript runners. Changed tests are filtered to the approved package and passed as package-relative argv; tests from other package roots are excluded.

JavaScript syntax checks use fixed per-file `node --check`. Syntax-only approval text states that file contents are parsed without being executed; test/typecheck approval text warns that repository code/tooling may execute and have side effects.

ReviewLume does not run arbitrary package scripts, `npx`, downloaded runners, AI replies, repository instructions, process output, or free-form command text. Local process launch uses executable/argv with `shell: false`.

Tests are executable untrusted repository code and may modify files, start child processes, access networks or local services. Local Verification is not a sandbox.

Detailed boundary:
https://github.com/cheng-corex/ReviewLume/blob/main/docs/local-verification-assistant.md

## Requirements

- VS Code 1.100 or later.
- A Trusted Workspace Folder.
- Git only when Git-specific inspection or Local Verification is needed.
- An OpenAI account/workspace whose ChatGPT interface provides the custom MCP app/connector entry.
- An OpenAI Secure MCP Tunnel and least-privilege Runtime API Key.
- The official `openai/tunnel-client`, downloaded separately by the user.

ReviewLume cannot enable or bypass unavailable ChatGPT features or account/workspace permissions.

## First connection

1. Create a Tunnel in the OpenAI Platform.
2. Create a least-privilege Runtime API Key for that Tunnel.
3. Download the official `openai/tunnel-client`.
4. Open and trust the Workspace Folder in VS Code.
5. Click **ReviewLume MCP** in the status bar.
6. Choose **Configure Secure MCP Tunnel** and configure the client, Tunnel ID, and Runtime API Key.
7. Choose **Connect Current Project to ChatGPT**.
8. If the workspace has multiple folders, select exactly one Workspace Folder.
9. ReviewLume detects Git Project vs Folder Project.
10. In ChatGPT, scan/approve the ReviewLume app contract. Normal Git ↔ Folder switching keeps the same 11 tools; rescan only when a future release actually changes the public contract.

Connected state identifies the outer project kind, for example:

```text
my-repo · Git
```

or:

```text
fbs · Folder
```

Full setup guide:
https://github.com/cheng-corex/ReviewLume/blob/main/docs/chatgpt-secure-mcp-setup.md

## Folder Project security boundary

Folder direct-file access is intentionally more conservative than direct Git compatibility behavior. ReviewLume:

- canonicalizes the selected root;
- rejects absolute/drive/UNC paths, parent traversal, NUL, and direct `.git` reads;
- does not follow symlink/junction-like entries during enumeration;
- verifies resolved paths remain inside the selected root;
- rejects directories, binary files, and oversized reads;
- bounds depth, visited entries, file counts, search results, request/result sizes, concurrency, and rate;
- skips common VCS, dependency, build, cache, and credential-store directories;
- blocks obvious credential-like direct-file paths while allowing common templates such as `.env.example`.

Nested Git discovery additionally requires a local `.git` marker and verifies both Git top-level and absolute Git metadata remain inside the authorized root. Child Git queries reuse the existing read-only Git allowlist and disabled external diff/textconv safeguards.

This policy is not content DLP. Nested Git status/history/diff follows documented Git read semantics and may expose sensitive-looking tracked paths/content. Remove or redact real secrets before connecting a project.

## Privacy compatibility

Git Project MCP does not automatically run the P8 SecretScanner or block a file solely because its name looks sensitive. P8 Advanced Review Pack scanning/export gates remain separate from ordinary MCP and Local Verification evidence.

Project data can leave the machine after the user connects ReviewLume, enables its ChatGPT app/connector, and a tool result is returned through the official OpenAI Secure MCP Tunnel. ReviewLume does not collect telemetry or operate a project-data relay service.

## Secure MCP Tunnel boundary

- Local MCP listens only on a random `127.0.0.1` port.
- Each run uses a fresh local token.
- Runtime API Key is stored only in VS Code SecretStorage.
- ReviewLume validates the official tunnel client and waits for local/control-plane health before reporting connected.
- Stopping the connection invalidates the local endpoint/token.
- One active connection binds one outer Project Root only.

## Advanced review features

P8 Review Packs, sensitive-content scanning, imported responses, review history, issue state, implementation summaries, and re-review comparison remain available as Advanced Git-oriented workflows. Folder Project support does not start the optional browser bridge.

## Known limitations

- Folder root has no aggregate Git recent-change/history semantics.
- Nested Git queries inspect one discovered child repository at a time.
- Folder mode has no Local Verification execution/evidence access; stable evidence tool names return unavailable.
- Local Verification remains direct Git Project only and is not a sandbox.
- ChatGPT may cache an approved tool snapshot after a release changes the public contract; normal Git ↔ Folder switching does not change the current 11-tool contract.
- ReviewLume never applies fixes automatically.

- Privacy policy: https://github.com/cheng-corex/ReviewLume/blob/main/PRIVACY.md
- Security policy: https://github.com/cheng-corex/ReviewLume/blob/main/SECURITY.md
- Folder Project design: https://github.com/cheng-corex/ReviewLume/blob/main/docs/folder-project-support.md
- Stable tool contract: https://github.com/cheng-corex/ReviewLume/blob/main/docs/stable-mcp-tool-contract.md
