# ReviewLume

> 面向 VS Code 的隐私优先、只读优先 ChatGPT 项目连接器，并为 direct Git Project 提供可选的用户授权 Local Verification。

ReviewLume 把当前 VS Code 中选定的一个本地项目通过受控、只读 MCP 工具连接给 ChatGPT。项目可以是 Git repository，也可以是普通 Workspace Folder。Git 是增强能力，不是 MCP 连接前置条件。

当前 Folder Project Support 属于 **P8 二次复核闭环**的只读能力扩展，不启动可选浏览器桥接。

## Project Context

一次 ReviewLume MCP connection 只绑定一个 canonical outer Project Root：

```text
Project Context
├── Git Project
└── Folder Project
```

连接时自动检测 Project Kind；多 Workspace Folder 时仍只选择一个 root，不会合并多个 outer roots。

## Stable MCP Tool Contract

Git Project 与 Folder Project 固定暴露同一组 **11 个只读工具**，名称和公开 input schema 保持一致：

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

项目类型只改变运行时语义，不改变公开工具列表。

### Git Project

Git query 直接针对当前连接的 Git root，`repository` selector 必须省略。`list_git_repositories` 会说明当前 root 已经是 Git Project。

`verification_status` 与 `read_verification_output` 只读取已完成的 Local Verification evidence，不能启动、重试或修改验证进程。

### Folder Project

Folder root 没有 aggregate Git history。`list_git_repositories` 有界发现授权 root 内的真实 child repositories；`repository_summary`、`git_status`、`recent_commits` 和 `get_diff` 在 Folder mode 下必须显式传入 discovery 返回的精确 Folder-relative `repository` path。

多个 child repositories 不会被合成 synthetic branch、HEAD、status、history 或 diff。

为保持 ChatGPT schema 稳定，Folder mode 仍暴露 `verification_status` 与 `read_verification_output` 两个工具名，但调用会返回 unavailable。Folder mode 不 discovery、不运行 Local Verification，也不会暴露 child repository 的验证 evidence。

从早期 7/9-tool App 快照迁移到当前 11-tool contract 时只需要 Refresh / Scan Tools 一次；之后正常 Git ↔ Folder 切换不需要重复刷新或重建 App。

## Read-only boundary

ReviewLume 不提供 MCP shell、terminal、任意命令、文件写入/删除、patch apply、Git mutation 或 general process-start 能力。项目文件和 AI 回复始终是不可信输入，不能扩大工具权限。

Folder direct-file 工具使用 bounded filesystem enumeration，并执行 canonical root、路径、文件类型与结果大小限制。Nested Git 复用既有 read-only Git allowlist，并要求 Git top-level 与 Git metadata 都留在授权 Folder root 内。

## Local Verification

Local Verification 仍只属于 direct Git Project，并由 VS Code 用户授权。Folder Project 不运行验证；如需验证某个 child repository，应把它直接作为 Git Project 连接。

Local Verification 不是 ChatGPT 终端，也不是通用 MCP execution tool。MCP evidence tools 只读取已经完成的结果。

## P8 Advanced

现有 P8 Advanced Git-oriented 工作流继续保留，包括 Review Pack、敏感内容扫描、回答导入、Review History、问题状态、实施提示、修复摘要和二次复核结果对比。

Folder Project Support 不改变阶段编号，也不开始浏览器桥接。

## 首次使用

完整配置与日常连接说明见：

- [ChatGPT 与 OpenAI Secure MCP Tunnel 配置指南](docs/chatgpt-secure-mcp-setup.md)
- [Stable MCP Tool Contract](docs/stable-mcp-tool-contract.md)
- [Folder Project Support](docs/folder-project-support.md)

## 发布门禁

发布前必须满足 final head 的 lint、TypeScript typecheck、tests、build、四平台 CI、VSIX packaging/content validation；涉及 VS Code UI/交互时还必须完成人工验收，并保证文档与最终 runtime 一致。

## 更多文档

- [用户指南](docs/user-guide.md)
- [系统架构](docs/architecture.md)
- [安全与合规边界](docs/security-and-compliance.md)
- [测试与验收](docs/test-and-verification.md)
- [PRIVACY.md](PRIVACY.md)
- [SECURITY.md](SECURITY.md)

ReviewLume 是独立开源项目，与 OpenAI、Microsoft、Anthropic、Google 或其他服务商没有隶属或背书关系。
