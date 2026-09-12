# ReviewLume 0.3.3 Local Verification Acceptance

Status: **pending final combined-artifact Windows acceptance**.

This checklist validates the direct Git Project Local Verification boundary in the 0.3.3 release candidate. It also checks that the stable 11-tool MCP contract does not grant Folder Projects process execution.

The final release candidate must remain Draft until the applicable items are completed and recorded truthfully.

## Preconditions

- Windows with VS Code 1.100 or later.
- Exact CI-produced `reviewlume-vscode-0.3.3.vsix`.
- A disposable, non-production Git test repository.
- At least one nested Node package such as `server/` or `client/` with a supported runner.
- Synthetic tests and output only; no production credentials/customer data.

## A. Install and basic activation

1. Install/upgrade using the exact final VSIX.
2. Fully restart VS Code.
3. Confirm the ReviewLume status bar and commands load normally.
4. Confirm the manifest reports version 0.3.3.

Expected: no duplicate UI surface and no process/tunnel starts merely because VS Code activates.

## B. Nested package discovery

1. Use a repository with a nested package such as `server/package.json` and a package-local supported runner.
2. Run **ReviewLume: Configure Local Verification**.
3. Confirm a nested rule is discovered with `[cwd: server]` (or the equivalent package path).
4. Repeat with a package that resolves a supported runner from repository-level hoisted `node_modules`.

Expected:

- bounded package discovery finds the nested package;
- package-local and valid repository-hoisted runners can be resolved;
- runners outside the canonical repository are rejected;
- no free-form command entry is offered.

## C. Approval schema and prompt

1. Approve a nested test/typecheck rule.
2. Confirm the approval shows executable, fixed args, package cwd, target mode, and timeout.
3. Confirm there is only the native VS Code cancel path, not a duplicate explicit English Cancel action.
4. Check a syntax-only `node --check` approval separately.

Expected:

- current approvals use schema version 2;
- schema-1/older approval data is invalidated;
- test/typecheck warning explains repository code may execute and have side effects;
- syntax-only warning says file contents are parsed without being executed;
- ChatGPT is explicitly unable to change/start these commands.

## D. Package-relative changed-test targeting

1. Add or modify a matching test under the approved nested package.
2. Also modify a matching-looking test under another package/root.
3. Run the approved verification.

Expected:

- the nested package test is passed to its runner as a package-relative argv entry;
- the same path is not passed with the outer repository prefix;
- matching tests from another package are not passed to this runner;
- adding ordinary matching test content does not require per-file approval.

## E. JavaScript syntax checks

Modify two JavaScript files and run the syntax rule; then make the second file syntactically invalid and run again.

Expected:

- one fixed process invocation per changed JavaScript file;
- valid files pass;
- the invalid file fails the run;
- the file content itself is not executed by `node --check`.

## F. Approval invalidation

After approval, change one boundary item at a time: nested `package.json`, relevant test/TypeScript config, lockfile, repository-local runner content, or package working directory availability.

Expected: the previous approval is rejected/removed and no process starts until the updated rule is approved again.

## G. Zero-test, cancellation, timeout, and side effects

Exercise safe fixtures for:

- explicit zero/no matching tests;
- user cancellation;
- approved timeout;
- a test that modifies a disposable repository file.

Expected:

- zero tests => `inconclusive`, not passed;
- cancellation => `cancelled` and no automatic retry;
- timeout => timed-out/failure state and process tree termination;
- repository change => `workspaceChangedDuringRun: true` / stale warning; ReviewLume does not revert the test's side effect.

## H. Stored output and redaction

Print synthetic values shaped like Authorization/Bearer, API key, URL credentials, and JWT.

Expected:

- stored output is bounded;
- ANSI/control noise is removed;
- known synthetic secret patterns are redacted on a best-effort basis;
- raw process output is not copied into ReviewLume diagnostic logs.

## I. Direct Git MCP evidence

Connect the test repository as a direct Git Project and call:

- `verification_status`
- `read_verification_output`

Expected:

- the public MCP surface contains the stable 11 tools;
- evidence calls are read-only and report `mcpCanStartProcesses: false`;
- MCP cannot start, retry, alter, or compose Local Verification;
- stale workspace changes are not presented as current evidence.

## J. Folder Project regression check

Connect a Folder Project containing child Git repositories.

Expected:

- the same stable 11 tool names remain exposed;
- `verification_status` and `read_verification_output` return unavailable;
- Folder mode does not discover, approve, or run Local Verification;
- selecting a child Git repository for status/history/diff does not expose its verification evidence.

## K. Git ↔ Folder stable-schema smoke check

Using the same ChatGPT app, switch between a Folder Project and a direct Git Project without refreshing/recreating the app.

Expected: the public 11-tool contract remains unchanged while runtime `projectKind` semantics switch correctly.

## L. Clear approval

Run **ReviewLume: Clear Local Verification Approval**.

Expected: repository-specific approval and stored result are removed; later connection cannot run verification without a new approval.

## Acceptance Record

Record:

- VSIX version, size, SHA-256, and CI head;
- VS Code and Windows versions;
- synthetic test repository/package/runner type;
- A–L as pass/fail/not-applicable;
- any known limitation;
- screenshots only when they contain no secret, account email, Tunnel ID, Runtime API Key, private path, customer data, or private source.

Previously completed Folder/Git stable-tool testing may be referenced for behavior history, but the combined 0.3.3 artifact must still receive an install/smoke check because its Local Verification implementation changed after 0.3.2.
