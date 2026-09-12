# Security Policy

## Supported Versions

| Version | Supported |
| --- | --- |
| 0.x | ✅ Active development |

## Reporting a Vulnerability

Do not open a public issue with vulnerability details, credentials, private project content, or raw verification output. Use GitHub private vulnerability reporting from the repository **Security** tab. If that is unavailable, contact the maintainer through GitHub and request a private reporting channel.

Include the affected version/commit, a minimal reproduction, expected impact, and a suggested mitigation when available. Never include a real Runtime API Key, local MCP token, Authorization header, customer source code, production secret, or private test output in the initial report.

## Project Security Model

One ReviewLume MCP connection binds exactly one canonical Project Root selected from a Trusted VS Code Workspace Folder. The selected root is detected as either:

- **Git Project** — the connected root is one Git repository.
- **Folder Project** — the connected root is a normal Workspace Folder that may contain zero or more independent child Git repositories.

Folder Project support remains part of the P8 read-only review loop. It does not start the optional browser bridge and it does not create synthetic Git history for the outer Folder root.

## Stable MCP Tool Contract

Git Project and Folder Project advertise the same 11 read-only MCP tool names and public input schemas:

```text
project_summary
list_git_repositories
repository_summary
git_status
recent_commits
get_diff
list_files
read_file
search_code
verification_status
read_verification_output
```

Project kind changes runtime semantics, not the public tool list.

### Git Project

Git queries target the connected repository directly and the optional `repository` selector must be omitted. `list_git_repositories` reports that the connected root is already the Git Project.

`verification_status` and `read_verification_output` may read completed repository-bound Local Verification evidence. They cannot start, retry, alter, or compose a process.

### Folder Project

`list_git_repositories` performs bounded discovery of real child Git repositories under the authorized Folder root. `repository_summary`, `git_status`, `recent_commits`, and `get_diff` require one exact Folder-relative repository path returned by that discovery.

For schema stability, Folder mode still advertises `verification_status` and `read_verification_output`, but calls return an explicit unavailable result. Folder mode does not discover, approve, or run Local Verification and does not expose child-repository verification evidence.

## Shared Read-only Boundary

All project kinds enforce:

- Trusted Workspace before connection;
- one active MCP connection bound to one canonical outer Project Root;
- loopback-only MCP on a random `127.0.0.1` port with a fresh local token;
- canonical path checks and root containment;
- rejection of absolute paths, Windows drive paths, UNC paths, parent traversal, NUL, and direct `.git` file reads;
- rejection of external symlink/junction escapes, directories, binary files, and oversized reads;
- bounded request/result sizes, file counts, line counts, concurrency, and call rates;
- no MCP shell, terminal, arbitrary command, file write/delete/rename, patch apply, Git mutation, package script, or general process-start capability;
- project files and AI responses treated as untrusted input that cannot expand capabilities.

The OpenAI Runtime API Key is stored only in VS Code SecretStorage and is not intentionally written to project files, settings JSON, argv, clipboard, or diagnostic logs.

## Git Project Boundary

Git subprocesses use the read-only allowlist, argument arrays, `shell: false`, disabled external diff, and disabled textconv. Commit references are validated before diff use, and credential-bearing remote URLs are sanitized before return.

Git Project MCP preserves its documented compatibility behavior: it is not a filename-based secret filter. Tracked sensitive-looking paths may remain eligible under the read-only Git contract, and P8 SecretScanner does not automatically filter ordinary MCP calls.

## Folder Project Boundary

Folder-wide direct-file tools use a stricter filesystem policy than the direct Git compatibility path. They:

- enumerate with bounded depth, visited-entry, file-count, search-result, and response limits;
- do not follow directory symlinks/junction-like entries;
- verify resolved paths remain inside the canonical Folder root;
- skip common VCS, dependency, build, cache, and credential-store trees;
- block obvious credential-like direct-file names while allowing common templates such as `.env.example`.

This filename/path policy reduces accidental exposure but is not content DLP.

Nested Git discovery additionally requires a real `.git` marker, verifies both Git top-level and absolute Git metadata directory remain inside the Folder root, and permits queries only for exact discovered repositories. Nested queries reuse the existing read-only Git allowlist and diff/ref safeguards. They never perform checkout, add, commit, reset, clean, merge, rebase, fetch, push, or arbitrary execution.

## Local Verification Execution Boundary

Local Verification remains **direct Git Project only** and is controlled from VS Code, not from MCP.

Current approvals use schema version 2 and bind the execution boundary to the canonical repository, executable, fixed argv, package working directory, target mode, timeout, relevant package/configuration files, lockfiles, and repository-local runner content. Older approvals that do not bind the package working directory are invalidated.

Supported Node ecosystem discovery is bounded across package roots such as `server/`, `client/`, and `packages/*`. ReviewLume can use package-local or repository-hoisted Vitest, Jest, Mocha, Node test, and TypeScript runners. Changed test targets are converted to package-relative argv and tests from other package roots are excluded.

Execution uses executable/argv with `shell: false`. ReviewLume does not execute arbitrary package scripts, `npx`, downloaded runners, AI responses, repository instructions, test output, or free-form commands. Tests remain executable untrusted repository code and can have side effects; Local Verification is not a sandbox.

## In-scope Examples

Security issues include, among others:

- filesystem or Git escape outside the selected Project Root;
- symlink/junction/reparse-point boundary bypasses;
- nested Git identity or selector confusion;
- unauthorized write, shell, process-start, patch, or Git-mutation capability;
- Folder mode actually running Local Verification or returning child verification evidence;
- direct Git Local Verification approval/fingerprint/cwd/runner boundary bypasses;
- unsafe process launch, cancellation, timeout, stale-result, output-bound, or redaction behavior;
- local MCP authentication/lifecycle failures or residual access after stop;
- Runtime API Key, local token, Authorization header, project data, or raw verification output entering ReviewLume diagnostics.

Third-party vulnerabilities, social engineering, physical access attacks, and side effects intentionally performed by approved repository tests are out of scope unless ReviewLume introduces or amplifies the issue.

## Privacy and Data Flow

ReviewLume does not collect telemetry and does not operate a project-data relay service. Project data leaves the machine only after the user connects a project, enables the ReviewLume app/connector in ChatGPT, and a ReviewLume tool returns data through the official OpenAI Secure MCP Tunnel.

ReviewLume does not read browser cookies, sessions, passwords, browsing history, or ChatGPT responses. P8 Review Packs, history, issue state, and re-review data remain local unless the user deliberately exports or sends them.

See [PRIVACY.md](PRIVACY.md), [docs/security-and-compliance.md](docs/security-and-compliance.md), [docs/folder-project-support.md](docs/folder-project-support.md), [docs/stable-mcp-tool-contract.md](docs/stable-mcp-tool-contract.md), and [docs/local-verification-assistant.md](docs/local-verification-assistant.md).
