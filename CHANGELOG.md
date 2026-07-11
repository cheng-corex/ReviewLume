# Changelog

## [Unreleased]

### Added

- P1 VS Code extension entry and basic interaction:
  - `ReviewLume: Create Review Pack`, `Open Review History`, and `Import Review Response` commands.
  - ReviewLume Activity Bar container with workspace status and action entries.
  - ReviewLume OutputChannel for local diagnostic messages.
  - Limited Workspace Trust support so status remains visible in Restricted Mode while repository-sensitive commands are blocked.
- P2 read-only Git context:
  - Git availability and repository-root discovery across single-root and multi-root workspaces.
  - Explicit repository selection when more than one repository is discovered.
  - Staged, unstaged, and untracked status snapshots.
  - Canonicalized commit-range validation and read-only diff/log retrieval.
  - Cancellable Git inspection from `ReviewLume: Create Review Pack`.
- P3 repository-bound file selection:
  - Hierarchical changed-file tree with per-file checkbox state.
  - Manual related-file selection limited to the active repository.
  - Related test-file recommendations added as unchecked candidates.
  - `.gitignore` and repository-root `.reviewlumeignore` enforcement.
  - Real-path validation that rejects cross-repository paths, Git metadata, directories,
    and symbolic-link escapes.
- P4 sensitive-content scanning:
  - Filename, private-key, authorization/session, token, connection-string, JWT,
    high-entropy, and private-network rules.
  - HARD_BLOCK, BLOCK, WARN, and INFO policy levels with non-bypassable export gates.
  - Fully redacted previews, per-WARN confirmation, content fingerprints, and stale-scan rejection.
  - Exact-content scanning that includes selected files, generated instructions, and Git diff.
  - `ReviewLume: Scan Selected Files` command.
- P5 Review Pack schema v1:
  - Stable `workspaceId`, cryptographically random `reviewId`, and collision-retry helper.
  - Privacy-safe manifest, Markdown output, exclusions, truncation accounting, and size budget.
  - Fixed `REVIEW_REQUEST.md` name and optional store-mode ZIP output under
    `reviewlume-pack-<review-id>`.
  - `ReviewLume: Export Review Pack` command.
- Automatic Review Pack export:
  - Default no-dialog Markdown export under `.reviewlume/exports/<reviewId>/REVIEW_REQUEST.md`.
  - Configurable Markdown, ZIP, or both output formats.
  - Optional `askEveryTime` mode that preserves the save dialog workflow.
  - Repository-bound export-directory validation and symbolic-link escape rejection.
  - Silent repository-root `.gitignore` updates after successful automatic export, controlled by
    `reviewlume.export.autoUpdateGitignore`.
  - Clickable `ReviewLume: Add Export Directory to .gitignore` recovery action.
- P6 Review Panel usability:
  - Automatic Chinese UI for Chinese VS Code locales and English for all other locales.
  - Localized extension command and settings titles through VS Code NLS resources.
  - In-panel Markdown, ZIP, or combined export-format selection that updates workspace settings.
  - Theme-aware primary, hover, focus, and disabled button states using VS Code color variables.

### Fixed

- Kept the packaged P0 extension entry point self-contained so a VSIX built with
  `--no-dependencies` does not fail on an unpackaged workspace module.
- Made clean scripts and the VS Code build task work across Windows, macOS, and Linux.
- Corrected the extension repository metadata and private vulnerability reporting path.
- Aligned the core review modes and default Review Pack size with the design documents.
- Made workspace-state semantics explicit before P2 Git discovery and added real rejection-path tests.
- Enforced the documented log-service initialization contract.
- Enforced a read-only Git command allowlist, disabled external diff/textconv execution,
  and stopped retaining credential-bearing remote URLs.
- Preserved exact NUL-delimited Git paths and propagated Git status failures instead of
  silently presenting a failed inspection as a clean repository.
- Preserved legal POSIX filenames containing backslashes in file selection, scanning,
  and Review Pack manifests.
- Prevented raw matched values and adjacent same-line secrets from entering scan results,
  previews, logs, or diagnostics.
- Added the scan and export commands to the clickable Activity Bar action list.
- Excluded generated `.reviewlume/exports/**` files from new review-selection sessions to
  prevent Review Packs from recursively including earlier Review Packs.
- Unified ZIP export to the same review-specific directory as Markdown and both formats:
  all three formats now save under `.reviewlume/exports/<reviewId>/` instead of placing
  ZIP archives directly in the export root.
- P7 review history storage and browsing:
  - Automatic history record (`metadata.json` + `request.md`) saved to `.reviewlume/history/<reviewId>/`
    after every successful export.
  - QuickPick-based history browser with per-entry actions (open, copy prompt, re-export, delete).
  - Full history import for AI review responses (`response.md`) with basic title parsing.
  - Single-entry and clear-all deletion.
  - Repository-bound: history is scoped to the current Git repository.

## [0.1.0] - 2026-07-10

### Added

- P0: Engineering foundation.
  - pnpm workspace with TypeScript project references.
  - VS Code extension skeleton with `reviewlume.hello` command.
  - Core packages: `@reviewlume/core`, `@reviewlume/git-context`,
    `@reviewlume/review-pack`, `@reviewlume/secret-scanner`,
    `@reviewlume/prompt-templates`, `@reviewlume/report-parser`.
  - ESLint, Prettier, and Vitest configuration.
  - GitHub Actions CI workflow.
  - MIT License, SECURITY.md, and CHANGELOG.md.
  - VSIX packaging with `@vscode/vsce`.
