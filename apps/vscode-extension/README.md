# ReviewLume – Secure Repository MCP

ReviewLume connects one Git repository open in VS Code to ChatGPT through a loopback-only MCP server and the official OpenAI Secure MCP Tunnel.

The default mode is read-only. Users who explicitly enable `reviewlume.mcp.writeAccess=confirmEachRequest` can also let ChatGPT request bounded text-file creation or replacement. Every effective write batch requires an explicit modal confirmation in VS Code.

You can ask ChatGPT:

> Check the recent commits in this project, choose a reasonable code and test scope, and identify clear issues or optimization opportunities.

In confirmed-write mode you can continue with:

> Fix the issues you found and add the necessary tests.

ChatGPT can inspect the repository with bounded tools and answer in the conversation. You do not need to prepare a Review Pack or preselect files for the default workflow.

## Default read-only tools

- `repository_summary`
- `git_status`
- `recent_commits`
- `get_diff`
- `list_files`
- `read_file`
- `search_code`

## Optional confirmed-write tools

When `reviewlume.mcp.writeAccess` is set to `confirmEachRequest` and the MCP connection is restarted, ReviewLume additionally exposes:

- `read_file_for_edit`: returns one complete bounded text file and a SHA-256 concurrency token;
- `write_files`: creates or completely replaces up to 20 bounded text files after VS Code confirmation.

Existing files require the exact SHA-256 returned by `read_file_for_edit`. ReviewLume rechecks the file after confirmation and blocks target files with unsaved VS Code editor changes.

ReviewLume does **not** expose shell or terminal execution, deletion, rename, package installation, arbitrary filesystem access, Git add/commit/reset/clean/push, or automatic command execution.

## Requirements

- VS Code 1.100 or later.
- A Trusted Workspace containing a Git repository.
- An OpenAI account/workspace that can create and use a custom MCP connector.
- A Tunnel and least-privilege Runtime API key created in the OpenAI Platform.
- The official `openai/tunnel-client` executable downloaded separately by the user.

ReviewLume does not bundle, download, or silently update `tunnel-client`.

## First connection

1. Open the repository in VS Code and trust the workspace.
2. Click **ReviewLume MCP** in the VS Code status bar.
3. Choose **Configure Secure MCP Tunnel**.
4. Select the official `tunnel-client` executable.
5. Enter the Tunnel ID and least-privilege Runtime API key.
6. Choose the browser ReviewLume should use for ChatGPT.
7. Choose **Connect Current Repository to ChatGPT**.
8. In a ChatGPT conversation, enable the ReviewLume connector and ask a project question.

The Runtime API key is stored only in VS Code SecretStorage. The selected client path, Tunnel ID, normalized control-plane proxy, and browser preference are stored as machine-local extension state.

## Enabling confirmed writes

1. Open VS Code Settings for the repository window.
2. Find **ReviewLume › MCP: Write Access**.
3. Select **Confirm Each Request**.
4. Stop the current ReviewLume connection and reconnect.
5. Review every write request in the VS Code modal before choosing **Apply changes**.

Switch the setting back to **Disabled** and reconnect to remove the write tools.

## Privacy and data flow

ReviewLume does not collect telemetry and does not operate a repository-data cloud service.

Repository content is not sent merely because VS Code starts or ReviewLume activates. Data can leave the machine after you explicitly start a connection, enable ReviewLume in a ChatGPT conversation, and ChatGPT calls a ReviewLume tool. Permitted tool results are sent through the official OpenAI Secure MCP Tunnel and processed by OpenAI under your OpenAI account and workspace settings.

ReviewLume may return actual text from the bound repository, including configuration and security-related files. Do not connect repositories or approve requests containing content you are not authorized to share with OpenAI.

In confirmed-write mode, ChatGPT's proposed file content travels back through the tunnel to the local MCP. ReviewLume validates the request and asks for VS Code confirmation before writing. Approved changes remain local, ordinary working-tree changes and are not automatically staged, committed, or pushed.

- Privacy policy: https://github.com/cheng-corex/ReviewLume/blob/main/PRIVACY.md
- Security policy: https://github.com/cheng-corex/ReviewLume/blob/main/SECURITY.md
- Security boundaries: https://github.com/cheng-corex/ReviewLume/blob/main/docs/security-and-compliance.md

## Known limitations

- Each active ReviewLume connection is bound to one Git repository.
- Each new ChatGPT conversation currently needs the ReviewLume connector enabled for that conversation.
- ChatGPT, OpenAI Secure MCP Tunnel, browser, proxy, and workspace availability are controlled by their respective providers and local environment.
- Confirmed writes use complete bounded text-file replacements rather than arbitrary patch or command execution.
- ReviewLume does not run tests or build commands automatically.

## Advanced local review features

Review Packs, sensitive-content scanning, imported responses, review history, issue state, implementation summaries, and re-review comparison remain available as Advanced commands. They are stored locally and are not uploaded automatically.

## Independence disclaimer

ReviewLume is an independent open-source project and is not affiliated with or endorsed by OpenAI, Microsoft, Anthropic, Google, or other service providers.
