# P9 ChatGPT 只读项目 MCP 连接器

## 产品目标

用户直接在 ChatGPT 中发出自然语言指令，例如：

> 看一下当前项目最近的提交，有没有明显问题和优化点。

ChatGPT 通过 ReviewLume 提供的只读 MCP 工具，自行识别 repository 状态、选择合理提交范围、读取 diff、搜索相关实现与测试，并直接在对话中给出建议。P8 的 Review Pack、回答导入、历史、问题状态和二次复核继续保留为 Advanced，但不再是默认主流程。

## 架构

```text
ChatGPT custom app / connector
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
repository_summary / git_status / recent_commits / get_diff
list_files / read_file / search_code
```

ReviewLume 本地服务始终只监听 loopback。外部接入使用 OpenAI 官方 `openai/tunnel-client`；ReviewLume 不自己实现 Tunnel 控制面，也不把本地端口直接映射到公网。

## 官方 Secure MCP Tunnel 接入

### 外部资源

- Tunnel 管理：`https://platform.openai.com/settings/organization/tunnels`
- Runtime API Key：`https://platform.openai.com/settings/organization/api-keys`
- 官方客户端：`https://github.com/openai/tunnel-client/releases/latest`
- ChatGPT：`https://chatgpt.com/`
- ChatGPT Apps/Connectors（仅初次或高级配置）：`https://chatgpt.com/#settings/Connectors`
- 完整用户步骤：[ChatGPT 与 OpenAI Secure MCP Tunnel 配置指南](chatgpt-secure-mcp-setup.md)

### 账户与权限前置条件

ReviewLume 不控制 ChatGPT 套餐、工作空间或灰度权限。用户的 ChatGPT 网页端必须实际存在创建或使用自定义 MCP 应用/连接器的入口。

OpenAI 当前官方帮助会随产品迭代变化。ReviewLume 不声称能为缺少该入口的账户本地开启 Developer mode、Apps 或 Connectors，也不绕过任何套餐限制。

### 首次配置

1. 用户在 OpenAI Platform 创建或选择 Tunnel。
2. 用户创建最小权限 Runtime API Key；不得使用 Admin Key。
3. 用户下载官方 Release 压缩包并明确选择其中的 `tunnel-client` 可执行文件。
4. ReviewLume 运行 `tunnel-client --help`，要求帮助文本同时包含官方命令名和 “OpenAI MCP control plane” 描述。
5. Tunnel ID 必须匹配 `tunnel_<32 lowercase letters or digits>`。
6. Tunnel ID 和二进制路径存入 VS Code `globalState`；Runtime API Key 只存入 `SecretStorage`。
7. 可选机器级设置 `reviewlume.mcp.tunnelClientPath` 只保存官方客户端路径，不保存凭据。
8. 用户在 ChatGPT 创建一次自定义应用/连接器，选择 `Connection: Tunnel` 并粘贴 Tunnel ID。
9. ChatGPT 扫描工具后应只发现 7 个只读工具。
10. 用户首次连接时选择系统默认浏览器、Microsoft Edge 或 Google Chrome；偏好保存到 VS Code `globalState`。

ReviewLume 不自动下载、不静默更新、不通过 shell 启动、不执行来源不明的二进制。系统默认浏览器、Edge 和 Chrome 都使用独立 URL 参数启动，不依赖 `vscode.env.openExternal` 的外部网站确认。

### 一键启动

用户选择 `Connect Current Repository to ChatGPT` 后：

1. 读取已保存的浏览器偏好；尚未选择时先让用户选择并保存。
2. 绑定当前 Trusted Workspace 中的一个 Git repository。
3. 启动 `127.0.0.1:<随机端口>/mcp` 的本地只读 MCP。
4. 每次启动生成新的 256-bit 本地 Token。
5. 清除宿主环境中的 `TUNNEL_CLIENT_*`、`CONTROL_PLANE_*`、`MCP_*`、`HEALTH_*`、`ADMIN_UI_*`、`CLOUDFLARED_*`、`HARPOON_*`、`PROXY_*` 以及 OpenAI admin/API key、远程 UI、日志文件和原始 HTTP 日志覆盖项。
6. 保留普通系统环境和标准网络代理环境，再写入 ReviewLume 明确允许的最小配置。
7. 先运行 `tunnel-client doctor --explain`；失败则不启动长期进程。
8. 删除 doctor 可能写入的 health URL 文件。
9. 通过 `spawn(binary, ['run'], { shell: false })` 启动官方客户端。
10. 等待长期进程重新写入 health URL，并轮询 loopback `/readyz` 至 200。
11. 继续读取 `/api/status`，确认 Tunnel ID、control-plane metadata 和 main channel 都健康。
12. 在所选浏览器打开 `https://chatgpt.com/` 新对话。

正常连接不打开 Apps/Connectors 设置页。需要修改连接器时，用户从状态栏菜单显式选择 `Manage ChatGPT Connector (Advanced)`。需要修改浏览器时，用户选择 `Choose ChatGPT Browser`。

### VS Code 界面

- 底部状态栏 `ReviewLume MCP` 是 P9 唯一常驻入口；
- 状态栏显示当前连接的 repository 名称；
- ReviewLume 是连接器名称，不是要求 repository 必须叫 ReviewLume；
- 不贡献重复的 Activity Bar 容器或 `onView` 激活事件；
- P8 高级功能继续通过命令面板和 Review Panel 使用；
- 启动激活只注册入口和命令，不自动连接、不打开网页、不读取项目内容。

### 受控环境变量

ReviewLume 显式设置：

- `CONTROL_PLANE_API_KEY`
- `CONTROL_PLANE_TUNNEL_ID`
- `MCP_SERVER_URL`
- `REVIEWLUME_MCP_TOKEN`
- `MCP_EXTRA_HEADERS=X-ReviewLume-Token: env:REVIEWLUME_MCP_TOKEN`
- `MCP_DISCOVERY_EXTRA_HEADERS` 同上
- `MCP_MAX_CONCURRENT_REQUESTS=4`
- `HEALTH_LISTEN_ADDR=127.0.0.1:0`
- `HEALTH_URL_FILE`
- `LOG_HTTP_RAW_UNSAFE=false`
- `ALLOW_REMOTE_UI=false`
- `OPEN_WEB_UI=false`
- `HARPOON_CAPTURE_PAYLOADS=false`

凭据不进入 argv、配置文件、repository、VS Code settings、剪贴板或日志。

### 日志和诊断

- doctor 是短时进程，其完整错误文本在返回前过滤 Runtime Key、本地 Token、Bearer 和 Authorization 内容。
- 长期 `tunnel-client run` 的 stdout/stderr 不采集，避免凭据跨任意输出分块时绕过脱敏。
- 诊断 UI 和 health listener 只能使用 loopback HTTP；含凭据、HTTPS 或非 loopback URL 均拒绝。
- 原始 HTTP 日志、远程 UI、自动打开 UI、Harpoon payload 捕获和日志文件均被禁用。
- 工具调用日志属于 best-effort observability；日志通道失败不能把有效 `tools/call` 变成 HTTP 500。

### 生命周期

- 用户停止连接时，先停止 `tunnel-client`，再停止本地 MCP。
- 扩展卸载、Extension Host 关闭或重载时执行相同顺序。
- 停止本地 MCP 后，随机端口和本地 Token 立即失效。
- 隧道异常退出时状态栏显示失败，不声称仍已连接。

## MCP 工具

- `repository_summary`：连接器名、当前项目名、分支、HEAD、最近提交、脱敏 remote 和工作区摘要。
- `git_status`：staged、unstaged 和 untracked 状态。
- `recent_commits`：按需返回最近 1–30 个提交。
- `get_diff`：working、staged 或明确 base/head 的有界 diff。
- `list_files`：Git tracked 和未忽略 untracked 文件列表。
- `read_file`：repository 内明确指定普通文本文件的有界行范围读取。
- `search_code`：在 tracked 和未忽略 untracked 文本文件中执行有界字面量搜索。

所有工具声明 `readOnlyHint: true`、`destructiveHint: false`、`idempotentHint: true`、`openWorldHint: false`。

## 强制安全边界

1. 一次连接只绑定一个 Git repository。
2. 只在 VS Code Trusted Workspace 中启动。
3. 本地 MCP 只监听 `127.0.0.1` 随机端口。
4. 本地调试使用 `Authorization: Bearer <token>`；官方 Tunnel 使用 `X-ReviewLume-Token: <token>`，避免连接器认证覆盖本地凭据。
5. 拒绝绝对路径、父目录逃逸、`.git`、symlink 越界、目录、二进制和超限文件。
6. Git 仅允许受控只读命令，使用参数数组且禁用 external diff/textconv。
7. 不提供 shell、终端、写文件、删除文件、Git 修改、补丁应用或执行 AI 回复能力。
8. 工具结果、请求大小、文件数、并发和调用频率均有限制。
9. repository 内容始终视为不可信输入，不能改变工具权限。
10. 浏览器 URL 由扩展内常量决定，不能由 repository 内容覆盖；启动不使用 shell。
11. Runtime API Key、本地 Token、文件正文、diff、搜索词和搜索结果不得进入 ReviewLume 日志。

## P9 不提供的秘密保护

P9 MCP 不自动：

- 阻止 `.env`、credentials、secrets、证书、私钥、数据库或生产配置文件名；
- 对文件正文、diff、搜索结果或提交标题运行 SecretScanner；
- 识别或移除 API Key、Token、密码、Cookie、私钥正文、连接串、个人数据、客户数据或内部地址；
- 把 `.gitignore` 当成完整机密边界。

`read_file` 可以读取 repository 内被明确指定的普通文本文件，即使该文件被 Git 忽略。tracked 敏感文件仍会出现在 `list_files` 和 `search_code` 候选中。

P8 Advanced Review Pack 仍有独立 SecretScanner 和导出门禁，但不会自动覆盖 P9 MCP 工具调用。完整说明见 [PRIVACY.md](../PRIVACY.md)。

## MCP 协议

实现无状态 Streamable HTTP JSON-RPC，支持 `initialize`、`notifications/initialized`、`ping`、`tools/list`、`tools/call` 和 `notifications/cancelled`。支持协议版本 `2025-11-25`、`2025-06-18` 和 `2025-03-26`。

## 自动验证

四平台 CI 必须运行安装、lint、TypeScript、测试、浏览器遗留原型校验、构建和 VSIX 打包。测试至少覆盖：

- MCP 工具只读 annotations；
- Bearer 与 `X-ReviewLume-Token` 鉴权；
- initialize / tools/list / tools/call；
- 路径、symlink、`.git`、二进制和大小边界；
- `.env` 或敏感命名文本文件不会被错误宣传为自动阻止；
- Tunnel ID 官方格式；
- 环境变量凭据传递与 env Header 引用；
- 宿主 Tunnel/MCP/命令/日志环境隔离；
- doctor 诊断脱敏；
- health URL 仅 loopback HTTP；
- ChatGPT 浏览器偏好枚举和 Windows/macOS/Linux 启动命令解析；
- manifest 不贡献 Activity Bar / `onView`，且不定义 API Key、Token 或 secret 设置。

## 人工验收和合并条件

真实步骤见 [P9 Secure MCP Tunnel 人工验收清单](p9-readonly-mcp-verification.md)。发布候选在以下条件满足前不得标记稳定：

- 最新四平台 CI 全绿；
- 完成 MCP、SecretStorage、子进程、环境隔离、Header、浏览器启动和生命周期代码复核；
- 用户完成 Windows + ChatGPT + 官方 tunnel-client 的真实端到端验收；
- 文档、命令、版本和实际行为一致；
- 不存在未处理的高风险路径越界、凭据泄漏或写操作入口；
- 公开隐私政策明确 P9 不自动秘密扫描。