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

Local Verification 仍只属于 direct Git Project；0.3.3 同时要求保留 0.3.1 的 nested package runner / schema-2 approval 行为。

## 2. 自动测试要求

MCP 必须覆盖：

- Git / Folder definitions 完全一致；
- Folder `project_summary` 报告稳定 capability set；
- Folder nested Git discovery 与 exact selector；
- Folder root 不产生 aggregate Git state；
- traversal / absolute / drive / UNC / `.git` / outside-root / alias / non-repo rejection；
- Folder file list/read/search boundary；
- direct Git query 不需要 `repository` selector；
- direct Git 传入非空 Folder-style `repository` 时拒绝；
- Folder verification evidence calls 返回 unavailable，并且不启动进程；
- Git verification evidence 保持 read-only；
- Workspace Trust、multi-root single selection、identity semantics 不回归；
- P8 Advanced workflow 不被 Folder Project Support 改写。

Local Verification 必须覆盖：

- schema version 2 与旧 approval 失效；
- bounded nested package-root discovery；
- package-local 与 repository-hoisted runner；
- repository-relative `workingDirectory`；
- package-relative changed-test argv；
- cross-package test exclusion；
- config / lockfile / runner / cwd boundary invalidation；
- syntax-only 与 test/typecheck warning；
- no-shell execution、zero-test、cancel、timeout、stale、redaction。

## 3. CI 门禁

Final head 必须通过：

- Ubuntu Node 20；
- Ubuntu Node 22；
- Windows Node 22；
- macOS Node 22。

每个平台执行 install、lint、TypeScript typecheck、tests、browser-extension validation、build、VSIX package、artifact upload、VSIX content validation。

VSIX content validation 还必须要求最终包包含 Folder Project runtime、stable connector runtime、Local Verification approval/schema-2/nested-runner runtime，并继续排除源码、tests、source maps、旧 browser bridge runtime 和敏感文件。

CI 失败必须读取具体 job/step log，并区分代码、测试、环境、外部服务或权限问题。

## 4. 已完成的稳定工具实机验收

此前 Windows 实测已确认：

- `fbs` 作为 Folder Project 连接；
- ChatGPT 实际暴露 11 个稳定工具；
- `list_git_repositories` 独立发现多个 child repositories；
- child `fbs-ui` status / commits 独立读取；
- Folder `verification_status` 存在但返回 unavailable；
- parent traversal 和 `.git/config` direct read 被拒绝；
- 不 Refresh / Scan Tools / 重建 App，从 Folder 切到 direct Git 后仍保持同一 11-tool contract；
- direct Git Git-tools 无需 `repository` 参数；
- direct Git `verification_status` 报告 `mcpCanStartProcesses: false`，MCP 调用没有启动验证。

这些结果证明 stable tool contract / Folder boundary 的行为设计成立，但它们来自 0.3.2 开发线的候选包。

## 5. 0.3.3 最终人工验收仍待完成

0.3.3 在 0.3.2 之后重新合入了 0.3.1 Local Verification nested-runner 代码，因此最终字节级 0.3.3 VSIX 仍需要 Windows install/smoke acceptance，至少确认：

- 覆盖安装与启动正常；
- nested package rule、cwd、package-relative argv 正常；
- repository-hoisted runner 正常；
- cross-package tests 不混入；
- schema-1 旧 approval 失效；
- approval warning / Cancel UI 正确；
- stable 11 tools 与 Folder unavailable behavior 没有被 integration 回归。

完整项目见 [Local Verification Acceptance](local-verification-acceptance.md)。未执行的项目必须标为 pending / not-applicable，不能沿用旧候选包结果伪装 final artifact 已验收。

## 6. 发布门禁

只有全部满足后才能合并/正式收口：

- final head 四平台 CI 全绿；
- lint/typecheck/tests/build/VSIX validation 全绿；
- 最终代码复核无未处理高风险问题；
- README、architecture、user guide、privacy、security、Marketplace/publishing/release 文档与真实 runtime 一致；
- 最终 0.3.3 Windows install/smoke acceptance 完成；
- PR 不再是 Draft；
- 不存在浏览器桥接、跨 root Multi Project Registry 或 Folder Verification execution 越界实现。
