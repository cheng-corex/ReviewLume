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
- P7 review history:
  - Atomic `metadata.json` and exact `request.md` snapshots under
    `.reviewlume/history/<reviewId>/` after successful exports.
  - Strict Zod metadata validation with repository-relative paths only.
  - QuickPick history browsing, search, integrity status, prompt copying, export opening,
    exact Markdown recovery, and confirmed deletion.
  - Response import from a user-selected file or clipboard with a 5 MB limit.
  - Automatic Chinese history UI for Chinese VS Code locales and English otherwise.
- P7.5 review scope modes:
  - Changes Only, Smart Context, and Full Repository choices in the Review Panel.
  - Smart Context is the default and adds one-hop local dependencies, direct dependents,
    related tests, type companions, and project configuration within strict budgets.
  - Full Repository includes only eligible UTF-8 text files admitted by Git and
    `.reviewlumeignore`, with generated output, dependencies, databases, and binaries excluded.
  - Full Repository is rejected when it cannot fit into a single non-truncated Review Pack.
  - Scope changes remain subject to the existing sensitive-content scan, fingerprint,
    and export gates.
- P9 optional browser bridge:
  - Strict Zod bridge protocol with request hashes, nonces, expiries, replay protection,
    review binding, payload limits, and authenticated prompt polling.
  - Loopback-only local bridge on a random `127.0.0.1` port with one-time pairing codes,
    short-lived in-memory sessions, extension-instance binding, CORS restrictions, and revocation.
  - One-click VS Code actions for ChatGPT, Claude, and Gemini that start the bridge, create a
    fragment-only local handoff, pair the browser extension, and open the selected site without
    requiring manual address or pairing-code entry.
  - First-use per-site permission confirmation through Manifest V3 optional host permissions;
    subsequent connections pair automatically while preserving explicit user control.
  - Page adapters that only locate a confirmed visible composer and fill text after an explicit
    user action; they never click or submit, read answers, or access cookies and session storage.
  - Cross-platform CI validation for manifest safety, referenced files, JavaScript syntax,
    prohibited auto-submit primitives, and prohibited credential/session reads.

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
  prevent ReviewLume from recursively reviewing its own output.
- Kept review history and response imports bounded to the active repository and existing
  review identifiers.
