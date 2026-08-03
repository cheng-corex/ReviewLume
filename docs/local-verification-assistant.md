# ReviewLume Local Verification Assistant

Status: implemented on the `feat/local-verification-assistant` Draft PR; pending Windows F5 acceptance and release.

## Purpose

The local verification assistant lets ReviewLume produce fresh, repository-bound test evidence without giving ChatGPT a terminal or an arbitrary command tool.

The model cannot start, retry, alter, or compose a process. A user first approves fixed rules in VS Code. ReviewLume then runs those rules locally before a ChatGPT connection opens, and ChatGPT can read only the completed, sanitized evidence.

## Security Model

The feature deliberately separates execution from MCP:

1. **VS Code approval plane**
   - Requires a Trusted Workspace.
   - Binds one approval to one canonical Git repository.
   - Shows the executable, fixed argument prefix, target mode, timeout, and risk warning.
   - Stores the approval in VS Code global state, not in the repository.

2. **Local execution plane**
   - Uses `spawn(executable, argv)` with `shell: false`.
   - Does not execute package scripts, AI responses, repository instructions, test output, or free-form command text.
   - Uses only repository-local Vitest, Jest, Mocha, Node test, and TypeScript entry points discovered from fixed locations.
   - Never uses `npx` or downloads a runner.
   - Runs with a reduced environment, bounded output, timeout, cancellation, and process-tree termination.

3. **Read-only MCP evidence plane**
   - `verification_status` reads the latest result and whether it still matches the current workspace.
   - `read_verification_output` reads a bounded, sanitized line range from a completed step.
   - Both tools are read-only, non-destructive, idempotent, and closed-world.
   - Both explicitly report `mcpCanStartProcesses: false`.

ReviewLume does not expose `run_command`, shell, terminal, write, delete, patch, or Git-mutation MCP tools.

## One Approval, Automatic New Tests

Approval applies to a fixed rule, not to a fixed list of files. For example, a user may approve:

```text
Executable: VS Code's trusted Node/Electron runtime
Fixed runner: <repository>/node_modules/mocha/bin/mocha.js
Fixed arguments: --timeout 15000
Target mode: newly added or modified test files
Timeout: 10 minutes
```

On every run, ReviewLume reads staged, unstaged, and non-ignored untracked Git changes. New or modified files matching supported test patterns are appended as separate argv entries. Adding another matching test does not require another approval.

Approval becomes invalid when the execution boundary changes, including:

- the repository changes;
- the runner disappears or resolves outside the repository;
- the executable, fixed arguments, target mode, or timeout changes;
- relevant `package.json`, test-runner configuration, or TypeScript configuration changes.

Content changes inside ordinary test files do not invalidate the rule; they are the intended dynamic targets.

## Supported Discovery

The first implementation discovers only fixed repository-local Node ecosystem runners:

- Vitest: `node_modules/vitest/vitest.mjs`
- Jest: `node_modules/jest/bin/jest.js`
- Mocha: `node_modules/mocha/bin/mocha.js`
- Node test runner when repository configuration explicitly references `node --test`
- TypeScript: `node_modules/typescript/bin/tsc --noEmit --pretty false`
- JavaScript syntax: `node --check`, once per changed `.js`, `.cjs`, or `.mjs` file

ReviewLume does not infer or run arbitrary `package.json` scripts. Python, Maven, Gradle, .NET, Go, custom integration environments, containers, databases, and user-defined commands are not part of this first release.

## Test Target Patterns

Changed files can be recognized as tests when they match common patterns such as:

- `test/`, `tests/`, or `__tests__/` directories;
- `*.test.js`, `*.test.ts`, `*.spec.js`, `*.spec.ts`, and related JS/TS variants;
- `test_*.py` and `*_test.py`;
- `*_test.go`;
- `*Test.java`, `*Tests.kt`, or equivalent recognized names.

Only existing regular files inside the bound repository are passed to a runner. Absolute paths, `.git`, parent traversal, and symlink escapes are rejected.

## Evidence and Staleness

Before and after a run, ReviewLume captures:

- HEAD SHA;
- staged and unstaged Git name/status data with external diff and text conversion disabled;
- bounded fingerprints for changed tracked and non-ignored untracked files, with a per-file and total content-hash budget;
- the list of changed files supplied to verification discovery.

The stored result is marked stale when the current fingerprint differs. A result also records whether the repository changed while the process was running.

A successful process is not reported as a successful test run when the runner explicitly reports zero or no matching tests. That result is `inconclusive`.

## Local Storage and Output

ReviewLume stores:

- the approved rule set in VS Code global state;
- the latest verification result and sanitized output in VS Code global storage.

It does not write verification configuration or output into the selected repository.

Output handling includes:

- a configurable byte limit per step;
- ANSI control-sequence removal;
- redaction of common Authorization, bearer-token, URL credential, API-key, password, private-key, OpenAI-key, and JWT patterns;
- bounded line-range reads through MCP.

Redaction is best-effort, not a guarantee that every secret or personal value will be detected. Users must not run or send sensitive test output they are not authorized to provide to OpenAI.

## User Commands

- `ReviewLume: Configure Local Verification`
- `ReviewLume: Run Approved Local Verification`
- `ReviewLume: Clear Local Verification Approval`

Settings:

- `reviewlume.verification.runOnConnect`
- `reviewlume.verification.maxOutputBytes`

When `runOnConnect` is enabled, ReviewLume runs an existing valid approval before opening the MCP/Tunnel connection. If no approval exists, the user can configure one or connect without verification.

## Important Limitations

Tests are executable repository code. Even when ReviewLume itself uses a fixed no-shell launcher, a test runner or test file may modify files, start child processes, access the network, read environment data, or contact local services. ReviewLume warns before approval and detects repository changes, but it is not a sandbox.

The feature does not claim that a passing command proves test quality, coverage, isolation, or absence of side effects. It provides bounded evidence of what was actually invoked and observed.
