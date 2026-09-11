# Folder Project Support

## Purpose

ReviewLume treats Git as an enhancement rather than a prerequisite for the read-only MCP connector. One Trusted VS Code Workspace Folder can now be bound as one of two project kinds:

- **Git Project** — a Git repository was discovered from the selected Workspace Folder.
- **Folder Project** — the selected Workspace Folder is trusted and readable, but no Git repository was discovered.

One MCP connection still binds exactly one canonical project root. Multi-root VS Code workspaces require selecting one Workspace Folder; ReviewLume does not combine roots into one review context.

This change extends the existing read-only MCP connector. It does not start the optional browser bridge and it does not change the P8 Advanced Review Pack workflow.

## Project detection

At connection time ReviewLume:

1. requires VS Code Workspace Trust;
2. canonicalizes the selected Workspace Folder with `realpath`;
3. attempts the existing read-only `git rev-parse --show-toplevel` discovery;
4. uses the canonical Git root as a **Git Project** when discovery succeeds;
5. otherwise uses the canonical Workspace Folder itself as a **Folder Project**.

A missing `.git` directory is therefore no longer a connection failure. If Git discovery is unavailable or fails, ReviewLume degrades to the smaller Folder Project capability set rather than fabricating repository metadata.

## MCP capabilities

### Folder Project

A Folder Project exposes only:

- `project_summary`
- `list_files`
- `read_file`
- `search_code`

`project_summary` explicitly reports `projectKind: "folder"`, `gitHistoryAvailable: false`, and `localVerificationAvailable: false`.

Folder Projects do **not** expose or simulate:

- `repository_summary`
- `git_status`
- `recent_commits`
- `get_diff`
- `verification_status`
- `read_verification_output`

If a caller attempts a hidden Git or verification tool name, the call is rejected. ReviewLume must not infer “recent changes”, branch history, staged/unstaged state, commit ranges, or diffs for a Folder Project.

### Git Project

Git Projects keep the established repository tool contract:

- `repository_summary`
- `git_status`
- `recent_commits`
- `get_diff`
- `list_files`
- `read_file`
- `search_code`

When Local Verification is available in the installed build, Git Projects may additionally expose its read-only evidence tools:

- `verification_status`
- `read_verification_output`

The existing `repository` and `repositoryRoot` connection fields remain for compatibility. The connection also carries explicit `project`, `projectRoot`, and `projectKind` identity.

## Local Verification boundary

Folder Project support does not weaken or generalize the Local Verification safety model.

For a Folder Project, MCP connection startup:

- does not run verification discovery;
- does not run an approved verification rule;
- does not register verification evidence tools.

Local Verification remains repository-bound for Git Projects. Folder verification would require a separate design and approval before implementation.

## File access boundary for Folder Projects

Folder Projects reuse the existing bounded `list_files`, `read_file`, and `search_code` implementation. The only replacement is file enumeration: instead of `git ls-files`, a bounded filesystem enumerator supplies eligible project-relative files and starts no process.

The Folder Project enumerator is intentionally conservative:

- at most 5,000 files are enumerated;
- at most 20,000 filesystem entries are visited;
- traversal depth is bounded;
- `.git`, `.hg`, `.svn`, dependency caches, common generated/build trees, and credential-store directories are skipped;
- symbolic links, junction-like links, and other link entries are never followed during enumeration;
- every enumerated directory and file is canonicalized and must remain inside the canonical project root.

The shared reader additionally rejects:

- absolute paths, including Windows drive paths and UNC paths;
- `..` parent traversal;
- `.git` paths;
- real paths that escape the root;
- directories;
- binary files;
- files above the existing read-size limit;
- oversized tool results.

Folder Projects add a conservative path-name block for obvious credential material, including `.env` secrets (while allowing template suffixes such as `.env.example`), common credential files, private-key/certificate containers, and credential-store directories. This is a path policy, **not** content secret scanning: users must still treat every connected file as potentially sensitive.

Git Projects intentionally retain their established MCP filename semantics for compatibility. In the existing Git mode, tracked sensitive-looking files are not automatically filtered solely by filename. The stricter Folder policy must not be described as retroactively changing Git Project behavior.

## Read-only guarantees

Folder Project support adds no MCP capability for:

- shell or terminal execution;
- arbitrary commands or package scripts;
- process start;
- file create/write/delete/rename;
- patch application;
- Git mutation;
- executing instructions found in project files or AI responses.

Project files remain untrusted input. Text found in the project cannot enlarge the root, enable a hidden tool, or authorize an operation.

## UI behavior

The primary action is **Connect Current Project to ChatGPT**. Users do not choose a mode manually: ReviewLume detects Git vs Folder after the Workspace Folder is selected.

While connected, visible status includes the detected kind, for example:

- `ReviewLume: ai-ui · Git`
- `ReviewLume: temp-demo · Folder`

Because this changes visible VS Code connection UI and the real connection flow, Windows F5 manual acceptance is required before merge.

## Required acceptance checks

Automated coverage should verify at least:

1. a trusted ordinary folder is Ready and can connect;
2. no Git repository is no longer a workspace-readiness failure;
3. Folder identity is explicit and cannot be confused with Git identity;
4. Folder `list_files`, `read_file`, and `search_code` work;
5. Folder tool registration contains no Git or verification tools;
6. hidden Git/verification calls are rejected;
7. Git tool registration and Git verification behavior remain unchanged;
8. `../`, absolute Windows paths, UNC paths, `.git`, sensitive paths, and external symlink/junction targets are rejected;
9. untrusted workspaces remain blocked;
10. one connection remains bound to one selected Workspace Folder/project root;
11. the same tests pass on Windows, Linux, and macOS.

The repository CI remains the execution source of truth for lint, TypeScript type checking, unit tests, builds, VSIX packaging, and package-content validation. Windows F5 acceptance is a separate merge gate for the visible connection behavior.
