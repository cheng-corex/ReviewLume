# ReviewLume 0.3.1 Local Verification Acceptance

Status: pending Windows acceptance for PR #28.

This checklist validates the exact 0.3.1 security and usability boundary. The PR remains Draft and must not merge until the applicable checks pass.

## Preconditions

- Windows with VS Code 1.100 or later.
- The exact CI-produced ReviewLume 0.3.1 VSIX.
- A disposable Git repository that contains at least one nested Node package such as `server/`.
- The nested package has its own `package.json`, a supported installed runner, and changed tests.
- Use no production credentials, customer data, production databases, or destructive resources.

## A. Upgrade and Old Approval Invalidation

1. Install 0.3.0 and approve the JavaScript syntax rule or another rule.
2. Upgrade to the exact 0.3.1 candidate.
3. Run approved verification or connect ReviewLume.

Expected:

- The schema-1 approval from 0.3.0 is rejected.
- No old rule runs silently.
- ReviewLume asks the user to review current schema-2 rules.

## B. Nested Package Discovery

Use a repository similar to:

```text
repository/
├─ package.json
├─ server/
│  ├─ package.json
│  ├─ node_modules/mocha/bin/mocha.js
│  └─ test/example.test.js
└─ client/
   └─ package.json
```

Run **ReviewLume: Configure Local Verification**.

Expected:

- The picker includes `Mocha changed tests (server)` or the corresponding supported runner.
- The rule detail displays `[cwd: server]`.
- A root package runner, nested package runner, and syntax check are separate fixed rules.
- No free-form command input is present.
- No runner outside the bound repository is offered.

## C. Hoisted Runner Discovery

Remove the nested package's own runner while keeping the declared dependency and a compatible runner under the repository root `node_modules`.

Expected:

- ReviewLume may offer the nested package rule using the repository-local hoisted runner.
- The displayed working directory remains the nested package.
- A runner resolving outside the Git repository is rejected.

## D. Approval Modal and Wording

### Syntax-only selection

Select only **JavaScript syntax check for changed files**.

Expected:

- The warning says the files are parsed without executing their contents.
- The dialog contains one affirmative action and only the native localized cancel button.
- English `Cancel` and localized `取消` do not appear together.

### Test or type-check selection

Select a nested test runner or TypeScript check.

Expected:

- The warning states that repository-local tooling may execute code and cause file, network, or local-service side effects.
- The exact working directory and command are visible before approval.

## E. Nested Test Execution

1. Approve the nested package runner.
2. Modify or add two matching tests under the nested package.
3. Modify a matching test in a different package or repository root.
4. Choose **Approve and run** or run **ReviewLume: Run Approved Local Verification**.

Expected:

- The process working directory is the approved nested package.
- Targets are passed relative to that package, such as `test/example.test.js`.
- Tests outside that package are not passed to this runner.
- New matching tests are included without another approval.
- No shell window or arbitrary package script is used.

## F. JavaScript Syntax Checks

1. Modify two valid `.js` files.
2. Run the syntax rule.
3. Make the second file invalid and run again.

Expected:

- Each file is checked in a separate process.
- The valid run passes.
- The invalid second file causes failure; success from the first file cannot mask it.

## G. Configuration and Runner Invalidation

After approving a nested runner, separately change:

- the nested `package.json`;
- runner configuration;
- a relevant lockfile;
- runner content or location;
- the approved package working directory through a changed project layout.

Expected:

- The approval becomes invalid.
- No process runs until the new fixed rule is approved.
- Editing ordinary test content alone does not invalidate the rule.

## H. Zero-Test, Cancellation, and Timeout

Expected:

- Explicit `0 tests`, `0 passing`, or no-test output is `inconclusive`.
- User cancellation produces `cancelled` and terminates the process tree.
- Timeout produces `timed-out` and does not automatically retry.

## I. Restricted Mode and Side Effects

Expected:

- Restricted Mode blocks all local verification process starts.
- A safe fixture that modifies the repository sets `workspaceChangedDuringRun=true` and makes evidence stale.
- ReviewLume does not revert or modify test-created files.

## J. Output and MCP Evidence

Expected:

- Output is bounded, ANSI-cleaned, and best-effort redacted.
- No raw test output is written to the diagnostic OutputChannel.
- `verification_status` and `read_verification_output` remain read-only.
- Both report `mcpCanStartProcesses: false`.
- ChatGPT cannot start, retry, alter, or compose a command.

## K. Package Scan Bounds

Use a safe fixture with generated directories and multiple package roots.

Expected:

- `.git`, `node_modules`, build, coverage, cache, and common output directories are not recursively scanned as package roots.
- Directory symbolic links are not traversed by package discovery.
- Discovery completes without an unbounded repository walk.

## L. Clear Approval

Run **ReviewLume: Clear Local Verification Approval**.

Expected:

- The repository approval and stored result are removed.
- A later run cannot start until a new approval is granted.

## Acceptance Record

Record:

- VSIX filename, version, size, and SHA-256;
- PR head SHA and CI run number;
- VS Code and Windows versions;
- disposable test repository layout and runner type;
- sections A–L as pass/fail/not-applicable;
- screenshots with no secret, private path, account email, Tunnel ID, or private source.
