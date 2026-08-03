# ReviewLume – Secure Repository MCP & Local Verification

> Preview release. ReviewLume is an independent open-source project and is not
> affiliated with or endorsed by OpenAI, Microsoft, Anthropic, Google, or other
> service providers.

ReviewLume connects one Git repository open in VS Code to ChatGPT through a
loopback-only, read-only MCP server and the official OpenAI Secure MCP Tunnel.
It can also run optional repository-local verification rules after you approve
them in VS Code, then let ChatGPT read the completed evidence.

You can ask ChatGPT:

> Check the recent commits and current changes, inspect the latest local
> verification evidence, and identify clear issues. Do not modify files.

ChatGPT can inspect the repository with bounded read-only tools. It cannot start a
process, change a verification command, write files, or apply fixes.

## MCP tools

ReviewLume exposes seven repository-reading tools:

- `repository_summary`
- `git_status`
- `recent_commits`
- `get_diff`
- `list_files`
- `read_file`
- `search_code`

When the local verification assistant is available, it also exposes two read-only
evidence tools:

- `verification_status`
- `read_verification_output`

The evidence tools can read only a previously completed local run. They explicitly
report `mcpCanStartProcesses: false`.

ReviewLume does **not** expose an MCP shell, terminal, arbitrary command runner,
file write, deletion, patch application, Git mutation, or process-start tool.

## Optional local verification

Local verification is controlled by VS Code, not by ChatGPT.

The first time you configure it for a repository, ReviewLume shows the exact
executable, fixed argument prefix, target mode, timeout, and risk warning. After
you approve a rule once, newly added or modified matching test files are
automatically included in later runs.

The first release discovers only fixed repository-local Node ecosystem entry
points:

- Vitest
- Jest
- Mocha
- Node's built-in test runner when the repository configuration references it
- TypeScript `tsc --noEmit`
- `node --check`, run separately for every changed JavaScript file

ReviewLume does not execute arbitrary `package.json` scripts, use `npx`, download a
runner, or execute commands found in repository files, AI responses, or test
output.

Commands:

- **ReviewLume: Configure Local Verification**
- **ReviewLume: Run Approved Local Verification**
- **ReviewLume: Clear Local Verification Approval**

By default, an existing valid approval runs before ReviewLume opens the ChatGPT
connection. You can disable that behavior with
`reviewlume.verification.runOnConnect`.

Tests are executable repository code. They may modify files, start child
processes, access the network, read environment data, or contact local services.
ReviewLume uses a no-shell launcher, reduced environment, timeout, cancellation,
process-tree termination, bounded output, best-effort secret redaction, and
before/after repository fingerprints, but it is not a sandbox.

Detailed boundary:
https://github.com/cheng-corex/ReviewLume/blob/main/docs/local-verification-assistant.md

## Requirements

- VS Code 1.100 or later.
- A Trusted Workspace containing a Git repository.
- An OpenAI account or workspace whose ChatGPT web interface actually provides a
  custom MCP app/connector entry.
- A Tunnel and least-privilege Runtime API Key created in the OpenAI Platform.
- The official `openai/tunnel-client` executable downloaded separately by the
  user.
- A repository-local supported test runner for optional local verification.

ChatGPT plan, workspace, developer-mode, app-management, and staged-availability
rules are controlled by OpenAI and may change. ReviewLume cannot enable or bypass
an unavailable ChatGPT feature.

ReviewLume does not bundle, download, or silently update `tunnel-client` or test
runners.

## First connection

1. Create a Tunnel in the OpenAI Platform.
2. Create a least-privilege Runtime API Key for that Tunnel. Do not use an Admin
   Key or a broad project key.
3. Download the official `openai/tunnel-client` release for your platform.
4. Open the repository in VS Code and trust the workspace.
5. Optionally run **ReviewLume: Configure Local Verification**, inspect the exact
   rules, and approve the rules you want.
6. Click **ReviewLume MCP** in the VS Code status bar.
7. Choose **Configure Secure MCP Tunnel**.
8. Select the official `tunnel-client` executable and enter the Tunnel ID and
   Runtime API Key.
9. Choose **Connect Current Repository to ChatGPT**.
10. In ChatGPT, create or enable a custom MCP app/connector using the same Tunnel
    ID, scan the tools, and confirm that the repository and verification evidence
    tools are read-only.
11. Enable ReviewLume in the current conversation and ask a project question.

Full setup and revocation guide:
https://github.com/cheng-corex/ReviewLume/blob/main/docs/chatgpt-secure-mcp-setup.md

The Runtime API Key is stored only in VS Code SecretStorage. The selected client
path, Tunnel ID, normalized control-plane proxy, and browser preference are stored
as machine-local extension state.

Local verification approvals are stored in VS Code global state. The latest
sanitized bounded result is stored in VS Code global storage. ReviewLume does not
intentionally write verification rules or output into the selected repository.

## Important privacy boundary

ReviewLume does not collect telemetry and does not operate a repository-data cloud
service. Repository content and verification output are not sent merely because
VS Code starts, ReviewLume activates, or a local verification command runs.

Data can leave the machine only after you explicitly start a connection, enable
ReviewLume in a ChatGPT conversation, and ChatGPT calls a ReviewLume tool. Tool
results are sent through the official OpenAI Secure MCP Tunnel and processed by
OpenAI under your OpenAI account, workspace controls, terms, and privacy settings.

The MCP tools enforce repository and resource boundaries, but they are **not a
secret-classification system**:

- MCP does not automatically run ReviewLume's SecretScanner.
- `.env`, credentials, secrets, certificates, private-key text, production
  configuration, and tracked sensitive files are not blocked solely because of
  their names or contents.
- `list_files` and `search_code` can enumerate tracked files and non-ignored
  untracked files.
- `read_file` can read an explicitly addressed regular text file inside the bound
  repository, including an ignored file when the caller knows or guesses its
  path.
- Diffs, file excerpts, commit subjects, search results, test target paths, and
  verification output may contain API keys, tokens, passwords, connection
  strings, personal data, customer data, or internal addresses.
- `.gitignore` is not a complete confidentiality boundary.
- Verification output redaction is best-effort and cannot guarantee that every
  sensitive value is removed.

ReviewLume rejects absolute paths, parent traversal, `.git`, repository-outside
symbolic-link escapes, directories, binary files, and oversized file reads.
Results, requests, concurrency, and call rates are bounded. No MCP write, shell,
process-start, delete, patch, or Git-mutation tool is exposed.

Before connecting a repository or approving local verification, remove, rotate,
or redact real secrets; avoid production databases and customer data; inspect the
exact verification rule; and confirm that you are authorized to provide the
selected content and evidence to OpenAI. Use a sanitized copy, dedicated test
branch, or isolated test environment when necessary.

The P8 Advanced Review Pack workflow has a separate SecretScanner and export gate.
Those controls do not automatically filter MCP tool calls or local verification
output.

- Privacy policy: https://github.com/cheng-corex/ReviewLume/blob/main/PRIVACY.md
- Security policy: https://github.com/cheng-corex/ReviewLume/blob/main/SECURITY.md
- Security boundaries: https://github.com/cheng-corex/ReviewLume/blob/main/docs/security-and-compliance.md

## Known limitations

- Each active ReviewLume connection is bound to one Git repository.
- Each local verification approval is bound to one Git repository.
- The initial verifier supports only selected repository-local Node ecosystem
  runners; Python, Maven, Gradle, .NET, Go, containers, and custom integration
  environments are not yet supported.
- Local verification is not a sandbox and cannot guarantee that test code has no
  side effects.
- Each new ChatGPT conversation currently needs the ReviewLume app/connector
  enabled for that conversation.
- ChatGPT may cache an approved tool snapshot. After ReviewLume tool definitions
  change, refresh, rescan, or recreate the ChatGPT app/connector.
- ChatGPT, OpenAI Secure MCP Tunnel, browser, proxy, runner, and workspace
  availability are controlled by their respective providers and local
  environment.
- ReviewLume does not apply fixes automatically.

## Advanced local review features

Review Packs, sensitive-content scanning, imported responses, review history,
issue state, implementation summaries, and re-review comparison remain available
as Advanced commands. They are stored locally and are not uploaded automatically.
