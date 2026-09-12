# Changelog

## [Unreleased]

- No new product phase is active. Current work remains P8 release/review-loop hardening; the optional browser bridge is not started.

## [0.3.3] - 2026-09-12

### Fixed

- Restored the Local Verification improvements that were already present in 0.3.1 but were not carried into the independently developed 0.3.2 Folder Project branch.
- Local Verification again performs bounded discovery of nested Node package roots such as `server/`, `client/`, and `packages/*`.
- Package-local and repository-hoisted Vitest, Jest, Mocha, Node test, and TypeScript runners are supported within the approved repository boundary.
- Approved rules bind a repository-relative package `workingDirectory`; changed test targets are passed package-relative and tests from other package roots are excluded.
- Approval schema version 2 invalidates older approvals that did not bind the package working directory.
- The approval UI keeps VS Code's native cancel behavior and uses different risk wording for syntax-only checks versus rules that may execute repository code.

### Added

- Folder Project support for the read-only ChatGPT MCP connector.
- A Trusted VS Code Workspace Folder can connect even when the outer root is not itself a Git repository.
- Bounded nested Git discovery within the authorized Folder root.
- Stable 11-tool read-only MCP contract shared by direct Git Project and Folder Project connections:
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
- Folder Git queries require one exact discovery result and never synthesize aggregate Git history for the outer Folder root.
- Folder mode keeps the verification evidence tool names for schema stability, but calls return unavailable, start no process, and expose no child-repository verification evidence.

### Security

- One MCP connection still binds one canonical outer Project Root.
- Nested Git top-level and Git metadata must both remain inside the authorized Folder root.
- Folder direct-file enumeration does not follow symlink/junction-like entries and applies bounded path/file/result controls plus a conservative credential-like filename denylist.
- MCP still exposes no shell, terminal, file mutation, patch application, Git mutation, arbitrary command, or general process-start capability.
- Local Verification remains direct-Git-only and uses fixed executable/argv with `shell: false`.

## [0.3.2] - 2026-09-12

### Added

- First Marketplace build with Folder Project support and the stable 11-tool Git/Folder MCP contract.

### Known regression

- This build was produced from the Folder Project branch before that branch had been reconciled with the already-published 0.3.1 nested Local Verification runner fixes. 0.3.3 restores those fixes while retaining Folder Project support.

## [0.3.1] - 2026-08-04

### Fixed

- Added bounded nested package-root discovery for Local Verification.
- Added package-local and repository-hoisted runner resolution.
- Added repository-relative `workingDirectory` to approved rules and package-relative test argv.
- Prevented changed tests from unrelated packages from entering a nested package runner invocation.
- Removed the explicit English Cancel action from the approval modal and kept the native VS Code cancel path.
- Added accurate syntax-only versus repository-code-execution warning text.

### Security

- Upgraded Local Verification approval schema to version 2.
- Bound approvals to package cwd, relevant package/config files, root/package lockfiles, fixed args, timeout, target mode, and repository-local runner content.
- Continued to use no-shell process execution and rejected package scripts, `npx`, AI instructions, repository instructions, and arbitrary commands.

## [0.3.0] - 2026-08-04

### Added

- User-approved Local Verification for direct Git repositories.
- Fixed repository-local Vitest, Jest, Mocha, Node test, TypeScript `tsc --noEmit`, and per-file JavaScript syntax-check entry points.
- Bounded sanitized verification evidence stored in VS Code extension storage.
- Read-only `verification_status` and `read_verification_output` evidence tools; MCP cannot start processes.
- Secure MCP Tunnel integration using the official OpenAI tunnel client, loopback MCP, per-run local token, and SecretStorage for the Runtime API Key.

### Security

- No MCP shell, terminal, write, delete, patch, Git mutation, package-script, or arbitrary process-start capability.
- Local Verification uses executable/argv with `shell: false`, bounded output, timeout/cancellation, stale-result tracking, and best-effort output redaction.

## [0.2.0] - 2026-07-23

### Added

- VS Code review workflow, read-only Git context, repository-bound file selection, P8 sensitive-content scanning, Review Pack export, review history, response import, issue state, implementation/re-review workflow, and read-only MCP/Tunnel Preview foundations.
- Localized ReviewLume commands/settings and status-bar MCP entry.

### Security

- Read-only Git allowlist, canonical repository/path validation, symlink escape rejection, disabled external diff/textconv, sanitized remote URLs, bounded Review Pack generation, and P8 SecretScanner/export gates.

## [0.1.0] - 2026-07-10

### Added

- Initial pnpm/TypeScript monorepo foundation, VS Code extension skeleton, and core ReviewLume packages.
