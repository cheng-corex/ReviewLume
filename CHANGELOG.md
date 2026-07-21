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
- P9 ChatGPT read-only repository MCP:
  - Loopback-only, token-authenticated Streamable HTTP MCP endpoint bound to one Git repository.
  - Model-controlled tools for repository summary, Git status, recent commits, explicit diffs,
    file listing, bounded file reads, and bounded literal code search.
  - Tool annotations declare every operation read-only, non-destructive, idempotent, and closed-world.
  - Repository path validation rejects absolute paths, parent traversal, `.git`, binary files,
    sensitive credential paths, oversized files, and symbolic-link escapes.
  - File content, diffs, search results, and commit titles pass through the existing SecretScanner
    before being returned to the model.
  - Official `openai/tunnel-client` integration validates official help text and Tunnel ID format,
    runs `doctor --explain`, starts without a shell, waits for fresh loopback readiness, and opens
    ChatGPT only after the OpenAI control plane reports the matching healthy Tunnel.
  - Tunnel ID, official client path, normalized control-plane proxy, and ChatGPT browser preference
    are stored in VS Code global state; the Runtime API Key is stored only in SecretStorage.
  - ChatGPT can be opened in the system default browser, Microsoft Edge, or Google Chrome without
    changing the operating-system default browser. The explicit browser launch never uses a shell.
  - Normal connect and reopen actions go directly to a new ChatGPT chat. Connector settings remain
    available only as an explicit Advanced action.
  - Control-plane proxy discovery supports saved state, dedicated and standard proxy environment
    variables, VS Code `http.proxy`, and Windows system proxy settings.
  - Only `CONTROL_PLANE_HTTP_PROXY` is passed to tunnel-client; generic proxy variables are removed
    so the local MCP and unrelated VS Code traffic are not redirected by ReviewLume.
  - `/api/status` validation rejects mismatched Tunnel IDs, `tunnel_metadata_error`, and an unhealthy
    main MCP channel instead of treating loopback `/readyz` alone as a successful connection.
  - A dedicated `X-ReviewLume-Token` header protects the loopback MCP without conflicting with
    ChatGPT connector authentication; header configuration uses an environment reference.
  - Ambient tunnel profiles, MCP commands, admin keys, Cloudflared, Harpoon, remote UI, log files,
    raw HTTP logging, and generic proxy overrides are removed before the controlled environment is constructed.
  - Doctor diagnostics are redacted before display; long-running tunnel-client stdout/stderr is not
    captured, avoiding credential leakage across arbitrary output chunks.
  - The status bar is the single visible ReviewLume entry point for P9. The redundant Activity Bar
    container is no longer contributed; Advanced review features remain available through commands.
  - Existing Review Pack, response import, history, issue status, implementation, and re-review
    capabilities remain available as Advanced commands rather than the default workflow.
  - The earlier browser input-field bridge prototype is no longer registered as the P9 main flow.

### Fixed

- Treat explicit VS Code command cancellation during Extension Host reload as a silent cancellation instead of showing a misleading `Canceled` error notification; operational failures continue to surface.
- Open the ChatGPT home route for a new conversation instead of reopening the connector detail modal after every successful connection.
- Keep `tools/call` independent from best-effort OutputChannel logging so extension-host reloads or a disposed log channel cannot turn valid read-only tool calls into HTTP 500 responses.
- Activate ReviewLume after VS Code startup finishes so the MCP status bar is visible immediately; startup activation does not start a tunnel or inspect repository contents.
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
- Excluded generated `.reviewlume/exports/**` files from new review-selection sessions to
  prevent Review Packs from recursively including earlier Review Packs.
- Unified ZIP export to the same review-specific directory as Markdown and both formats:
  all three formats now save under `.reviewlume/exports/<reviewId>/` instead of placing
  ZIP archives directly in the export root.
- Hardened P7 history handling:
  - Reject symbolic-link escapes and non-regular history files.
  - Surface corrupt or incomplete records instead of silently hiding them.
  - Remove the incomplete fake ZIP reconstruction path; only exact historical content may be restored.
  - Delete the matching managed export directory with a confirmed history deletion.
  - Keep `.reviewlume/history/**` out of Git and future Review Pack selection.
  - Avoid logging imported response content or user-controlled titles.
- Fixed official Windows tunnel-client help validation, unauthenticated reachability probing,
  Protected Resource Metadata discovery, proxy persistence, and false-positive readiness reporting
  during real Windows Secure MCP Tunnel acceptance.

## [0.1.0] - 2026-07-10

### Added

- P0: Engineering foundation.
  - pnpm workspace with TypeScript project references.
  - VS Code extension skeleton with `reviewlume.hello` command.
  - Core packages: `@reviewlume/core`, `@reviewlume/git-context`, `@reviewlume/prompt-templates`,
    `@reviewlume/review-pack`, `@reviewlume/secret-scanner`, and `@reviewlume/report-parser`.
