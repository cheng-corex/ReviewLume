# ReviewLume – Secure Read-only Project MCP

> Preview release. ReviewLume is an independent open-source project and is not affiliated with or endorsed by OpenAI, Microsoft, Anthropic, Google, or other service providers.

ReviewLume connects one local project open in VS Code to ChatGPT through a loopback-only, read-only MCP server and the official OpenAI Secure MCP Tunnel.

A project can be either:

- **Git Project** — full existing Git-aware review tools and optional repository-bound Local Verification evidence.
- **Folder Project** — a normal Trusted Workspace Folder without Git, with bounded file listing, reading, search, and project analysis only.

ReviewLume does not provide MCP shell, terminal, arbitrary command execution, file write/delete, patch application, Git mutation, or AI-command execution.

## Project tools

### Folder Project

Folder Projects expose only:

- `project_summary`
- `list_files`
- `read_file`
- `search_code`

Folder Projects do **not** expose Git status, branch, commit history, diffs, staged/unstaged state, or Local Verification. If you ask what changed recently, ReviewLume must tell ChatGPT there is no reliable Git history rather than guessing from timestamps or file order.

### Git Project

Git Projects preserve the existing tool set:

- `repository_summary`
- `git_status`
- `recent_commits`
- `get_diff`
- `list_files`
- `read_file`
- `search_code`

When Local Verification is available, Git Projects can also expose completed evidence through:

- `verification_status`
- `read_verification_output`

Those evidence tools cannot start, retry, modify, or compose processes.

## Optional Local Verification

Local Verification remains Git-repository-bound and controlled from VS Code. It is not available for Folder Projects in this release.

For Git Projects, users approve fixed repository-local verification rules before they can run. ReviewLume does not execute arbitrary package scripts, `npx`, downloaded runners, AI replies, repository instructions, or commands found in process output. The launcher uses executable/argv with `shell: false` and bounded environment/output controls.

Tests are still executable untrusted repository code and may have side effects. Local Verification is not a sandbox.

Detailed boundary:
https://github.com/cheng-corex/ReviewLume/blob/main/docs/local-verification-assistant.md

## Requirements

- VS Code 1.100 or later.
- A Trusted Workspace Folder.
- Git only when Git-specific tools or Local Verification are needed.
- An OpenAI account/workspace whose ChatGPT web interface provides a custom MCP app/connector entry.
- An OpenAI Secure MCP Tunnel and least-privilege Runtime API Key.
- The official `openai/tunnel-client`, downloaded separately by the user.

ReviewLume cannot enable or bypass unavailable ChatGPT features or account/workspace permissions.

## First connection

1. Create a Tunnel in the OpenAI Platform.
2. Create a least-privilege Runtime API Key for that Tunnel.
3. Download the official `openai/tunnel-client` for your platform.
4. Open the project folder in VS Code and trust the workspace.
5. Click **ReviewLume MCP** in the status bar.
6. Choose **Configure Secure MCP Tunnel** and configure the official client, Tunnel ID, and Runtime API Key.
7. Choose **Connect Current Project to ChatGPT**.
8. If the workspace has multiple folders, select exactly one Workspace Folder for this connection.
9. ReviewLume automatically detects Git Project vs Folder Project.
10. In ChatGPT, refresh/scan the ReviewLume tools and confirm the capability set matches the project kind.

The connected state identifies the project kind, for example:

```text
my-repo · Git
```

or:

```text
temp-demo · Folder
```

Full setup and revocation guide:
https://github.com/cheng-corex/ReviewLume/blob/main/docs/chatgpt-secure-mcp-setup.md

## Folder Project security boundary

Folder Projects are intentionally more conservative than the existing Git MCP filename policy.

ReviewLume:

- canonicalizes the selected project root;
- rejects absolute paths, Windows drive paths, UNC paths, parent traversal, NUL, and `.git` metadata;
- never follows symlink/junction-like entries during enumeration;
- verifies resolved paths remain inside the selected root;
- rejects directories, binary files, and oversized reads;
- bounds directory depth, visited entries, file counts, search results, and response bytes;
- skips common VCS, dependency, build, cache, and credential-store directories;
- blocks obvious credential-like paths such as real `.env` files, common credentials/secrets files, and private-key/certificate containers;
- allows common environment templates such as `.env.example` and `.env.sample`.

This path policy is **not** a content DLP system and cannot guarantee that ordinary source files contain no secrets. Remove, rotate, or redact real credentials before connecting a project.

## Git Project privacy compatibility

Git Project behavior remains compatible with ReviewLume 0.3.0: its MCP tools do not automatically run the P8 SecretScanner or block a file solely because it is named `.env`, credentials, or secrets. Tracked sensitive files can still be eligible for Git Project listing/search, and an explicitly addressed ignored regular text file can be read when the caller knows its path.

This difference is intentional for compatibility and is documented in the privacy/security policies.

## Secure MCP Tunnel boundary

- Local MCP listens only on a random `127.0.0.1` port.
- Every run uses a fresh local token.
- Runtime API Key is stored only in VS Code SecretStorage.
- Credentials are not intentionally written to project files, settings JSON, argv, clipboard, or diagnostics logs.
- ReviewLume validates the official tunnel client, runs `doctor --explain`, then waits for both `/readyz` and `/api/status` health before reporting ready.
- Stopping the connection invalidates the local endpoint/token.
- One active connection binds one project root only.

## Multi-root Workspace

A VS Code workspace may contain several folders, but ReviewLume still requires selecting one Workspace Folder for each connection. It does not merge several roots into one MCP context and does not implement a Multi Project Registry in this release.

## Advanced review features

P8 Review Packs, sensitive-content scanning, imported responses, review history, issue state, implementation summaries, and re-review comparison remain available as Advanced Git-oriented workflows. Folder Project Support does not convert those workflows into non-Git review flows.

## Known limitations

- Folder Project has no reliable recent-change/history semantics.
- Folder Project has no Local Verification.
- Local Verification remains Git Project only and is not a sandbox.
- ChatGPT may cache an approved tool snapshot; after changing project kind or ReviewLume tool definitions, refresh/rescan/recreate the ChatGPT app if necessary.
- ReviewLume never applies fixes automatically.

- Privacy policy: https://github.com/cheng-corex/ReviewLume/blob/main/PRIVACY.md
- Security policy: https://github.com/cheng-corex/ReviewLume/blob/main/SECURITY.md
- Folder Project design: https://github.com/cheng-corex/ReviewLume/blob/main/docs/folder-project-support.md
