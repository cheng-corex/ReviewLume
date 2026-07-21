# P9 ChatGPT 只读项目 MCP 连接器

## 产品目标

用户只需要在 ChatGPT 中发出自然语言指令，例如：

> 看一下当前项目最近的提交，有没有明显问题和优化点。

ChatGPT 通过 ReviewLume 提供的只读 MCP 工具，自行决定合理的检查链路：先识别仓库和 Git 状态，再选择提交范围、读取 diff、搜索相关实现与测试，最后直接在对话中给出建议。

ReviewLume 不再要求用户先扫描、选文件、导出审核包、导入回答或执行二次复核。P8 报告和复核能力保留为高级功能，但不再是默认主流程。

## 当前架构

```text
ChatGPT
  │  MCP tools/list + tools/call
  ▼
OpenAI Secure MCP Tunnel
  │  authenticated Streamable HTTP
  ▼
VS Code ReviewLume extension
  │  one active repository binding
  ▼
Read-only repository tools
  ├─ repository_summary
  ├─ git_status
  ├─ recent_commits
  ├─ get_diff
  ├─ list_files
  ├─ read_file
  └─ search_code
```

ChatGPT 不能直接访问开发机上的本地 MCP 服务。因此 ReviewLume 始终只监听 loopback，外部接入必须使用 OpenAI 支持的 Secure MCP Tunnel，不允许把本地端口直接暴露到公网。

## MCP 工具

### `repository_summary`

返回绑定仓库的显示名、当前分支、HEAD、最近提交、远程地址和工作区变更摘要。远程地址中的用户名和密码会被移除。

### `git_status`

返回 staged、unstaged 和 untracked 状态，帮助 ChatGPT 判断用户说的“最近修改”是否包含尚未提交内容。

### `recent_commits`

按需返回最近 1–30 个提交。ChatGPT 可据此选择合理的提交范围，而不是由 ReviewLume 预先固定。

### `get_diff`

读取以下任一范围：

- working：未暂存 + 已暂存变更；
- staged：仅已暂存变更；
- range：明确的 base/head 提交范围；
- 可附加 repository-relative path 过滤。

Git diff 固定禁用 external diff 和 textconv，结果超限时明确标记截断。

### `list_files`

列出 tracked 和未忽略的 untracked 文件。敏感路径不会出现在结果中。

### `read_file`

读取一个文本文件的有界行范围。拒绝：

- 绝对路径；
- `..` 路径逃逸；
- `.git`；
- symlink 越出 repository；
- 二进制文件；
- 超过大小上限的文件；
- `.env`、私钥、证书、credentials/secrets 等敏感路径。

### `search_code`

在 tracked 和未忽略的 untracked 文本文件中执行有界、字面量、不区分大小写的搜索。用于定位调用方、测试、配置和相关实现，再由 ChatGPT选择是否读取文件。

## 强制安全边界

1. 一次 MCP 连接只绑定一个 Git repository。
2. 只在 VS Code Trusted Workspace 中启动。
3. 服务只监听 `127.0.0.1` 随机端口。
4. 每次启动生成新的 256-bit bearer token；停止服务后立即失效。
5. 不记录 bearer token、文件正文、diff 正文或搜索结果。
6. 所有 Git 命令通过 `execFile` 参数数组执行，不使用 shell。
7. Git 命令仅允许只读 allowlist；禁止 checkout、reset、clean、commit、push 等写操作。
8. MCP 不提供 shell、终端、写文件、删除文件、修改 Git、应用补丁或执行 AI 回复的能力。
9. 工具结果有单次字节上限、文件大小上限、搜索文件数上限和请求频率限制。
10. repository 文件内容始终是不可信输入，不能改变工具权限或扩大路径边界。
11. 本地端口不得直接映射到公网；远程访问必须经过受支持的安全隧道。

## MCP 协议范围

首版实现无状态 Streamable HTTP JSON-RPC，支持：

- `initialize`；
- `notifications/initialized`；
- `ping`；
- `tools/list`；
- `tools/call`；
- `notifications/cancelled`。

支持协议版本：

- `2025-11-25`；
- `2025-06-18`；
- `2025-03-26`。

所有工具均声明：

- `readOnlyHint: true`；
- `destructiveHint: false`；
- `idempotentHint: true`；
- `openWorldHint: false`。

## VS Code 主流程

1. 用户打开一个 Git 项目。
2. 点击状态栏 `ReviewLume MCP`。
3. 选择 `Start Read-only MCP`。
4. ReviewLume 绑定当前 workspace folder 所属的 Git repository。
5. 用户复制连接信息，并通过 Secure MCP Tunnel 配置 ChatGPT 自定义 MCP app。
6. 以后直接在 ChatGPT 里发指令；ChatGPT 自动调用 ReviewLume 工具。
7. 用户关闭 VS Code、停止 MCP 或切换 repository 后，旧 endpoint/token 失效。

## 原有功能定位

P8 的以下能力继续保留，但统一标记为 Advanced：

- Review Pack；
- AI 回答导入；
- Review History；
- issue 状态；
- 实施提示；
- 修复摘要；
- 二次复核和结果对比。

这些功能不再阻塞 P9，也不再要求用户为普通项目检查执行复杂流程。

浏览器填入桥接原型不再注册为扩展主命令。遗留代码暂存于 PR 分支，待 MCP 主流程完成并通过验收后单独清理。

## 自动验证

必须在四平台 CI 运行：

```bash
pnpm install --frozen-lockfile
pnpm lint
pnpm typecheck
pnpm test
pnpm validate:browser-extension
pnpm build
pnpm package:vscode
```

新增测试至少覆盖：

- 所有 MCP 工具只读 annotations；
- bearer token 鉴权；
- initialize / tools/list / tools/call；
- 路径逃逸；
- symlink repository escape；
- `.git` 和敏感文件拒绝；
- binary/size/result 限制；
- Git 命令只读 allowlist；
- 停止服务后 endpoint/token 失效。

## 人工验收

1. 在 Windows VS Code 中打开一个测试仓库。
2. 启动 MCP，确认只监听 `127.0.0.1:<随机端口>`。
3. 通过 Secure MCP Tunnel 连接 ChatGPT。
4. 在 ChatGPT 中发送：`看看当前项目最近的提交，有没有问题和优化点。`
5. 确认 ChatGPT 能自主调用 repository summary、recent commits、diff、搜索和文件读取工具。
6. 确认无需手动扫描、选择文件、导出审核包或导入回答。
7. 确认 ChatGPT 不能执行命令、写文件或应用补丁。
8. 停止 MCP 后确认旧连接立即不可用。

## 合并条件

- PR 保持 Draft，直到四平台 CI 全绿；
- 完成 MCP 代码安全复核；
- 用户完成 Windows + ChatGPT + Secure MCP Tunnel 人工验收；
- 文档、命令名称、版本和实际行为一致；
- 不存在未处理的高风险路径越界、凭据泄漏或写操作入口。
