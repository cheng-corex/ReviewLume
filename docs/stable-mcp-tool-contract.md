# Stable MCP Tool Contract

ReviewLume advertises the same 11 read-only MCP tool names and public input schemas for both Git Project and Folder Project connections:

- `project_summary`
- `list_git_repositories`
- `repository_summary`
- `git_status`
- `recent_commits`
- `get_diff`
- `list_files`
- `read_file`
- `search_code`
- `verification_status`
- `read_verification_output`

The stable contract prevents stale ChatGPT tool snapshots when the same Tunnel switches project kind.

For a direct Git Project, Git query tools target the connected root and the optional `repository` selector must be omitted.

For a Folder Project, `list_git_repositories` discovers bounded nested repositories and the four Git query tools require one exact Folder-relative repository path returned by discovery.

Folder Project never discovers or runs Local Verification. Its two verification evidence calls return unavailable without starting a process or exposing child-repository verification results.

After migrating an older 7-tool or 9-tool ChatGPT app snapshot to this 11-tool contract once, routine Git/Folder switching should not require deleting or recreating the app. A rescan is needed only when a future ReviewLume release changes the stable public tool contract itself.
