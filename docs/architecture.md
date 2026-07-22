# 系统架构

## 1. 当前总体架构

ReviewLume 当前默认主流程是只读 MCP，而不是浏览器输入框桥接：

```text
┌─────────────────────────────────────────────┐
│ ChatGPT Web                                 │
│ Custom app / connector                     │
│ repository_summary / git_status / ...      │
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
│ McpRepositoryTools                         │
│ Status bar / browser launcher / diagnostics│
└──────────────────────┬──────────────────────┘
                       │ controlled read-only Git + fs
┌──────────────────────▼──────────────────────┐
│ One trusted Git repository                 │
└─────────────────────────────────────────────┘
```

P8 Review Pack、SecretScanner、历史、报告、问题状态和二次复核继续作为 Advanced 本地工作流存在，但不再是默认主入口。

旧浏览器填入桥接原型不注册运行时命令，不读取网页输入框、Cookie、Session 或 ChatGPT 回答。

## 2. Monorepo 结构

```text
reviewlume/
├─ apps/
│  ├─ vscode-extension/          # 当前唯一主发布物
│  ├─ browser-extension/         # 已停用原型，仅保留静态校验/历史代码
│  └─ web-bridge/                # 已停用原型
├─ packages/
│  ├─ core/
│  ├─ git-context/
│  ├─ review-pack/
│  ├─ secret-scanner/
│  ├─ prompt-templates/
│  ├─ report-parser/
│  └─ bridge-protocol/           # 已停用浏览器桥接协议
├─ docs/
├─ tests/
├─ package.json
├─ pnpm-workspace.yaml
└─ tsconfig.base.json
```

VS Code VSIX 不捆绑 `tunnel-client`。用户必须从 OpenAI 官方 Release 下载并明确选择客户端。

## 3. P9 只读 MCP 模块

### 3.1 Extension Host

职责：

- 在 `onStartupFinished` 激活；
- 初始化 ReviewLume OutputChannel；
- 注册状态栏、MCP 命令和 P8 Advanced 命令；
- 管理服务生命周期；
- Extension Host 退出或重载时先停止 Tunnel，再停止本地 MCP。

激活阶段不会：

- 自动建立外部连接；
- 自动启动 `tunnel-client`；
- 自动打开 ChatGPT；
- 自动读取 Git 状态、diff 或 repository 文件；
- 自动运行 SecretScanner。

### 3.2 McpConnectorService

职责：

1. 检查 Workspace Trust；
2. 解析所选 workspace folder 的 Git repository root；
3. 一次只绑定一个 repository；
4. 创建 `McpRepositoryTools`；
5. 启动 `McpConnectorServer`；
6. 保存当前连接的 repository 名称、root、loopback 端口和短时 Token；
7. 停止时关闭 server 并使 Token 失效。

Repository 名称来自 Git root 的目录名。ReviewLume 是连接器名称，不是要求 repository 必须叫 ReviewLume。

### 3.3 McpConnectorServer

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

初始化元数据明确：

- ReviewLume 是 connector；
- `repository` 字段表示当前实际连接项目；
- 所有工具只读；
- repository 内容是不可信输入；
- 模型不得声称修改了文件。

### 3.4 McpRepositoryTools

当前工具：

- `repository_summary`
- `git_status`
- `recent_commits`
- `get_diff`
- `list_files`
- `read_file`
- `search_code`

Annotations 固定为：

```json
{
  "readOnlyHint": true,
  "destructiveHint": false,
  "idempotentHint": true,
  "openWorldHint": false
}
```

Git 行为：

- 使用参数数组，不拼接 shell 命令；
- 使用只读 allowlist；
- 禁用 external diff 和 textconv；
- commit ref 先通过 `rev-parse --verify --end-of-options` 解析为完整 commit hash；
- remote URL 返回前移除用户名和密码。

文件行为：

- 拒绝绝对路径、Windows 盘符、UNC、NUL、`..` 和 `.git`；
- `realpath` 后必须仍位于 repository root；
- 拒绝目录、外部 symlink、二进制和超大文件；
- `read_file` 返回有界行范围；
- `list_files` 和 `search_code` 使用 tracked + non-ignored untracked 枚举；
- 所有结果受字节数、文件数、行数和匹配数预算限制。

### 3.5 P9 隐私边界

P9 MCP 是 repository-bound read-only 工具，不是 DLP 或秘密扫描器。

P9 不自动：

- 阻止 `.env`、credentials、secrets、证书、私钥、数据库或生产配置文件名；
- 对文件正文、diff、搜索结果或提交标题运行 P8 SecretScanner；
- 识别并移除 API Key、Token、密码、连接串、个人数据或客户数据；
- 把 `.gitignore` 当成完整机密边界。

`read_file` 可以读取 repository 内被明确指定的普通文本文件，包括 ignored 文件。tracked 敏感文件仍会进入 `list_files` 和 `search_code` 候选。

P8 Advanced SecretScanner 只保护 Review Pack 收集与导出流程，不自动保护 P9 MCP。

### 3.6 SecureMcpTunnelService

职责：

- 保存 Tunnel ID、客户端路径和控制面代理到 VS Code `globalState`；
- 保存 Runtime API Key 到 VS Code `SecretStorage`；
- 识别官方 `tunnel-client --help`；
- 校验 `tunnel_<32 lowercase letters or digits>`；
- 构建受控子进程环境；
- 运行 `doctor --explain`；
- 启动 `tunnel-client run`；
- 轮询 `/readyz` 和 `/api/status`；
- 暴露 loopback-only diagnostics UI；
- 异常退出时更新状态；
- 停止时终止子进程并清理 health URL 文件。

受控环境显式设置：

- `CONTROL_PLANE_API_KEY`
- `CONTROL_PLANE_TUNNEL_ID`
- `MCP_SERVER_URL`
- `REVIEWLUME_MCP_TOKEN`
- `MCP_EXTRA_HEADERS`
- `MCP_DISCOVERY_EXTRA_HEADERS`
- `MCP_MAX_CONCURRENT_REQUESTS`
- `HEALTH_LISTEN_ADDR`
- `HEALTH_URL_FILE`
- `LOG_HTTP_RAW_UNSAFE=false`
- `ALLOW_REMOTE_UI=false`
- `OPEN_WEB_UI=false`
- `HARPOON_CAPTURE_PAYLOADS=false`

启动前清除 ambient Tunnel、MCP、Admin Key、Cloudflared、Harpoon、远程 UI、日志文件、raw HTTP logging 和通用代理覆盖项。

Runtime API Key 和本地 Token 通过环境变量传入，不进入 argv。doctor 输出在展示前脱敏；长期 stdout/stderr 不采集。

### 3.7 ChatGptBrowserService

支持：

- 系统默认浏览器；
- Microsoft Edge；
- Google Chrome。

规则：

- 浏览器偏好保存在 VS Code `globalState`；
- Windows 系统默认浏览器使用 `rundll32.exe url.dll,FileProtocolHandler`；
- macOS 使用 `/usr/bin/open`；
- Linux 使用 `xdg-open`，失败时回退 `gio open`；
- Edge/Chrome 使用固定可执行路径或命令；
- URL 始终作为独立参数；
- `shell: false`；
- repository 内容不能覆盖 URL；
- 不使用 `vscode.env.openExternal` 打开正常 ChatGPT 新对话，避免重复 Open/Cancel 确认。

### 3.8 MCP 状态栏和命令

底部 `ReviewLume MCP` 是默认常驻入口。

主要动作：

- Connect Current Repository to ChatGPT；
- Open New Chat in ChatGPT；
- Choose ChatGPT Browser；
- Configure Secure MCP Tunnel；
- Manage ChatGPT Connector (Advanced)；
- Open Tunnel Diagnostics；
- Show ReviewLume Logs；
- Stop Secure MCP Connection。

状态栏显示当前实际 repository 名称。未连接、starting、ready 和 failed 使用不同图标与 tooltip。

## 4. ChatGPT 与 OpenAI 外部依赖

首次配置需要：

1. OpenAI Platform Tunnel；
2. 最小权限 Runtime API Key；
3. 官方 `openai/tunnel-client`；
4. ChatGPT 中可创建或使用自定义 MCP 应用/连接器的账户或工作空间；
5. ChatGPT 应用选择 Tunnel connection 并使用同一 Tunnel ID；
6. 工具扫描发现 7 个只读工具。

ReviewLume 不控制：

- ChatGPT 套餐和灰度权限；
- Developer mode、Apps/Connectors UI；
- 工作空间管理员和 RBAC；
- OpenAI 数据保留、驻留、训练和合规设置；
- ChatGPT 的工具冻结快照。

工具定义变化后，用户需要在 ChatGPT 刷新、重新扫描或重新创建应用。

完整流程见 [ChatGPT 与 OpenAI Secure MCP Tunnel 配置指南](chatgpt-secure-mcp-setup.md)。

## 5. P8 Advanced 模块

### 5.1 GitContextService

提供受控只读 Git 范围：status、staged、unstaged、commit range、changed files 和目标提交文件内容。

### 5.2 FileSelectionService 与 ReviewScopeService

支持：

- 仅变更；
- 智能上下文；
- 完整 repository；
- 用户显式相关文件；
- 测试文件推荐；
- `.gitignore`、`.reviewlumeignore` 和 realpath 边界；
- `.reviewlume/exports/**` 与 `.reviewlume/history/**` 排除。

### 5.3 SecretScanner

只属于 P8 Advanced Review Pack：

- HARD_BLOCK；
- BLOCK；
- WARN；
- INFO；
- 文件名和内容规则；
- 扫描指纹和 stale-scan 拒绝；
- 导出门禁。

不得把该模块宣传为 P9 MCP 的自动过滤层。

### 5.4 ReviewPackBuilder 与 ReviewPanel

负责 Review Pack 预算、预览、导出、格式选择和 `.gitignore` 管理。

### 5.5 HistoryService、ReportService 与 ReportParser

负责：

- 原子保存历史；
- `response.md` 和 `report.json`；
- 结构化问题；
- 状态机；
- 实施提示；
- 修复摘要；
- 二次复核和结果对比。

导入的 AI 内容始终是不可信文本，不触发命令或补丁执行。

## 6. 本地数据与标识

P8 Advanced 使用 repository-local 目录：

```text
<repository>/.reviewlume/
├─ exports/
│  └─ <reviewId>/
│     ├─ REVIEW_REQUEST.md
│     └─ reviewlume-pack-<reviewId>.zip
└─ history/
   └─ <reviewId>/
      ├─ metadata.json
      ├─ request.md
      ├─ response.md
      ├─ report.json
      ├─ implementation-summary.md
      └─ re-review/
```

P9 本地状态：

- Tunnel ID：VS Code `globalState`；
- tunnel-client 路径：VS Code `globalState` 或 machine setting；
- 控制面代理：VS Code `globalState`；
- 浏览器偏好：VS Code `globalState`；
- Runtime API Key：VS Code `SecretStorage`；
- 当前 MCP port 和 Token：仅进程内存，停止后失效。

## 7. 配置项

当前公开配置：

- `reviewlume.mcp.maxToolResultBytes`
- `reviewlume.mcp.tunnelClientPath`
- `reviewlume.export.mode`
- `reviewlume.export.directory`
- `reviewlume.export.format`
- `reviewlume.export.autoUpdateGitignore`

Runtime API Key 不得成为普通 VS Code setting。

## 8. 激活与生命周期

- 使用 `onStartupFinished` 显示状态栏；
- 命令 activation events 作为兼容入口；
- 不使用 `*`；
- 激活不自动联网或遍历 repository；
- 连接由用户明确触发；
- 停止顺序为 Tunnel → local MCP；
- Extension Host dispose 使用相同停止顺序；
- cancellation 不显示为红色 operational error；
- 真实代理、认证、浏览器、Tunnel、Git 和协议错误必须显示。

## 9. 性能边界

P9：

- MCP result 默认最大 512 KB，可配置 64 KB–2 MB；
- `read_file` 单文件最大 256 KB；
- `search_code` 单候选文件最大 1 MB；
- 搜索最多扫描 5,000 个候选文件；
- 单次 diff 最多 200 个文件；
- 搜索结果最多 100 条；
- MCP 每分钟调用数和并发数受限。

P8 Advanced：

- Review Pack 有总大小预算；
- 智能上下文限制文件数和总字节；
- 完整 repository 不接受静默截断；
- 二进制文件不内嵌；
- 扫描和打包支持取消。

## 10. 已停用浏览器桥接原型

历史 Web Bridge/Browser Extension 设计只允许页面检测、提示填入和用户确认发送，不能支持 ChatGPT 在回答过程中反复调用 repository 工具，因此不再作为 P9 主流程。

发布版本不得：

- 注册桥接配对或填入命令；
- 安装浏览器扩展；
- 读取 Cookie、Session、密码、输入框或回答；
- 宣传自动登录或网页内部接口；
- 把 bridge-protocol 或 web-bridge 作为必需运行时。

相关历史说明见 [P9 浏览器填入桥接原型](p9-browser-bridge-plan.md)。