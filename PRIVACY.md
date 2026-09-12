# ReviewLume Privacy Policy

Last updated: 2026-09-12

## Overview

ReviewLume is a privacy-aware VS Code extension that connects one selected local Project Root to ChatGPT through a controlled, read-only MCP server and the official OpenAI Secure MCP Tunnel.

A connected project is either a direct Git Project or a Folder Project. One connection always binds one canonical outer Project Root.

Current Folder Project Support is part of the P8 read-only review loop. It does not start the optional browser bridge.

## Data ReviewLume does not collect

ReviewLume does not operate a project-data relay service and does not collect telemetry or analytics. It does not read ChatGPT conversations or browser state.

Project data leaves the machine only when the user explicitly starts the connection, enables the ReviewLume App in ChatGPT, and a ReviewLume tool is called.

## Stable MCP Tool Contract

Git Project and Folder Project advertise the same 11 read-only tool names and public input schemas:

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

Project Kind changes runtime behavior, not the public tool list.

### Git Project

Git queries target the connected repository directly. Local Verification evidence tools can read completed results when repository-bound Local Verification is available. Those tools cannot start or alter verification processes.

### Folder Project

Folder-wide file tools can inspect the authorized Folder root subject to path, link, file-type, count and result-size limits.

`list_git_repositories` can discover bounded real child repositories inside that root. Git query tools operate only on one explicitly selected discovery result at a time. ReviewLume does not create aggregate Git history for the Folder root.

For schema stability, Folder mode still advertises `verification_status` and `read_verification_output`, but those calls return unavailable. Folder mode does not discover or run Local Verification and does not expose child-repository verification evidence.

## File and Git privacy boundaries

All project file reads must remain inside the connected canonical root and are bounded by path, type and size checks.

Folder direct-file tools use a more conservative filesystem enumeration policy and skip common VCS, dependency, build and cache trees. This is not content DLP and ordinary source/config files can still contain sensitive information.

Git Project and explicitly selected nested Git queries preserve existing read-only Git semantics. A tracked path, commit subject, status entry or diff may contain sensitive-looking data. Users must review and sanitize projects before connecting them.

## Local Verification

Local Verification remains direct-Git-only and user-controlled. Approval remains repository-bound and evidence tools are read-only.

Tests are executable project code and can have side effects. ReviewLume is not a sandbox.

Folder mode never runs Local Verification.

## P8 Advanced workflow

P8 Advanced Review Packs, history, issue state and re-review remain local Git-oriented workflows. Their SecretScanner/export gates do not automatically filter ordinary MCP tool calls or Local Verification evidence.

## User responsibilities

Users should connect only projects they are authorized to share with OpenAI and should remove or redact sensitive data before connecting. Stop the connection when review is complete.

ReviewLume is an independent open-source project and is not affiliated with or endorsed by OpenAI, Microsoft, Anthropic, Google or other service providers.
