# ReviewLume – Secure Read-only Repository MCP

> Preview release. ReviewLume is an independent open-source project and is not
> affiliated with or endorsed by OpenAI, Microsoft, Anthropic, Google, or other
> service providers.

ReviewLume connects one Git repository open in VS Code to ChatGPT through a
loopback-only, read-only MCP server and the official OpenAI Secure MCP Tunnel.

You can ask ChatGPT:

> Check the recent commits in this project, choose a reasonable code and test
> scope, and identify clear issues or optimization opportunities. Do not modify
> files.

ChatGPT can inspect the repository with bounded read-only tools and answer in the
conversation. You do not need to prepare a Review Pack or preselect files for the
default workflow.

## Read-only tools

ReviewLume exposes only:

- `repository_summary`
- `git_status`
- `recent_commits`
- `get_diff`
- `list_files`
- `read_file`
- `search_code`

It does **not** expose a shell, terminal, file writes, deletion, patch application,
or Git mutation commands.

## Requirements

- VS Code 1.100 or later.
- A Trusted Workspace containing a Git repository.
- An OpenAI account or workspace whose ChatGPT web interface actually provides a
  custom MCP app/connector entry.
- A Tunnel and least-privilege Runtime API Key created in the OpenAI Platform.
- The official `openai/tunnel-client` executable downloaded separately by the
  user.

ChatGPT plan, workspace, developer-mode, app-management, and staged-availability
rules are controlled by OpenAI and may change. ReviewLume cannot enable or bypass
an unavailable ChatGPT feature.

ReviewLume does not bundle, download, or silently update `tunnel-client`.

## First connection

1. Create a Tunnel in the OpenAI Platform.
2. Create a least-privilege Runtime API Key for that Tunnel. Do not use an Admin
   Key or a broad project key.
3. Download the official `openai/tunnel-client` release for your platform.
4. Open the repository in VS Code and trust the workspace.
5. Click **ReviewLume MCP** in the VS Code status bar.
6. Choose **Configure Secure MCP Tunnel**.
7. Select the official `tunnel-client` executable and enter the Tunnel ID and
   Runtime API Key.
8. Choose **Connect Current Repository to ChatGPT**.
9. In ChatGPT, create or enable a custom MCP app/connector using the same Tunnel
   ID, scan the tools, and confirm that only the seven read-only tools above are
   present.
10. Enable ReviewLume in the current conversation and ask a project question.

Full setup and revocation guide:
https://github.com/cheng-corex/ReviewLume/blob/main/docs/chatgpt-secure-mcp-setup.md

The Runtime API Key is stored only in VS Code SecretStorage. The selected client
path, Tunnel ID, normalized control-plane proxy, and browser preference are stored
as machine-local extension state.

## Important privacy boundary

ReviewLume does not collect telemetry and does not operate a repository-data cloud
service. Repository content is not sent merely because VS Code starts or
ReviewLume activates.

Data can leave the machine only after you explicitly start a connection, enable
ReviewLume in a ChatGPT conversation, and ChatGPT calls a ReviewLume tool. Tool
results are sent through the official OpenAI Secure MCP Tunnel and processed by
OpenAI under your OpenAI account, workspace controls, terms, and privacy settings.

The P9 MCP tools enforce repository and resource boundaries, but they are **not a
secret-classification system**:

- P9 does not automatically run ReviewLume's SecretScanner.
- `.env`, credentials, secrets, certificates, private-key text, production
  configuration, and tracked sensitive files are not blocked solely because of
  their names or contents.
- `list_files` and `search_code` can enumerate tracked files and non-ignored
  untracked files.
- `read_file` can read an explicitly addressed regular text file inside the bound
  repository, including an ignored file when the caller knows or guesses its
  path.
- Diffs, file excerpts, commit subjects, and search results may contain API keys,
  tokens, passwords, connection strings, personal data, customer data, or
  internal addresses.
- `.gitignore` is not a complete confidentiality boundary.

ReviewLume still rejects absolute paths, parent traversal, `.git`, repository-outside
symbolic-link escapes, directories, binary files, and oversized files. Results,
requests, concurrency, and call rates are bounded. No shell, write, delete, patch,
or Git-mutation tool is exposed.

Before connecting a repository, remove, rotate, or redact real secrets; avoid real
production databases and customer data; and confirm that you are authorized to
provide the selected content to OpenAI. Use a sanitized copy or dedicated test
branch when necessary.

The P8 Advanced Review Pack workflow has a separate SecretScanner and export gate.
Those controls do not automatically filter P9 MCP tool calls.

- Privacy policy: https://github.com/cheng-corex/ReviewLume/blob/main/PRIVACY.md
- Security policy: https://github.com/cheng-corex/ReviewLume/blob/main/SECURITY.md
- Security boundaries: https://github.com/cheng-corex/ReviewLume/blob/main/docs/security-and-compliance.md

## Known limitations

- Each active ReviewLume connection is bound to one Git repository.
- Each new ChatGPT conversation currently needs the ReviewLume app/connector
  enabled for that conversation.
- ChatGPT may cache an approved tool snapshot. After ReviewLume tool definitions
  change, refresh, rescan, or recreate the ChatGPT app/connector.
- ChatGPT, OpenAI Secure MCP Tunnel, browser, proxy, and workspace availability are
  controlled by their respective providers and local environment.
- ReviewLume is read-only and does not apply fixes automatically.

## Advanced local review features

Review Packs, sensitive-content scanning, imported responses, review history,
issue state, implementation summaries, and re-review comparison remain available
as Advanced commands. They are stored locally and are not uploaded automatically.
