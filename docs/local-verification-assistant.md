# ReviewLume Local Verification Assistant

Status: implemented for direct Git Projects. The combined 0.3.3 release candidate carries the nested-package fixes from 0.3.1 together with Folder Project support and the stable 11-tool MCP contract.

## Purpose

Local Verification lets ReviewLume produce fresh repository-bound evidence without giving ChatGPT a terminal or arbitrary command tool. Execution is controlled from VS Code; MCP can only read completed evidence for a direct Git Project.

Folder Projects do not run Local Verification. Their stable verification tool names return unavailable and expose no child-repository evidence.

## Security model

### VS Code approval plane

- Trusted Workspace required.
- One approval binds one canonical direct Git repository.
- Current approval schema is version 2.
- Every rule records executable, fixed argv prefix, repository-relative package `workingDirectory`, target mode, timeout, and an approval fingerprint.
- The fingerprint includes relevant package/config files, root/package lockfiles, and repository-local runner content.
- Older approvals that did not bind the package working directory are invalidated.
- Approval data is stored in VS Code global state rather than the repository.

### Local execution plane

- Uses executable/argv with `shell: false`.
- Does not execute arbitrary `package.json` scripts, `npx`, downloaded runners, AI responses, repository instructions, process output, or free-form commands.
- Applies canonical repository/package path checks to cwd, runner, and targets.
- Uses bounded output, reduced environment, timeout, cancellation, process-tree termination, and stale-result tracking.
- Test code remains untrusted executable repository code; ReviewLume is not a sandbox.

### Read-only MCP evidence plane

The stable project contract includes:

- `verification_status`
- `read_verification_output`

For direct Git Projects these tools can read completed bounded/sanitized evidence and explicitly report that MCP cannot start processes. For Folder Projects the same names are advertised only for schema stability and calls return unavailable.

## Bounded package-root discovery

ReviewLume no longer assumes every supported Node runner lives at the repository root. Discovery scans package roots within fixed limits:

- maximum 2,500 visited directories;
- maximum depth 5;
- maximum 64 package roots;
- skip `.git`, `node_modules`, build/dist/coverage/cache/target/vendor and similar generated trees;
- do not traverse directory symlinks/junction-like entries.

A package root is a bounded in-repository directory containing a readable `package.json`.

## Supported runners

For each discovered package, ReviewLume can resolve supported runners from the package itself or from a valid ancestor inside the same canonical repository, allowing ordinary dependency-hoisting layouts.

Supported fixed entry points include:

- Vitest;
- Jest;
- Mocha;
- Node test runner when package configuration explicitly references `node --test`;
- TypeScript compiler with `--noEmit --pretty false` when the package has `tsconfig.json`;
- per-file `node --check` for changed `.js`, `.cjs`, and `.mjs` files.

ReviewLume does not infer or run arbitrary scripts. Python, Maven, Gradle, .NET, Go, containers, databases, and user-defined free-form commands are not Local Verification execution targets.

## Package working directory and changed targets

Each approved package rule records a repository-relative `workingDirectory`, for example `server`.

Changed files are discovered from Git at the repository level, then filtered to the approved package root. Matching package tests are converted to package-relative argv before runner invocation:

```text
repository file: server/test/runtime/a.test.js
approved cwd:    server
runner argv:     test/runtime/a.test.js
```

A matching test in another package/root is not passed to this runner. Adding or editing ordinary matching tests does not require per-file approval; changing the approved execution boundary does.

## Approval invalidation

Approval becomes invalid when relevant execution-boundary material changes, including:

- repository identity;
- package working directory availability;
- runner path/content or a runner resolving outside the repository;
- executable/fixed args/target mode/timeout;
- package configuration or relevant test/TypeScript configuration;
- root or package lockfile fingerprints.

Ordinary test-content changes are dynamic targets and do not by themselves invalidate the fixed rule.

## Approval UI

The approval picker/details display the package cwd and fixed command.

- Syntax-only `node --check` wording states that changed files are parsed without executing their contents.
- Test/typecheck wording states that repository tooling/code may execute and may modify files, access the network, or contact local services.
- There is no duplicate explicit English `Cancel` action; cancellation uses VS Code's native localized modal behavior.

## Evidence and staleness

Before and after execution ReviewLume records a bounded workspace snapshot including HEAD and changed-file fingerprints. A result becomes stale when the current workspace no longer matches recorded evidence, and a run records whether the repository changed while processes were running.

Explicit runner output indicating zero/no matching tests is `inconclusive`, not passed.

## Storage and output

ReviewLume stores the latest approval/result in extension storage, not in the repository. Output handling includes:

- configurable bounded bytes per step;
- ANSI/control-sequence cleanup;
- best-effort redaction for common Authorization/Bearer, URL credential, API-key/password, private-key, OpenAI-key, and JWT patterns;
- bounded line-range reads through MCP.

Redaction is best-effort, not complete DLP. Users must not run or share sensitive test output they are not authorized to provide to OpenAI.

## User commands and settings

Commands:

- `ReviewLume: Configure Local Verification`
- `ReviewLume: Run Approved Local Verification`
- `ReviewLume: Clear Local Verification Approval`

Settings:

- `reviewlume.verification.runOnConnect`
- `reviewlume.verification.maxOutputBytes`

When `runOnConnect` is enabled, an existing valid direct-Git approval may run before the connection opens. No approval means no Local Verification process starts unless the user configures one in VS Code.

## Folder Project boundary

Folder Project startup performs no Local Verification discovery or execution. Nested Git discovery also never triggers Local Verification. If a child repository needs verification, connect that child directly as a Git Project and use the normal approval flow.

This separation keeps the MCP surface read-only while preserving the stable 11-tool schema across Git and Folder project kinds.
