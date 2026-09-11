# 系统架构

## 1. 当前总体架构

ReviewLume 的公开主连接能力是隐私优先、只读 MCP 项目连接器。一次连接只绑定一个受信任的本地 Project Root：

```text
┌─────────────────────────────────────────────┐
│ ChatGPT Web                                 │
│ Custom app / connector                     │
└──────────────────────┬──────────────────────┘
                       │ OpenAI managed connection
┌──────────────────────▼──────────────────────┐
│ OpenAI Secure MCP Tunnel control plane     │
└──────────────────────┬──────────────────────┘
                       │ outbound tunnel-client channel
┌──────────────────────▼──────────────────────┐
│ ReviewLume VS Code Extension               │
│                                             │
│ SecureMcpTunnelService                     │
│ McpConnectorService + McpConnectorServer   │
│ ProjectContext                             │
│   ├─ Git Project tools                     │
│   └─ Folder Project tools                  │
│       ├─ bounded file inspection           │
│       └─ scoped nested Git inspection      │
└──────────────────────┬──────────────────────┘
                       │ bounded read-only access
┌──────────────────────▼──────────────────────┐
│ One canonical Project Root                 │
└─────────────────────────────────────────────┘
```

Project Context 分成两种：

```text
ProjectContext
├── root
├── displayName
└── kind: git | folder
```

- **Git Project**：Git discovery 成功，root 为 canonical Git top-level；
- **Folder Project**：根目录 Git discovery 不成功，root 为 canonical Workspace Folder。Folder root 内部仍可包含多个真实 Git 子仓库。

Git 是增强能力，不是只读 MCP 连接前置条件。

P8 Review Pack、SecretScanner、历史、报告、问题状态、实施提示、修复摘要和二次复核继续作为既有 Advanced 工作流存在。本轮 Folder Project Support 不修改阶段编号，也不开始可选浏览器桥接。

## 2. Monorepo 结构

```text
reviewlume/
├─ apps/
│  ├─ vscode-extension/          # 当前唯一主发布物
│  ├─ browser-extension/         # 停用/历史原型
│  └─ web-bridge/                # 停用/历史原型
├─ packages/
│  ├─ core/
│  ├─ git-context/
│  ├─ review-pack/
│  ├─ secret-scanner/
│  ├─ prompt-templates/
│  ├─ report-parser/
│  └─ bridge-protocol/           # 历史浏览器桥接协议
├─ docs/
├─ tests/
├─ package.json
├─ pnpm-workspace.yaml
└─ tsconfig.base.json
```

VS Code VSIX 不捆绑 `tunnel-client`。用户必须从 OpenAI 官方 Release 下载并明确选择客户端。

## 3. Workspace readiness

Workspace readiness 只判断连接是否可以安全开始：

```text
NoWorkspace
Untrusted
Ready
```

`No Git` 不再是阻塞状态。

- 没有 Workspace Folder → `NoWorkspace`；
- Workspace 未受信任 → `Untrusted`；
- 有 Workspace Folder 且 Trusted → `Ready`。

Project Kind 在用户发起 MCP 连接、并选择一个 Workspace Folder 后解析。

多根 Workspace 中一次只选择一个 Workspace Folder。不维护跨 root 的多项目 registry，也不让一次 MCP connection 越过所选 root 读取。

## 4. ProjectContext 与项目发现

`resolveProjectContext()`：

1. `realpath` canonicalize 所选 Workspace Folder；
2. 确认 root 是目录；
3. 使用现有只读 Git runner 尝试 `git rev-parse --show-toplevel`；
4. 成功时 canonicalize Git root，返回 `kind: git`；
5. 失败或无 repository 时安全降级为所选 Folder root，返回 `kind: folder`。

不会因为根目录无 Git 而伪造 branch、HEAD、status 或 commit history。

如果 Git executable 不可用，即使目录中实际存在 Git metadata，也会安全降级为 Folder Project。此时 Folder 的文件工具仍可工作，而需要 Git runner 的 nested Git discovery/queries 不会伪造结果。

## 5. McpConnectorService

职责：

1. 检查 Workspace Trust；
2. 解析 `ProjectContext`；
3. 一次只绑定一个 `projectRoot + projectKind`；
4. Git Project 创建 `RepositoryIdentityTools`；
5. Folder Project 创建 `McpFolderProjectTools`；
6. 启动 `McpConnectorServer`；
7. 保存当前连接的 project 名称、root、kind、loopback port 和短时 Token；
8. 停止时关闭 server 并使 Token 失效。

兼容字段 `repository` / `repositoryRoot` 继续保留，同时增加显式 `project` / `projectRoot` / `projectKind`。

### Local Verification gate

Local Verification 仍然是 Git repository-bound 安全模型：

- 只有外层 `kind === git` 时，连接流程才允许调用现有 `runOnConnect()`；
- Folder Project 不进行验证 discovery；
- Folder Project 不运行验证；
- Folder Project 不注册 verification evidence 工具；
- Folder 内发现的 Git 子仓库不会自动继承、触发或暴露 Local Verification。

需要对子仓库使用 Local Verification 时，应把它直接作为 Git Project 打开并走现有仓库级授权流程。

## 6. McpConnectorServer

实现无状态 Streamable HTTP JSON-RPC：

- `initialize`
- `notifications/initialized`
- `ping`
- `tools/list`
- `tools/call`
- `notifications/cancelled`

网络与认证：

- 仅监听 `127.0.0.1` 随机端口；
- 每次启动生成新的高熵 Token；
- 本地调试可使用 `Authorization: Bearer`；
- 官方 Tunnel 使用 `X-ReviewLume-Token`；
- 无凭据 GET `/mcp` 只返回 405 可达性结果；
- 无凭据 POST/DELETE 返回 401；
- 限制 Origin、Content-Type、请求大小和调用频率；
- RFC 9728 Protected Resource Metadata 只暴露当前 loopback resource URL。

MCP tool set 是 capability-based：`tools/list` 直接来自当前 Project Kind 的工具对象。

初始化 metadata 按类型区分：

- Git Project 指示模型从 `repository_summary` 和最小 Git range 开始；
- Folder Project 指示模型从 `project_summary` 开始，跨 root 内部使用 file tools；需要 Git 上下文时先 `list_git_repositories`，再把其中一个精确 repository path 传给 Git 查询；Folder root 不得被描述为聚合 Git repository。

所有项目内容均是不可信输入，模型不得声称通过这些工具修改了文件。

## 7. Git Project tools

Git Project 继续使用 `McpRepositoryTools`：

- `repository_summary`
- `git_status`
- `recent_commits`
- `get_diff`
- `list_files`
- `read_file`
- `search_code`

当当前构建启用 Local Verification evidence 时，再增加：

- `verification_status`
- `read_verification_output`

Annotations 固定为 read-only、non-destructive、idempotent、closed-world。

Git 行为：

- 使用参数数组，不拼接 shell 命令；
- 使用只读 allowlist；
- 禁用 external diff 和 textconv；
- commit ref 先验证为完整 commit hash；
- remote URL 返回前移除用户名和密码。

文件行为：

- 拒绝绝对路径、Windows 盘符、UNC、NUL、`..` 和 `.git`；
- `realpath` 后必须仍位于 repository root；
- 拒绝目录、外部 symlink、二进制和超大文件；
- 结果受字节数、文件数、行数和匹配数预算限制。

为保持既有 Git connector 兼容，Git Project 不新增“按敏感文件名自动过滤”的语义。tracked `.env` 或类似敏感文件仍可能被枚举/读取；用户必须自行脱敏。

## 8. Folder Project tools

Folder mode 由 `McpFolderProjectTools` 提供。它继承 `McpFolderTools` 的跨 Folder 文件读取/搜索边界，同时增加对授权根目录内真实 Git 子仓库的显式只读查询。

### 8.1 Folder-wide file tools

跨整个 Folder root：

- `project_summary`
- `list_files`
- `read_file`
- `search_code`

`project_summary` 显式返回：

- `projectKind: folder`
- `gitHistoryAvailable: false`（指 Folder root 没有聚合 Git history）
- `nestedGitRepositoriesAvailable: true`
- `localVerificationAvailable: false`
- 当前 capability 列表
- 不得合并子仓库或推断 Folder root 的 staged/commit/diff 的 notice

### 8.2 Nested Git tools

Folder mode 额外注册：

- `list_git_repositories`
- `repository_summary`
- `git_status`
- `recent_commits`
- `get_diff`

除 `list_git_repositories` 外，四个 Git query 都必须带 `repository` 参数，并且值必须**精确匹配** `list_git_repositories` 返回的 project-relative path。

每次查询只绑定一个真实子仓库。不能：

- 把 Folder root 当成 synthetic repository；
- 自动猜测任意目录；
- 使用绝对路径/UNC/盘符/`..`/`.git` selector；
- 用 symlink/junction alias 替代 discovery 返回的路径；
- 合并多个 child repository 的 branch/status/history/diff。

Nested Git query 内部新建一个 scope 到 child repo 的 `McpRepositoryTools`，因此继续复用既有只读 Git allowlist、ref 校验、external diff/textconv 禁用、bounded diff 和 remote URL 脱敏逻辑。

### 8.3 Nested Git discovery

`discoverNestedGitRepositories()` 采用独立有界扫描：

- 最多返回 64 个 repository；
- 最多访问 20,000 个 filesystem entries；
- 最大深度 32；
- 跳过 VCS、credential-store、dependency、cache 和 build/generated 目录；
- 不跟随 directory symlink/junction-like entries；
- candidate 必须存在非 symlink 的 `.git` file 或 directory marker；
- 用现有 read-only Git runner 验证 `rev-parse --show-toplevel`；
- 用 `rev-parse --absolute-git-dir` 验证 Git metadata 主目录；
- top-level 与 git-dir 都必须 canonicalize 后仍位于 Folder root 内；
- top-level 必须精确等于发现 candidate。

因此授权 `G:\Projects\fbs` 可以发现并只读查询 `fbs-ui`、`fbs-lowcode` 等内部 repository，但不能把访问扩展到 `fbs` 外部。

### 8.4 无进程文件枚举

Folder-wide `list_files` / `search_code` 仍使用 `fs.readdir/lstat/realpath` 实现有界文件枚举，不执行 Git 或其它进程。

限制包括：

- 最多枚举 5,000 个文件；
- 最多访问 20,000 个 filesystem entries；
- 最大目录深度有界；
- 不跟随 symlink/junction-like link；
- 每个目录和文件 realpath 必须留在 canonical project root；
- 跳过 `.git/.hg/.svn`；
- 跳过 `.ssh/.gnupg/.aws/.azure/.kube`；
- 跳过常见依赖、缓存和生成目录，如 `node_modules/dist/build/out/target/coverage`。

### 8.5 Folder sensitive-path policy

Folder direct-file tools 在共享读取边界上再加一层明显 credential-like path 阻断：

- `.env` 及非 template `.env.*`；
- `credentials` / `credentials.json`；
- `secrets.json/yml/yaml`；
- `id_rsa` / `id_ed25519`；
- `.npmrc` / `.pypirc` / `.netrc`；
- `.key/.pem/.p12/.pfx/.jks/.keystore/.kdbx`。

`.env.example/.sample/.template/.dist` 可作为模板读取。

该策略只基于直接文件路径/文件名，不扫描普通文件内容，因此不是 DLP 或完整 SecretScanner。显式 nested Git status/history/diff 复用 Git Project 语义，也不会由 Folder filename denylist 自动过滤；这是文档化的隐私边界。

## 9. SecureMcpTunnelService

职责保持不变：

- Tunnel ID、客户端路径、代理保存在 `globalState`；
- Runtime API Key 保存在 `SecretStorage`；
- 识别官方 `tunnel-client`；
- 构建受控环境；
- 运行 `doctor --explain`；
- 启动 `tunnel-client run`；
- 轮询 loopback health；
- 停止时终止子进程并清理短时状态。

Tunnel 只负责传输当前 MCP server，不改变 Project Root 或 tool capability。

## 10. UI 与连接身份

主要动作：

- **Connect Current Project to ChatGPT**

用户不手工选 Git/Folder 模式。连接后状态栏显示：

```text
ReviewLume: <project> · Git
```

或：

```text
ReviewLume: <project> · Folder
```

Folder 内存在 Git 子仓库时，状态栏仍显示 `Folder`，因为外层授权边界仍是 Folder root。

这属于真实 VS Code 可见行为变化，因此合并前必须完成 Windows 人工验收。

## 11. P8 Advanced 模块

P8 既有能力保持 Git-oriented，不因 Folder Project MCP 自动泛化：

- `GitContextService`
- File Selection / Review Scope
- SecretScanner
- Review Pack builder / preview / export
- History / Report / Report Parser
- issue status
- implementation prompt / summary
- re-review / comparison

导入的 AI 内容始终是不可信文本，不触发命令或补丁执行。

Folder Project Support 不修改这些状态机，也不改变当前阶段编号。

## 12. 安全不变量

无论 Project Kind：

- Workspace 必须 Trusted；
- 一次连接一个 outer root；
- local MCP 仅 loopback；
- Token 每次启动重新生成；
- project file path 必须 project-relative 且 canonical realpath 不得越界；
- Folder nested Git selector 必须精确匹配 discovery 结果并留在授权 root；
- 文件/Git 结果均有 size/count 限制；
- 不提供 shell/terminal；
- 不提供任意/通用进程执行；
- 只允许既有受控只读 Git subprocess；
- 不提供写/删/rename；
- 不提供 patch apply；
- 不提供 Git mutation；
- Folder mode 不运行 Local Verification；
- 项目文件和 AI 回复均不能扩大权限。

详细 Folder 设计见 [Folder Project Support](folder-project-support.md)。

## 13. 激活与生命周期

- 使用 `onStartupFinished` 激活状态入口；
- 激活不自动联网或遍历项目；
- 连接由用户明确触发；
- 停止顺序为 Tunnel → local MCP；
- Extension Host dispose 使用相同停止顺序；
- cancellation 不作为红色 operational error；
- 真实代理、认证、Tunnel、Git 和协议错误必须明确报告。

## 14. 测试与发布门禁

CI 需要覆盖 Windows、Linux 和 macOS，并执行仓库既有 lint、TypeScript typecheck、unit tests、build、VSIX package 与 package content validation。

Folder Project 重点回归：

- no-Git Trusted folder 能连接；
- Folder-wide list/read/search；
- nested repository discovery；
- explicit child repository summary/status/commits/diff；
- root 不被伪装为 aggregate repository；
- child repository state 不合并；
- nested selector traversal / absolute / Windows drive / UNC / `.git` / alias / non-repo 拒绝；
- external Git metadata、symlink/junction root escape 拒绝；
- direct-file obvious sensitive path policy；
- Folder verification tools 始终缺席且不自动运行；
- direct Git Project 原工具与 verification 不回归；
- multi-root 仍只选择一个 outer root；
- identity 不混淆。

由于连接文案、状态栏和 Folder tool set 是真实可见行为，即使 CI 全绿也必须等待 Windows 实机验收后才能取消 Draft 并进入合并判断。
