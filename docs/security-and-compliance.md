# 安全与合规边界

## 1. 安全目标

ReviewLume 的公开 MCP 必须保持只读、最小权限，并且一次 connection 只绑定一个 canonical outer Project Root。项目文件和 AI 回复始终是不可信输入，不能扩大工具能力。

当前 Folder Project Support 属于 P8 二次复核闭环的只读能力扩展，不开始可选浏览器桥接。

## 2. Stable MCP Tool Contract

Git Project 与 Folder Project 固定暴露同一组 11 个只读工具：

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

Project Kind 只改变运行时语义，不改变公开工具名或 input schema。

### Git Project

- Git query 直接针对当前连接的 Git root；
- `repository` selector 必须省略；
- `list_git_repositories` 返回当前 root 已经是 Git Project；
- verification evidence tools 只读取已完成结果，不能启动或修改进程。

### Folder Project

- outer Folder root 没有 aggregate Git history；
- `list_git_repositories` 有界发现授权 root 内真实 child repositories；
- 四个 Git query 在运行时要求精确 `repository` selector；
- 多个 child repositories 不会被合成 synthetic Git state；
- `verification_status` 与 `read_verification_output` 工具名仍存在，但调用返回 unavailable；
- Folder mode 不 discovery、不运行 Local Verification，也不返回 child verification evidence。

## 3. Shared read-only boundary

所有 Project Kind：

- Workspace 必须 Trusted；
- local MCP 仅监听 loopback；
- 每次启动使用新的本地 token；
- project file 读取只允许 project-relative path；
- 拒绝 absolute / drive / UNC / parent traversal / direct `.git` / outside-root realpath；
- 拒绝 directory、binary、oversize file；
- 请求、文件数、匹配数、行数和返回字节数均有上限；
- 不提供 MCP shell、terminal、任意命令、write/delete/rename、patch apply、Git mutation 或 general process-start capability。

## 4. Folder file boundary

Folder-wide file tools 使用 bounded filesystem enumeration：

- 不跟随 symlink/junction-like entry；
- 每个 directory/file realpath 必须留在 canonical outer root；
- 跳过 VCS、dependency、build、cache 等无关树；
- 对明显高风险 direct-file path 采用更保守的 filename/path policy；
- 该策略不是内容 DLP。

## 5. Folder Nested Git boundary

Nested discovery：

- 最多 64 repositories；
- 最多 20,000 entries；
- 最大 depth 32；
- candidate 需要本地非 symlink `.git` marker；
- `rev-parse --show-toplevel` 必须回到 candidate；
- `rev-parse --absolute-git-dir` 必须留在 outer root；
- external git-dir 与 outside-root repository 拒绝。

Selector：

- 必须精确匹配 discovery 返回值；
- absolute / drive / UNC / `..` / `.` / `.git` / ordinary non-repository / alias selector 拒绝。

通过 discovery 后，child Git query 复用既有 read-only Git allowlist、参数数组、external diff/textconv 禁用、ref validation、bounded result 和 remote URL sanitization。

## 6. Local Verification boundary

Local Verification 仍只属于 direct Git Project，并保持 repository-bound approval / HEAD / working-tree / runner/config binding。

Folder mode：

- 不 discovery verification rules；
- 不运行 approved verification；
- nested Git discovery/query 不触发 verification；
- stable evidence tool names 只返回 unavailable；
- MCP 不能启动、重试、修改或拼接验证进程。

## 7. P8 Advanced boundary

P8 Review Pack、SecretScanner、History、issue state、implementation summary 和 re-review 继续保持既有 Git-oriented workflow。P8 的扫描与导出门禁不自动覆盖普通 MCP 调用或 Local Verification evidence。

## 8. 明确不实现

当前公开能力不包括：

- 自动修改用户项目代码；
- 自动应用补丁；
- 执行 AI 回复中的命令；
- 通用 shell / terminal / arbitrary command MCP；
- 跨 outer Project Root 的 Multi Project Registry；
- Folder Project 自动运行 Local Verification；
- 未经明确批准开始可选浏览器桥接。

## 9. 发布门禁

合并/发布前必须满足 final head 四平台 CI、lint、typecheck、tests、build、VSIX validation、Windows 人工验收、文档一致性与最终严格代码复核。
