# ReviewLume 只读项目 MCP 计划（历史文件名）

> 本文件名保留历史命名。当前 Folder Project Support 与稳定 MCP 工具契约属于 **P8 二次复核闭环**的只读能力扩展，不代表开始 P9 可选浏览器桥接，也不改变路线阶段编号。

## 当前目标

ReviewLume 通过 VS Code + OpenAI Secure MCP Tunnel，把一个 Trusted Workspace 中选定的本地 Project Root 以只读 MCP 工具连接给 ChatGPT。

Project Context：

```text
Project Context
├── Git Project
└── Folder Project
```

一次连接只绑定一个 canonical outer Project Root。多 Workspace Folder 时仍只选择一个 root；不会把多个 root 合并成一个审核上下文。

## Stable MCP Tool Contract

Git Project 和 Folder Project 固定广告同一组 11 个只读工具，并保持相同公开 input schema：

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

项目类型只改变调用时语义，不改变公开工具列表。

### Git Project

- Git query 直接针对当前连接的 Git root；
- `repository` selector 必须省略；
- `list_git_repositories` 返回当前 root 已经是 Git Project，无需 nested selection；
- verification evidence tools 只读取已完成结果，不能启动进程。

### Folder Project

- outer Folder root 没有 aggregate Git history；
- `list_git_repositories` 有界发现授权 root 内真实 child repositories；
- `repository_summary`、`git_status`、`recent_commits`、`get_diff` 在 Folder mode 下运行时必须带一个 discovery 返回的精确 Folder-relative `repository` path；
- 多个 child repositories 不会被合成 synthetic branch/status/history/diff；
- `verification_status` / `read_verification_output` 工具名仍存在，但调用返回 unavailable；
- Folder mode 不 discovery、不运行 Local Verification，也不暴露 child repository verification evidence。

这样可以避免 ChatGPT 在同一 Tunnel/App 切换 Git ↔ Folder 时因为 tools/list 改变而保留 stale schema。旧 7/9-tool App 只需迁移时 Refresh / Scan Tools 一次；正常 Project Kind 切换不需要重复重建 App。

## Folder Project 文件边界

Folder file tools 使用 bounded filesystem enumeration：

- canonicalize outer root；
- 拒绝 absolute / drive / UNC / parent traversal / direct `.git` 路径；
- 不跟随 symlink/junction-like entry；
- realpath 必须留在 outer root；
- 跳过 VCS、常见 dependency/build/cache/credential-store 目录；
- 文件数、entry 数、深度、匹配数和返回大小有预算；
- direct-file policy 对明显 credential-like path 更保守，但不是内容 DLP。

## Nested Git 边界

Nested Git discovery：

- 最多 64 个 repositories；
- 最多 20,000 filesystem entries；
- 最大深度 32；
- candidate 必须有本地非 symlink `.git` marker；
- `git rev-parse --show-toplevel` 必须回到 candidate 自身；
- `git rev-parse --absolute-git-dir` 必须留在 outer Folder root；
- selector 必须精确匹配 discovery 返回值；
- absolute / drive / UNC / `..` / `.git` / ordinary non-repository / alias selector 拒绝。

通过 discovery 后，Git query 复用既有 read-only Git allowlist、参数数组、external diff/textconv 禁用、ref 校验、bounded result 和 remote URL sanitization。

## Local Verification

Local Verification 仍然只属于 direct Git Project，并保持既有 repository-bound approval / HEAD / working-tree / runner/config 绑定。

Folder Project：

- 不 discovery verification rules；
- 不运行 approved verification；
- 不自动验证 nested repositories；
- stable evidence tool names 只返回 unavailable；
- 不能通过 Folder mode 绕过 Git Project verification approval。

需要验证 child repository 时，应直接把它作为 Git Project 连接。

## 明确不实现

当前工作不包括：

- 浏览器 Cookie / Session / credential 读取；
- 网页注入或读取 ChatGPT 输入/回答；
- 第三方 AI 内部接口；
- 额度绕过；
- 自动修改用户代码；
- 自动 apply patch；
- 执行 AI 回复中的命令；
- general shell / terminal / arbitrary command MCP；
- 跨 outer Project Root 的 Multi Project Registry；
- Folder Project 自动运行 Local Verification。

## 验收门禁

合并前必须满足：

- final head 四平台 CI 全绿；
- lint / typecheck / tests / build / VSIX package & contents validation 全绿；
- Windows Git + Folder + nested Git 人工验收通过；
- 同一个 ChatGPT App 在 Folder → direct Git 切换时保持同一 11-tool contract；
- 文档与最终 runtime 一致；
- PR 不再是 Draft；
- 最终严格代码复核无未处理高风险问题。

详细实现与安全边界见：

- [Stable MCP Tool Contract](stable-mcp-tool-contract.md)
- [Folder Project Support](folder-project-support.md)
- [Secure MCP 配置](chatgpt-secure-mcp-setup.md)
- [安全与合规边界](security-and-compliance.md)
- [测试与验收](test-and-verification.md)
