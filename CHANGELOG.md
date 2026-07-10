# Changelog

## [Unreleased]

### Added

- P1 VS Code extension entry and basic interaction:
  - `ReviewLume: Create Review Pack`, `Open Review History`, and `Import Review Response` commands.
  - ReviewLume Activity Bar container with workspace status and action entries.
  - ReviewLume OutputChannel for local diagnostic messages.
  - Limited Workspace Trust support so status remains visible in Restricted Mode while repository-sensitive commands are blocked.

### Fixed

- Kept the packaged P0 extension entry point self-contained so a VSIX built with
  `--no-dependencies` does not fail on an unpackaged workspace module.
- Made clean scripts and the VS Code build task work across Windows, macOS, and Linux.
- Corrected the extension repository metadata and private vulnerability reporting path.
- Aligned the core review modes and default Review Pack size with the design documents.
- Made workspace-state semantics explicit before P2 Git discovery and added real rejection-path tests.
- Enforced the documented log-service initialization contract.

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
