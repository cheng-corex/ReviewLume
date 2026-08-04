# ReviewLume Local Verification Assistant

Status: ReviewLume 0.3.1 Preview candidate implemented on PR #28; pending final CI, VSIX audit, and Windows acceptance.

## Purpose

The local verification assistant produces fresh, repository-bound test evidence without giving ChatGPT a terminal or an arbitrary command tool. Users approve fixed rules in VS Code. ReviewLume runs those rules locally, and ChatGPT can only read completed, bounded, sanitized evidence.

## Security Model

The feature separates three planes:

1. **VS Code approval plane**
   - Requires a Trusted Workspace.
   - Binds one approval to one canonical Git repository.
   - Shows the executable, fixed argument prefix, repository-relative working directory, target mode, and risk warning.
   - Stores approval in VS Code global state, not in the repository.

2. **Local execution plane**
   - Uses `spawn(executable, argv)` with `shell: false`.
   - Does not execute arbitrary package scripts, AI responses, repository instructions, test output, or free-form command text.
   - Uses only supported repository-local Node ecosystem entry points.
   - Never invokes `npx` and never downloads a runner.
   - Uses a reduced environment, bounded output, timeout, cancellation, and process-tree termination.

3. **Read-only MCP evidence plane**
   - `verification_status` reads the latest result and whether it still matches the current workspace.
   - `read_verification_output` reads a bounded, sanitized line range from a completed step.
   - Both explicitly report `mcpCanStartProcesses: false`.

ReviewLume exposes no MCP `run_command`, shell, terminal, write, delete, patch, or Git-mutation tool.

## Nested Package and Monorepo Support

Version 0.3.1 discovers bounded package roots below the bound Git repository. It supports layouts such as:

```text
repository/
├─ package.json
├─ node_modules/
├─ server/
│  ├─ package.json
│  ├─ node_modules/
│  └─ test/
└─ client/
   ├─ package.json
   └─ src/
```

Discovery:

- scans at most 2,500 directories;
- scans at most five directory levels below the repository root;
- admits at most 64 package roots;
- skips `.git`, dependency, build, coverage, cache, and common generated-output directories;
- does not follow directory symbolic links during package discovery;
- accepts package-local runners and dependency-hoisted runners that still resolve inside the bound repository.

Each approved rule records a repository-relative working directory. A `server` Mocha rule runs with `cwd=server`; changed targets such as `server/test/a.test.js` are passed to that runner as `test/a.test.js`. Tests outside `server` are not passed to it.

## One Approval, Automatic New Tests

Approval applies to a fixed rule, not a fixed file list. On every run, ReviewLume reads staged, unstaged, and non-ignored untracked Git changes. New or modified files matching supported test patterns and belonging to the approved package root are appended as separate argv entries.

Adding or editing ordinary tests does not require another approval. Approval becomes invalid when the execution boundary changes, including:

- repository identity;
- plan schema;
- executable or fixed arguments;
- package working directory;
- target mode or timeout;
- package or root lockfile configuration;
- test-runner or TypeScript configuration;
- repository-local runner content or location.

The 0.3.1 plan schema is version 2. Approvals created by 0.3.0 are rejected and must be reviewed again because they did not record a package working directory.

## Supported Discovery

Supported fixed entry points:

- Vitest: package-local or repository-hoisted `node_modules/vitest/vitest.mjs`;
- Jest: package-local or repository-hoisted `node_modules/jest/bin/jest.js`;
- Mocha: package-local or repository-hoisted `node_modules/mocha/bin/mocha.js`;
- Node test runner when package configuration explicitly references `node --test`;
- TypeScript: package-local or repository-hoisted `node_modules/typescript/bin/tsc --noEmit --pretty false` when the package has `tsconfig.json`;
- JavaScript syntax: `node --check`, once per changed `.js`, `.cjs`, or `.mjs` file.

ReviewLume may inspect dependency declarations, known runner configuration files, and script text to identify the runner type, but it does not execute the package script itself.

Python, Maven, Gradle, .NET, Go, containers, databases, custom integration environments, and user-defined commands remain unsupported.

## Approval UI

The rule picker displays the working directory and exact fixed command. The modal contains only the affirmative action plus VS Code's native localized cancel action; ReviewLume does not add a second `Cancel` button.

Warnings match the selected rules:

- syntax-only selection states that `node --check` parses files without executing their contents;
- tests and type checks state that repository-local tooling may execute repository code and cause side effects.

## Test Target Patterns

Changed files are recognized as tests through common patterns including:

- `test/`, `tests/`, or `__tests__/` directories;
- `*.test.*` and `*.spec.*` JavaScript/TypeScript variants;
- `test_*.py`, `*_test.py`, and `*_test.go`;
- common Java, Kotlin, and C# test class names.

Only existing regular files inside both the bound repository and the approved package root are passed to a runner. Absolute paths, `.git`, parent traversal, and symbolic-link escapes are rejected.

## Evidence and Staleness

Before and after a run, ReviewLume captures:

- HEAD SHA;
- staged and unstaged Git name/status with external diff and text conversion disabled;
- bounded fingerprints for changed tracked and non-ignored untracked files;
- the changed-file list used by verification discovery.

A mismatched current fingerprint makes stored evidence `stale`. Explicit zero-test output is `inconclusive`, not `passed`.

## Local Storage and Output

ReviewLume stores approvals in VS Code global state and the latest bounded result in VS Code global storage. It does not write verification configuration or output into the selected repository.

Output is byte-limited, ANSI-cleaned, and redacted for common credential patterns on a best-effort basis. This is not a guarantee that every secret or personal value will be detected.

## Commands and Settings

Commands:

- `ReviewLume: Configure Local Verification`
- `ReviewLume: Run Approved Local Verification`
- `ReviewLume: Clear Local Verification Approval`

Settings:

- `reviewlume.verification.runOnConnect`
- `reviewlume.verification.maxOutputBytes`

When `runOnConnect` is enabled, a valid approval runs before the MCP/Tunnel connection opens. ChatGPT still cannot initiate, retry, alter, or compose the process.

## Limitations

Tests are untrusted executable repository code. A fixed no-shell launcher does not sandbox them: runners or tests may modify files, start child processes, access the network, read environment data, or contact local services. ReviewLume reports observed process evidence and repository changes; it does not prove test quality, isolation, coverage, or absence of side effects.
