# ReviewLume 0.3.0 Local Verification Acceptance

Status: pending Windows F5 acceptance.

This checklist validates the exact security and usability boundary of the local verification assistant. The PR must remain Draft and must not merge until these checks pass.

## Preconditions

- Windows with VS Code 1.100 or later.
- ReviewLume extension development host or the exact CI-produced 0.3.0 VSIX.
- A non-production test repository with Git initialized.
- A repository-local supported runner, preferably Mocha, Vitest, or Jest.
- At least one passing changed test and one ordinary changed JavaScript file.
- No production credentials, customer data, production databases, or destructive test resources.

## A. First Approval

1. Open the test repository and trust the workspace.
2. Run **ReviewLume: Configure Local Verification**.
3. Confirm that the picker shows only fixed discovered rules.
4. Confirm that each rule displays an executable, fixed arguments, target mode, and timeout.
5. Confirm that no free-form command text box is present.
6. Select JavaScript syntax check and one repository-local test runner.
7. Confirm the modal warning states that tests execute repository code and may have side effects.
8. Choose **Approve and run**.

Expected:

- No shell window is opened.
- The VS Code notification shows verification progress.
- The approved rules run once.
- No configuration or output file is added to the repository.
- The result is stored in VS Code extension storage.

## B. Automatic New Test Inclusion

1. Add a new matching test file without changing the approved runner configuration.
2. Modify another existing matching test file.
3. Run **ReviewLume: Run Approved Local Verification**.

Expected:

- No new approval prompt is shown.
- Both the new and modified tests are passed explicitly to the approved runner.
- Ordinary source files are not passed as test targets.
- The result records the exact requested targets.

## C. JavaScript Syntax Checks

1. Modify two valid `.js` files.
2. Run the approved verification.
3. Make the second file syntactically invalid while leaving the first valid.
4. Run again.

Expected:

- Each changed JavaScript file is checked in a separate process invocation.
- The first run passes.
- The second run fails on the invalid second file; it must not report success merely because the first file is valid.

## D. Zero-Test Evidence

Run a supported test runner in a repository state where an explicit matching target produces a runner message such as `0 passing` or `No test files found`.

Expected:

- ReviewLume reports `inconclusive`, not `passed`.
- The evidence explains that zero or no matching tests were reported.

## E. Approval Invalidation

1. Approve a runner.
2. Change relevant `package.json`, test-runner configuration, or TypeScript configuration.
3. Connect ReviewLume or run verification again.

Expected:

- The previous approval is removed or rejected.
- ReviewLume states which rule changed.
- No process starts until the updated rule is reviewed and approved again.

Adding or editing ordinary test content alone must not invalidate the fixed rule.

## F. Restricted Mode

1. Reopen the repository without trusting the workspace.
2. Run a local verification command.

Expected:

- No process starts.
- ReviewLume states that local verification requires a Trusted Workspace.

## G. Cancellation and Timeout

1. Use a safe test fixture that runs long enough to cancel.
2. Start verification and click Cancel.
3. Separately exercise a safe fixture that exceeds the approved timeout.

Expected:

- Cancellation returns `cancelled`.
- Timeout returns `timed-out`.
- The child process tree is terminated on Windows.
- ReviewLume does not automatically retry.

## H. Repository Side-Effect Detection

Use a safe test fixture that intentionally creates or modifies a disposable repository file.

Expected:

- The run completes according to the process exit code.
- `workspaceChangedDuringRun` is true.
- The notification warns that the result is already stale.
- ReviewLume does not revert, delete, or otherwise modify the test-created change.

## I. Stored Output and Redaction

Use a safe fixture that prints synthetic values shaped like:

- `Authorization: Bearer ...`
- `api_key=...`
- a URL with username and password
- a synthetic JWT

Expected:

- Stored output is bounded.
- ANSI control sequences are removed.
- Known synthetic secret patterns are replaced with redaction markers.
- No raw output appears in the ReviewLume diagnostic OutputChannel.

Redaction is best-effort; this test does not establish that every possible secret format is detected.

## J. ChatGPT Evidence Tools

After a completed run and a refreshed/rescanned ReviewLume connector, ask ChatGPT to call:

- `verification_status`
- `read_verification_output`

Expected:

- Both tools are shown as read-only.
- The connector exposes nine total tools: seven repository readers plus two verification evidence readers.
- The payload includes `mcpCanStartProcesses: false`.
- ChatGPT can read status and bounded sanitized output.
- ChatGPT cannot start, retry, alter, or compose a verification command.

## K. Stale Evidence

1. Complete a passing verification run.
2. Modify a tracked or non-ignored untracked file.
3. Ask ChatGPT for `verification_status` again.

Expected:

- The prior result is reported as `stale`.
- Current and recorded HEAD/fingerprint context are not falsely presented as matching.

## L. Clear Approval

Run **ReviewLume: Clear Local Verification Approval**.

Expected:

- The repository-specific approval is removed.
- The stored result is removed.
- A later connection cannot start verification until a new approval is granted.

## Acceptance Record

Record:

- VSIX version and SHA-256;
- VS Code version;
- Windows version;
- test repository and runner type without disclosing private content;
- each section A–L as pass/fail;
- any expected baseline limitation;
- screenshots with no secret, private path, Tunnel ID, Runtime API Key, account email, or private source code.
