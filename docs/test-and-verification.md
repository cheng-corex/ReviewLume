# 测试与验收

## 1. 当前测试模型

ReviewLume 当前只读 MCP 支持 Git Project 与 Folder Project。两种 Project Kind 公开暴露相同的 11-tool contract，Project-specific 行为在运行时 gate。

稳定工具列表：

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

## 2. 自动测试要求

必须覆盖：

- Git / Folder definitions 完全一致；
- Folder `project_summary` 报告稳定 capability set；
- Folder nested Git discovery 与 exact selector；
- Folder root 不产生 aggregate Git state；
- traversal / absolute / drive / UNC / `.git` / outside-root / alias / non-repo rejection；
- Folder file list/read/search 的 boundary；
- direct Git query 不需要 `repository` selector；
- direct Git 传入非空 Folder-style `repository` 时拒绝；
- Folder `verification_status` / `read_verification_output` 返回 unavailable，并且不启动进程；
- Git verification evidence 保持 read-only；
- Workspace Trust、multi-root single selection、identity semantics 不回归；
- P8 Advanced workflow 不被 Folder Project Support 改写。

## 3. CI 门禁

Final head 必须通过：

- Ubuntu Node 20；
- Ubuntu Node 22；
- Windows Node 22；
- macOS Node 22。

每个平台执行：install、lint、TypeScript typecheck、tests、browser-extension validation、build、VSIX package、artifact upload、VSIX content validation。

CI 失败必须读取具体 job/step log，并区分代码、测试、环境、外部服务或权限问题。

## 4. Windows 人工验收

本轮已完成的关键实机验收包括：

- `fbs` 作为 Folder Project 连接；
- ChatGPT 实际暴露 11 个稳定工具；
- `list_git_repositories` 独立发现 `fbs-iot-ui`、`fbs-lowcode`、`fbs-ui`；
- child `fbs-ui` 的 status / commits 独立读取；
- Folder `verification_status` 实际暴露但返回 Local Verification unavailable；
- `../ReviewLume/README.md` 越界读取拒绝；
- `fbs-ui/.git/config` direct read 拒绝；
- 不 Refresh / Scan Tools / 重建 App 的情况下，从 `fbs · Folder` 切到 direct `fbs-ui · Git` 后仍保持同一 11-tool contract；
- direct Git `repository_summary` / `git_status` / `recent_commits` 无需 `repository` 参数；
- direct Git `list_git_repositories` 正确说明无需 nested selection；
- direct Git `verification_status` 返回 `not-configured` 且 `mcpCanStartProcesses: false`，MCP 调用没有启动验证。

## 5. 发布门禁

只有全部满足后才能合并/发布：

- final head 四平台 CI 全绿；
- lint/typecheck/tests/build/VSIX validation 全绿；
- 最终代码复核无未处理高风险问题；
- README、architecture、user guide、privacy、security、MCP setup/plan 与真实代码一致；
- Windows Git + Folder + nested Git 实机验收完成；
- PR 不再是 Draft；
- 不存在浏览器桥接、跨 root Multi Project Registry 或 Folder Verification execution 越界实现。
