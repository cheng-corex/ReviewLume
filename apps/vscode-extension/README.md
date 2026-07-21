# ReviewLume – Secure Read-only Repository MCP

ReviewLume connects one Git repository open in VS Code to ChatGPT through a
loopback-only, read-only MCP server and the official OpenAI Secure MCP Tunnel.

You can ask ChatGPT:

> Check the recent commits in this project, choose a reasonable code and test
> scope, and identify clear issues or optimization opportunities. Do not modify
> files.

ChatGPT can then inspect the repository with bounded read-only tools and answer in
the conversation. You do not need to prepare a Review Pack or preselect files for
the default workflow.

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
- An OpenAI account/workspace that can create and use a custom MCP connector.
- A Tunnel and least-privilege Runtime API key created in the OpenAI Platform.
- The official `openai/tunnel-client` executable downloaded separately by the
  user.

ReviewLume does not bundle, download, or silently update `tunnel-client`.

## First connection

1. Open the repository in VS Code and trust the workspace.
2. Click **ReviewLume MCP** in the VS Code status bar.
3. Choose **Configure Secure MCP Tunnel**.
4. Select the official `tunnel-client` executable.
5. Enter the Tunnel ID and least-privilege Runtime API key.
6. Choose the browser ReviewLume should use for ChatGPT.
7. Choose **Connect Current Repository to ChatGPT**.
8. In a ChatGPT conversation, enable the ReviewLume connector and ask a project
   question.

The Runtime API key is stored only in VS Code SecretStorage. The selected client
path, Tunnel ID, normalized control-plane proxy, and browser preference are stored
as machine-local extension state.

## Privacy and data flow

ReviewLume does not collect telemetry and does not operate a repository-data cloud
service.

Repository content is not sent merely because VS Code starts or ReviewLume
activates. Data can leave the machine after you explicitly start a connection,
enable ReviewLume in a ChatGPT conversation, and ChatGPT calls a ReviewLume tool.
Permitted tool results are sent through the official OpenAI Secure MCP Tunnel and
processed by OpenAI under your OpenAI account and workspace settings.

ReviewLume applies repository binding, path, symlink, `.git`, sensitive-path,
binary, size, request, rate, and SecretScanner controls before returning data.
These controls reduce risk but cannot guarantee detection of every secret or
personal value. Do not connect repositories you are not authorized to share with
OpenAI.

- Privacy policy: https://github.com/cheng-corex/ReviewLume/blob/main/PRIVACY.md
- Security policy: https://github.com/cheng-corex/ReviewLume/blob/main/SECURITY.md
- Security boundaries: https://github.com/cheng-corex/ReviewLume/blob/main/docs/security-and-compliance.md

## Known limitations

- Each active ReviewLume connection is bound to one Git repository.
- Each new ChatGPT conversation currently needs the ReviewLume connector enabled
  for that conversation.
- ChatGPT, OpenAI Secure MCP Tunnel, browser, proxy, and workspace availability are
  controlled by their respective providers and local environment.
- ReviewLume is read-only and does not apply fixes automatically.

## Advanced local review features

Review Packs, sensitive-content scanning, imported responses, review history,
issue state, implementation summaries, and re-review comparison remain available
as Advanced commands. They are stored locally and are not uploaded automatically.

## Independence disclaimer

ReviewLume is an independent open-source project and is not affiliated with or
endorsed by OpenAI, Microsoft, Anthropic, Google, or other service providers.
