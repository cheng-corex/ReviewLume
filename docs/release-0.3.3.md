# ReviewLume 0.3.3 Preview

0.3.3 is the corrective follow-up to 0.3.2.

It combines both previously separated development lines:

- the 0.3.1 Local Verification fixes for bounded nested package roots, package working directories, repository-hoisted runners, package-relative changed-test argv, schema-2 approval fingerprints, and accurate approval UI; and
- the 0.3.2 Folder Project support plus the stable 11-tool Git/Folder MCP contract.

## Stable MCP contract

Both direct Git Project and Folder Project advertise:

```text
project_summary
list_git_repositories
repository_summary
git_status
recent_commits
get_diff
list_files
read_file
search_code
verification_status
read_verification_output
```

Folder verification evidence calls return unavailable and never start Local Verification. Direct Git evidence calls remain read-only and cannot start processes.

## Local Verification restored from 0.3.1

The 0.3.3 code line again includes:

- approval schema version 2;
- bounded discovery of nested Node package roots;
- package-local and valid repository-hoisted runners;
- repository-relative approved `workingDirectory`;
- package-relative test argv and cross-package exclusion;
- no-shell execution with fixed executable/argv;
- syntax-specific versus repository-code-execution warnings;
- VS Code native cancel behavior without a duplicate explicit Cancel action.

## 0.3.2 note

0.3.2 was published before the Folder Project branch had incorporated the already-published 0.3.1 Local Verification fixes. 0.3.3 is intended to supersede it.

## Release gate

This document does not claim the final 0.3.3 artifact is released yet. Before upload, record the exact final head, four-platform CI run, Windows artifact ID, VSIX size/SHA-256, package-content audit, and final combined-artifact Windows smoke/acceptance result.
