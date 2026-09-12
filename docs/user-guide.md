# 用户指南

ReviewLume 一次只连接一个 Trusted Workspace 中选定的 Project Root，并自动识别为 Git Project 或 Folder Project。

## 稳定工具契约

两种 Project Kind 固定暴露同一组 11 个只读工具：

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

Project Kind 只改变运行时语义，不改变公开工具列表。

## Git Project

Git query 直接针对当前 Git root，`repository` 参数必须省略。`list_git_repositories` 会说明当前 root 已经是 Git Project。Local Verification evidence tools 只读取已完成结果，不能启动验证进程。

## Folder Project

Folder root 没有 aggregate Git history。先用 `list_git_repositories` 找到真实 child repository，再把 discovery 返回的精确 Folder-relative path 传给 `repository_summary`、`git_status`、`recent_commits` 或 `get_diff`。

多个 child repositories 不会被合成一个 branch、HEAD、status、history 或 diff。

为保持 ChatGPT schema 稳定，Folder mode 仍暴露 `verification_status` 和 `read_verification_output`，但调用会返回 unavailable；Folder mode 不 discovery、不运行 Local Verification。

从旧 7/9-tool App 快照迁移到当前 contract 时需要 Refresh / Scan Tools 一次。完成迁移后，正常 Git ↔ Folder 切换不需要重复刷新或重建 App。

## 只读边界

ReviewLume 不提供 MCP shell、terminal、任意命令、写文件、删除文件、patch apply、Git mutation 或 general process-start 能力。一次 connection 只绑定一个 canonical outer Project Root。

## P8

Folder Project Support 属于当前 P8 二次复核闭环的只读能力扩展，不开始可选浏览器桥接。P8 Advanced Review Pack、History、问题状态、实施提示、修复摘要和二次复核能力继续保留。

## 相关文档

- [Secure MCP 配置](chatgpt-secure-mcp-setup.md)
- [Stable MCP Tool Contract](stable-mcp-tool-contract.md)
- [Folder Project Support](folder-project-support.md)
- [系统架构](architecture.md)
- [安全与合规边界](security-and-compliance.md)
- [测试与验收](test-and-verification.md)
