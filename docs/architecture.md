# 系统架构

## 1. 当前总体架构

ReviewLume 当前公开主连接能力是隐私优先、只读优先的 MCP 项目连接器。一次 connection 只绑定一个 Trusted Workspace 中选定的 canonical outer Project Root。

```text
ChatGPT custom app / connector
        │
        │ OpenAI Secure MCP Tunnel
        ▼
ReviewLume VS Code Extension
        │
        ├─ ProjectContext
        │   ├─ Git Project
        │   └─ Folder Project
        │
        ├─ StableProjectTools
        ├─ McpConnectorServer
        └─ SecureMcpTunnelService
```

当前 Folder Project Support 属于 P8 二次复核闭环的只读能力扩展，不开始可选浏览器桥接，也不改变阶段编号。

## 2. ProjectContext

```text
ProjectContext
├── root
├── displayName
└── kind: git | folder
```

解析流程：

1. canonicalize 用户选择的 Workspace Folder；
2. Workspace 必须 Trusted；
3. 使用只读 Git runner 尝试 `git rev-parse --show-toplevel`；
4. 成功则使用 canonical Git top-level，`kind = git`；
5. 不存在可用 Git root 或 Git discovery 不可用时，使用 canonical Workspace Folder，`kind = folder`。

Folder root 不会被伪造成 Git repository，也不会生成假的 branch、HEAD、status 或 history。

## 3. StableProjectTools

`McpConnectorService` 不再因为 Project Kind 改变公开 tool contract。连接时统一创建 `StableProjectTools`，并把它交给 `McpConnectorServer`。

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

公开工具名和 input schema 在 Git / Folder 之间保持一致。Project-specific 行为在 `StableProjectTools.call()` 中做 runtime gate。

### Git delegate

Git mode 委托给 `RepositoryIdentityTools` / `McpRepositoryTools`：

- Git query 直接针对当前连接的 Git root；
- `repository` selector 必须省略；
- `list_git_repositories` 返回当前 root 已经是 Git Project；
- verification evidence 仍使用 direct-Git repository-bound reader。

### Folder delegate

Folder mode 委托给 `McpFolderProjectTools`：

- Folder-wide 文件读取/搜索覆盖授权 outer root；
- `list_git_repositories` 有界发现真实 child Git repositories；
- 四个 Git query 在运行时要求精确 `repository` selector；
- outer Folder root 没有 aggregate Git history；
- verification evidence 两个工具名仍存在，但调用直接返回 unavailable。

`McpFolderProjectTools.definitions` 可以保留其内部 delegate 专用 9-tool 视图；公开 MCP server 经 `McpConnectorService` 使用的是 `StableProjectTools.definitions` 的稳定 11-tool contract。

## 4. McpConnectorServer

实现 stateless Streamable HTTP JSON-RPC：

- `initialize`
- `notifications/initialized`
- `ping`
- `tools/list`
- `tools/call`
- `notifications/cancelled`

网络与认证：

- 仅监听 `127.0.0.1` 随机端口；
- 每次启动生成新的本地 Token；
- 支持本地 Bearer 与 Secure MCP Tunnel 专用 header；
- 限制 Origin、Content-Type、request size、concurrency 与 call rate；
- stop/dispose 后 endpoint 与 Token 失效。

`tools/list` 对真实连接始终来自 `StableProjectTools.definitions`。

## 5. Git Project read boundary

Git Project 复用既有 `McpRepositoryTools`：

- read-only Git allowlist；
- 参数数组，不拼接 shell command；
- external diff/textconv disabled；
- commit/ref validation；
- remote URL sanitization；
- repository-relative file boundary；
- bounded file/diff/search results。

Git Project 为保持现有兼容语义，不新增 Folder direct-file 的 filename denylist。

## 6. Folder Project file boundary

Folder-wide file tools 使用 Node filesystem API 做 bounded enumeration，不依赖 `git ls-files`：

- canonical outer root；
- 最多 20,000 visited entries；
- 最多 5,000 candidate files；
- bounded depth；
- 不跟随 symlink/junction-like entries；
- 每个 realpath 必须留在 root；
- 跳过 VCS、dependency、build、cache 与常见 credential-store 目录；
- `read_file` 拒绝 absolute / drive / UNC / parent traversal / direct `.git` / outside-root / directory / binary / oversize；
- Folder direct-file policy 对明显 sensitive path 更保守，但不是内容 DLP。

## 7. Folder Nested Git

`discoverNestedGitRepositories()` 使用独立预算：

- 最多 64 repositories；
- 最多 20,000 entries；
- 最大 depth 32；
- candidate 需要本地非 symlink `.git` marker；
- `rev-parse --show-toplevel` 必须回到 candidate；
- `rev-parse --absolute-git-dir` 必须留在 outer root；
- external git-dir、outside-root、symlink/junction escape 拒绝。

Nested selector：

- 必须精确匹配 discovery 返回的 Folder-relative path；
- absolute / drive / UNC / `..` / `.` / `.git` / ordinary non-repository / alias selector 拒绝。

通过后新建 child-scoped `McpRepositoryTools`，继续复用既有 Git read-only safeguards。

## 8. Local Verification gate

Local Verification 仍是 direct Git Project-only 的 repository-bound 安全模型。

连接启动：

- `kind === git` 且 verification service 可用时，才允许走既有 `runOnConnect()`；
- `kind === folder` 时不 discovery、不运行 verification；
- Folder nested Git discovery/query 不触发验证；
- stable public contract 仍广告 `verification_status` 与 `read_verification_output`；
- Folder 调用直接返回 unavailable，不启动任何进程。

MCP evidence tools 从不获得 process-start authority。

## 9. P8 Advanced

P8 Advanced Review Pack、SecretScanner、History、Report、issue state、implementation prompt/summary、re-review/comparison 继续保持 Git-oriented workflow。Folder Project Support 不修改这些状态机。

## 10. 发布门禁

Final head 必须：

- lint / TypeScript typecheck / tests / build 全绿；
- Windows Node 22、macOS Node 22、Ubuntu Node 20/22 CI 全绿；
- VSIX package 与 package-content validation 通过；
- visible VS Code interaction 完成 Windows 人工验收；
- stable 11-tool contract 的 Folder ↔ Git 实机切换通过；
- 文档与 runtime 一致；
- PR 非 Draft；
- 最终代码复核无未处理高风险问题。
