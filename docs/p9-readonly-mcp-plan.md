# P9 ChatGPT 只读项目 MCP 连接器

## 产品目标

用户只需要在 ChatGPT 中发出自然语言指令，例如：

> 看一下当前项目最近的提交，有没有明显问题和优化点。

ChatGPT 通过 ReviewLume 提供的只读 MCP 工具，自行决定合理的检查链路：先识别仓库和 Git 状态，再选择提交范围、读取 diff、搜索相关实现与测试，最后直接在对话中给出建议。

ReviewLume 不再要求用户先扫描、选文件、导出审核包、导入回答或执行二次复核。P8 报告和复核能力保留为高级功能，但不再是默认主流程。

## 当前架构

```text
ChatGPT custom connector
  │  Connection: Tunnel + tunnel_id
  ▼
OpenAI Secure MCP Tunnel control plane
  │  official openai/tunnel-client outbound connection
  ▼
VS Code ReviewLume extension
  │  X-ReviewLume-Token on loopback only
  ▼
Read-only Streamable HTTP MCP
  │  one active Git repository
  ▼
Repository tools
  ├─ repository_summary
  ├─ git_status
  ├─ recent_commits
  ├─ get_diff
  ├─ list_files
  ├─ read_file
  └─ search_code
```

ChatGPT 不能直接访问开发机上的本地 MCP 服务。因此 ReviewLume 始终只监听 loopback，外部接入使用 OpenAI 官方 `openai/tunnel-client`。ReviewLume 不自己实现 Tunnel 控制面，也不把本地端口直接暴露到公网。

## 官方 Secure MCP Tunnel 接入

### 外部资源

- Tunnel 管理：`https://platform.openai.com/settings/organization/tunnels`
- Runtime API Key：`https://platform.openai.com/settings/organization/api-keys`
- 官方客户端：`https://github.com/openai/tunnel-client/releases/latest`
- ChatGPT Connectors：`https://chatgpt.com/#settings/Connectors`

### 首次配置

1. 用户在 OpenAI Platform 创建或选择 Tunnel。
2. 用户创建与 Tunnel 对应的最小权限 Runtime API Key；不得使用 admin key。
3. 用户从官方 Releases 下载对应平台压缩包，并明确选择其中的 `tunnel-client` 可执行文件。
4. ReviewLume 通过 `tunnel-client --version` 验证所选程序可执行且名称匹配。
5. Tunnel ID 保存在 VS Code `globalState`；Runtime API Key 只保存在 `SecretStorage`。
6. 可执行文件路径可保存在 `globalState`，或由机器级设置 `reviewlume.mcp.tunnelClientPath` 指定。

ReviewLume 不自动下载、不静默更新、不执行来源不明的二进制文件。

### 一键启动

用户选择 `Connect Current Repository to ChatGPT` 后：

1. 绑定当前 Trusted Workspace 中的一个 Git repository。
2. 启动本地只读 MCP，监听 `127.0.0.1:<随机端口>/mcp`。
3. 每次启动生成新的 256-bit 本地 Token。
4. 通过环境变量向官方客户端传递：
   - `CONTROL_PLANE_API_KEY`
   - `CONTROL_PLANE_TUNNEL_ID`
   - `MCP_SERVER_URL`
   - `MCP_EXTRA_HEADERS`
   - `MCP_DISCOVERY_EXTRA_HEADERS`
   - `HEALTH_LISTEN_ADDR=127.0.0.1:0`
   - `HEALTH_URL_FILE`
5. 先运行 `tunnel-client doctor --explain`；失败则不启动长期进程。
6. 通过 `spawn(binary, ['run'], { shell: false })` 启动官方客户端。
7. 等待 health URL 文件出现，并轮询 loopback `/readyz`。
8. 就绪后复制 Tunnel ID，打开 ChatGPT Connectors 页面。
9. 用户在 ChatGPT 中选择 `Connection: Tunnel` 并粘贴 Tunnel ID。

### 凭据和日志

- Runtime API Key 不进入 argv、配置文件、repository、VS Code settings、剪贴板或日志。
- 本地 MCP Token 不进入 argv；`MCP_EXTRA_HEADERS` 只包含 `env:REVIEWLUME_MCP_TOKEN` 引用。
- 本地 MCP 同时支持：
  - 本地调试：`Authorization: Bearer <token>`；
  - 官方 Tunnel：`X-ReviewLume-Token: <token>`。
- 使用专用 Header 是为了避免 ChatGPT 连接器认证覆盖本地 loopback 凭据。
- `ALLOW_REMOTE_UI=false`，诊断 UI 和 health listener 只允许 loopback。
- `LOG_HTTP_RAW_UNSAFE=false`，不记录原始请求/响应。
- 子进程输出再次过滤 Runtime API Key、MCP Token、Bearer/Authorization 内容。

### 生命周期

- 用户停止连接时，先停止 `tunnel-client`，再停止本地 MCP。
- 扩展卸载、Extension Host 关闭或重载时执行相同顺序。
- 停止本地 MCP 后，短时 Token 和随机端口立即失效。
- 隧道异常退出时状态栏显示失败，不声称仍已连接。

## MCP 工具

### `repository_summary`

返回绑定仓库的显示名、当前分支、HEAD、最近提交、远程地址和工作区变更摘要。远程地址中的用户名和密码会被移除。

### `git_status`

返回 staged、unstaged 和 untracked 状态，帮助 ChatGPT 判断用户说的“最近修改”是否包含尚未提交内容。

### `recent_commits`

按需返回最近 1–30 个提交。ChatGPT 可据此选择合理的提交范围，而不是由 ReviewLume 预先固定。

### `get_diff`

支持 working、staged、明确 base/head 范围和 repository-relative path 过滤。Git diff 固定禁用 external diff 和 textconv。无路径过滤时先列出改动文件、排除敏感路径，再逐文件读取有界 diff。

### `list_files`

列出 tracked 和未忽略的 untracked 文件。敏感路径不会出现在结果中。

### `read_file`

读取一个文本文件的有界行范围。拒绝绝对路径、父目录逃逸、`.git`、symlink 越界、二进制、超限和敏感文件。

### `search_code`

在 tracked 和未忽略的 untracked 文本文件中执行有界、字面量、不区分大小写的搜索。返回结果前执行内容门禁。

## 强制安全边界

1. 一次 MCP 连接只绑定一个 Git repository。
2. 只在 VS Code Trusted Workspace 中启动。
3. 本地服务只监听 `127.0.0.1` 随机端口。
4. Runtime API Key 只存在于 SecretStorage 和 tunnel-client 子进程环境。
5. 不记录 Runtime API Key、本地 Token、文件正文、diff 正文、搜索词或搜索结果。
6. 所有 Git 命令通过 `execFile` 参数数组执行，不使用 shell。
7. Git 命令仅允许只读 allowlist；禁止 checkout、reset、clean、commit、push 等写操作。
8. MCP 不提供 shell、终端、写文件、删除文件、修改 Git、应用补丁或执行 AI 回复的能力。
9. 工具结果有单次字节上限、文件大小上限、搜索文件数上限和请求频率限制。
10. 文件、diff、搜索结果和提交标题经过 SecretScanner 内容门禁；发现中高风险凭据时整段拒绝。
11. repository 文件内容始终是不可信输入，不能改变工具权限或扩大路径边界。
12. 不允许用户把本地 MCP 端口直接映射到公网。

## MCP 协议范围

首版实现无状态 Streamable HTTP JSON-RPC，支持：

- `initialize`；
- `notifications/initialized`；
- `ping`；
- `tools/list`；
- `tools/call`；
- `notifications/cancelled`。

支持协议版本 `2025-11-25`、`2025-06-18` 和 `2025-03-26`。所有工具声明 `readOnlyHint: true`、`destructiveHint: false`、`idempotentHint: true`、`openWorldHint: false`。

## VS Code 主流程

1. 打开一个 Git 项目。
2. 点击状态栏 `ReviewLume MCP`。
3. 首次选择 `Configure Secure MCP Tunnel`，完成官方客户端、Tunnel ID 和 Runtime Key 配置。
4. 选择 `Connect Current Repository to ChatGPT`。
5. ReviewLume 自动启动本地 MCP、doctor、Secure Tunnel 和 readiness 检查。
6. ChatGPT Connectors 页面打开后，选择 Tunnel 连接并粘贴已复制的 Tunnel ID。
7. 以后直接在 ChatGPT 中发指令；ChatGPT 自动调用 ReviewLume 工具。
8. 选择停止连接或关闭 VS Code 后，隧道和本地 endpoint 失效。

## 原有功能定位

P8 的 Review Pack、回答导入、Review History、issue 状态、实施提示、修复摘要、二次复核和结果对比继续保留，但统一标记为 Advanced，不再阻塞 P9。

浏览器填入桥接原型不再注册为扩展主命令。遗留代码暂存于 PR 分支，待 MCP 主流程完成并通过验收后单独清理。

## 自动验证

四平台 CI 必须运行安装、lint、TypeScript、测试、浏览器遗留原型安全校验、构建和 VSIX 打包。新增测试至少覆盖：

- MCP 工具只读 annotations；
- Bearer 与 `X-ReviewLume-Token` 鉴权；
- initialize / tools/list / tools/call；
- 路径、symlink、`.git`、敏感文件、二进制和大小边界；
- SecretScanner 内容门禁；
- Tunnel ID 校验；
- Runtime Key 和本地 Token 只通过环境变量传递；
- Header 值使用 env 引用而非明文；
- 子进程日志脱敏；
- health URL 只接受 loopback HTTP；
- manifest 不定义 API Key、Token 或 secret 设置。

## 人工验收

详细步骤见 [P9 Secure MCP Tunnel 人工验收清单](p9-readonly-mcp-verification.md)。必须在 Windows VS Code、用户实际 ChatGPT Plus 开发者模式和官方 tunnel-client 上完成真实端到端工具调用。

## 合并条件

- PR 保持 Draft，直到最新四平台 CI 全绿；
- 完成 MCP、SecretStorage、子进程、Header 和 Tunnel 生命周期代码安全复核；
- 用户完成 Windows + ChatGPT + Secure MCP Tunnel 人工验收；
- 文档、命令名称、版本和实际行为一致；
- 不存在未处理的高风险路径越界、凭据泄漏或写操作入口。
