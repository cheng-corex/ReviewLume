# Folder Project Support

## Purpose

ReviewLume treats Git as an enhancement rather than a prerequisite for the read-only MCP connector. One Trusted VS Code Workspace Folder can be bound as one of two project kinds:

- **Git Project** — a Git repository was discovered from the selected Workspace Folder.
- **Folder Project** — the selected Workspace Folder itself is the authorized root when no Git repository is discovered at that root.

One MCP connection still binds exactly one canonical project root. Multi-root VS Code workspaces require selecting one Workspace Folder; ReviewLume does not combine unrelated Workspace roots into one review context.

Folder Project Support is part of the current P8 read-only review work. It does not start the optional browser bridge and does not change phase numbering.

## Project detection

At connection time ReviewLume:

1. requires VS Code Workspace Trust;
2. canonicalizes the selected Workspace Folder with `realpath`;
3. attempts the existing read-only `git rev-parse --show-toplevel` discovery;
4. uses the canonical Git root as a **Git Project** when discovery succeeds;
5. otherwise uses the canonical selected Workspace Folder itself as a **Folder Project**.

A missing `.git` directory is therefore no longer a connection failure. Git discovery failure degrades to Folder mode instead of fabricating repository metadata.

## Stable MCP tool contract

ChatGPT can retain an approved snapshot of MCP tool names and input schemas. Because one ReviewLume Tunnel can later be rebound from a Git Project to a Folder Project, changing `tools/list` by project kind would leave that snapshot stale even though the tunnel reached the current local server.

ReviewLume therefore advertises one stable read-only superset for **both** project kinds:

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

The names and public input schemas above remain identical when the user switches between Git and Folder Projects. Project-specific capability is enforced at call time instead of by changing the advertised tool list.

For the four Git query tools, `repository` is an optional field in the stable public schema:

- **Folder Project** — `repository` is required at runtime and must exactly match a path returned by `list_git_repositories`.
- **Git Project** — `repository` must be omitted because the connected root is already the selected Git repository.

`project_summary` is available in both modes and reports `projectKind` plus the relevant capability boundary.

`list_git_repositories` behaves as follows:

- **Folder Project** — discovers bounded nested Git repositories inside the authorized Folder root.
- **Git Project** — returns that no nested selection is required; Git tools target the connected repository directly.

The two Local Verification evidence tool names are also stable. In Folder mode they return an explicit unavailable result and never start a process. This preserves a stable ChatGPT schema without extending Folder execution authority.

## Folder Project MCP capabilities

A Folder Project supports project-wide file operations through:

- `list_files`
- `read_file`
- `search_code`

It also supports read-only Git inspection for **real nested repositories inside the authorized Folder root** through:

- `list_git_repositories`
- `repository_summary`
- `git_status`
- `recent_commits`
- `get_diff`

Example:

```text
Folder Project: fbs
├── fbs-iot-ui/   (.git)
├── fbs-lowcode/  (.git)
└── fbs-ui/       (.git)
```

A model may first call `list_git_repositories`, then ask for `git_status` with `repository: "fbs-ui"`. It may not treat `fbs` itself as a synthetic Git repository, and it may not merge the three child repositories into one synthetic status, branch, history, or diff.

`project_summary` therefore reports that the **Folder root has no aggregate Git history**, while advertising that explicitly selected nested Git repositories can be inspected.

Folder Projects do not gain Local Verification execution or evidence access. Calls to `verification_status` and `read_verification_output` return unavailable in Folder mode.

## Nested Git discovery boundary

Nested Git discovery is bounded and conservative:

- at most 64 nested repositories are returned;
- at most 20,000 filesystem entries are visited;
- traversal depth is bounded to 32;
- common dependency/build/cache/credential-store directories are skipped;
- symbolic links and junction-like directory entries are not followed;
- a candidate must contain a real `.git` file or directory marker;
- ReviewLume verifies the candidate using the existing read-only Git runner;
- both `git rev-parse --show-toplevel` and `git rev-parse --absolute-git-dir` must resolve inside the canonical Folder Project root;
- the resolved Git top-level must equal the discovered candidate directory;
- Git metadata that resolves outside the authorized Folder root is rejected.

An explicit nested Git query is accepted only when its relative path resolves to one of the repositories allowed by that discovery boundary. Absolute paths, UNC paths, Windows drive paths, `..`, `.git` path components, the Folder root itself, and ordinary non-repository directories are rejected.

The nested Git tools reuse the existing Git Project read-only implementation. That preserves the existing Git command allowlist, argument-array execution, disabled external diff/textconv behavior, ref validation, bounded diff output, and remote URL sanitization. No Git mutation command is added.

## Local Verification boundary

Folder Project support does not generalize Local Verification.

For a Folder Project, MCP connection startup:

- does not run verification discovery;
- does not run an approved verification rule;
- does not automatically run verification for any discovered nested repository;
- advertises the two evidence tool names only to keep the MCP schema stable, and rejects their calls as unavailable without starting a process.

If a nested repository is opened directly as a Git Project, its existing repository-bound Local Verification behavior applies normally. Allowing Folder mode to execute verification across child repositories would require a separate design and approval.

## Folder file-access boundary

Folder Project file reading/search remains independent from nested Git discovery. `list_files`, `read_file`, and `search_code` operate across the authorized Folder root using bounded filesystem enumeration rather than Git.

The Folder file enumerator:

- enumerates at most 5,000 files;
- visits at most 20,000 filesystem entries;
- has bounded traversal depth;
- skips `.git`, `.hg`, `.svn`, dependency caches, common generated/build trees, and credential-store directories;
- never follows symbolic-link or junction-like entries during enumeration;
- canonicalizes every enumerated directory/file and requires it to remain inside the canonical Folder root.

The shared reader rejects:

- absolute paths, including Windows drive paths and UNC paths;
- `..` parent traversal;
- `.git` paths;
- real paths that escape the root;
- directories;
- binary files;
- files above the existing read-size limit;
- oversized tool results.

Folder Projects additionally block obvious credential-like paths, including `.env` secrets while allowing templates such as `.env.example`, common credential filenames, private-key names, certificate/key containers, and credential-store directories.

This filename/path policy is **not** content DLP. Ordinary source/configuration files can still contain secrets.

Git Project filename semantics remain unchanged for compatibility. The stricter Folder file policy does not retroactively change Git Project behavior.

## Read-only guarantees

Folder Project support, including nested Git inspection, adds no MCP capability for:

- shell or terminal execution;
- arbitrary commands or package scripts;
- general process start;
- file create/write/delete/rename;
- patch application;
- Git add/commit/checkout/reset/clean/merge/rebase/fetch/push;
- starting Local Verification;
- executing instructions found in project files or AI responses.

The only processes added to Folder mode are the same allowlisted **read-only Git commands** used by existing Git Projects, and only after a nested repository has passed the Folder-root containment checks above.

Project files remain untrusted input. Text found in the project cannot enlarge the root, select an outside repository, enable Local Verification, or authorize a write operation.

## UI behavior

The primary action remains **Connect Current Project to ChatGPT**. Users do not choose Git vs Folder manually.

Connected status shows the detected outer project kind, for example:

- `ReviewLume: ai-ui · Git`
- `ReviewLume: fbs · Folder`

A Folder Project remains displayed as `Folder` even when it contains nested Git repositories because the MCP connection is still authorized and bounded by the Folder root.

Because the public MCP tool contract is stable, switching between Git and Folder Projects through the same ReviewLume Tunnel does not require deleting/recreating the ChatGPT app merely because the project kind changed. A rescan is still required after a future ReviewLume release if the stable contract itself changes.

## Required acceptance checks

Automated and Windows acceptance should verify at least:

1. a trusted ordinary folder can connect without a root `.git`;
2. Git and Folder connections advertise the same 11 tool names and schemas;
3. Folder `list_files`, `read_file`, and `search_code` work across multiple child projects;
4. `list_git_repositories` finds real child repositories inside the authorized Folder root;
5. `repository_summary`, `git_status`, `recent_commits`, and `get_diff` work only when an explicit discovered child repository is supplied in Folder mode;
6. direct Git mode rejects a non-empty Folder-style `repository` selector and works when it is omitted;
7. the Folder root is never presented as a synthetic Git repository;
8. status/history/diff from separate child repositories are not combined;
9. traversal, absolute/drive/UNC repository selectors, `.git` path components, non-repository directories, and the Folder root itself are rejected;
10. repositories reached through external symlink/junction targets are not discovered;
11. candidates whose Git metadata resolves outside the Folder root are rejected;
12. Folder file reads continue to block `../`, absolute paths, `.git`, sensitive paths, and external links;
13. Folder mode rejects Local Verification evidence calls and never starts Local Verification;
14. switching the same ChatGPT app from Folder to direct Git mode does not produce a stale tool/schema mismatch;
15. opening a repository directly as a Git Project preserves the existing Git and Local Verification behavior;
16. untrusted workspaces remain blocked;
17. the same automated tests pass on Windows, Linux, and macOS.

Repository CI remains the source of truth for lint, TypeScript type checking, unit tests, builds, VSIX packaging, and package-content validation. Windows installation/F5 acceptance remains a separate merge gate for the visible connection behavior.
