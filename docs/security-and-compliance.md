# 安全与合规边界

## 1. 安全目标

ReviewLume 必须确保：

- 用户明确知道何时建立外部连接、绑定哪个 Git repository，以及哪些工具可被 ChatGPT 调用；
- 默认不提供 shell、终端、写文件、删除文件、应用补丁或 Git 修改能力；
- 一次 MCP 连接只绑定一个明确选择的 Git repository；
- 本地 MCP 只监听 loopback，并在每次启动时生成新的高熵 Token；
- Runtime API Key 不进入 repository、VS Code settings JSON、命令参数、剪贴板或日志；
- 绝对路径、父目录逃逸、`.git`、符号链接逃逸、目录、二进制和超限内容不能通过文件读取工具返回；
- 项目文件和 AI 回复始终被视为不可信输入；
- 扩展启动不会自动建立 Tunnel、打开网页或读取 repository 内容；
- 停止连接或 Extension Host 退出后，本地端口和 Token 立即失效；
- 公开文档准确说明 P9 MCP 不自动执行 SecretScanner，也不自动阻止敏感文件名或秘密内容。

ReviewLume 的“隐私感知”来自明确的数据流、只读能力、repository 边界、最小凭据存储和用户控制，而不是声称所有秘密都会被自动识别。

## 2. 当前数据流

```text
用户在 VS Code 选择一个 Trusted Workspace Git repository
  ↓
ReviewLume 启动 127.0.0.1 随机端口的只读 MCP
  ↓
官方 openai/tunnel-client 建立出站 Secure MCP Tunnel
  ↓
用户在 ChatGPT 对话中启用 ReviewLume 应用/连接器并发出指令
  ↓
ChatGPT 按需调用 7 个只读工具
  ↓
ReviewLume 经过 repository、路径、类型、大小和速率门禁后返回结果
  ↓
结果通过 OpenAI Secure MCP Tunnel 离开本机并由 OpenAI 处理
```

VS Code 启动、扩展激活或仅打开状态栏菜单不会发送 repository 内容。只有用户主动启动连接、在 ChatGPT 对话中启用连接器并触发工具调用后，允许的数据才会离开本机。

ReviewLume 不运营中转云服务，不接收或保存通过 Tunnel 传输的 repository 数据。数据到达 OpenAI 后的处理、保留、训练、数据驻留和工作区控制由用户的 OpenAI 账户、工作区设置及 OpenAI 条款负责。

公开隐私说明见 [../PRIVACY.md](../PRIVACY.md)，首次配置见 [ChatGPT 与 OpenAI Secure MCP Tunnel 配置指南](chatgpt-secure-mcp-setup.md)。

## 3. P9 MCP 的真实可读范围

### 3.1 工具可返回的数据

当前 7 个工具可以返回：

- repository 名称、当前分支、HEAD、最近提交和工作区状态；
- 脱去 URL 用户名和密码后的 remote URL；
- staged、unstaged 或明确 commit range 的 diff；
- Git 已跟踪文件和未忽略的未跟踪文件列表；
- repository 内明确指定的普通文本文件行范围；
- 非忽略文本文件中的有界字面量搜索结果。

### 3.2 强制拒绝

- 绝对路径和 Windows 盘符路径；
- `..` 父目录逃逸；
- `.git` 目录；
- realpath 后落到 repository 外的符号链接；
- 目录；
- 含 NUL 的二进制文件；
- 超过读取大小限制的文件；
- 非法 commit ref；
- 超过请求、结果、文件数、行数、并发或速率预算的调用。

### 3.3 不自动拒绝或扫描

P9 MCP 不会自动：

- 因文件名为 `.env`、`credentials`、`secrets`、证书、私钥、数据库或生产配置而拒绝；
- 对文件正文、diff、搜索结果或提交标题运行 P8 SecretScanner；
- 识别并移除 API Key、Token、密码、Cookie、私钥正文、连接串、个人数据、客户数据或内部地址；
- 把 `.gitignore` 当成完整机密边界。

`list_files` 和 `search_code` 使用 Git 的 tracked + non-ignored untracked 枚举，因此 tracked 敏感文件仍可能出现。`read_file` 对明确给出的 repository 内普通文本路径执行读取，即使该文件被 `.gitignore` 忽略。

用户不得把 P9 MCP 当作 DLP、秘密扫描器或合规审批系统。

## 4. 威胁模型

### 4.1 恶意项目文件与提示注入

项目中的 Markdown、源码注释、配置、测试数据或文件名可能诱导模型读取更多内容、执行命令或扩大范围。

应对：

- MCP 工具能力固定在扩展代码中，repository 内容不能注册新工具或改变权限；
- 不提供 shell、终端、写文件、补丁或 Git mutation 工具；
- 一次连接只绑定一个 repository；
- 所有输入路径都基于 repository root 规范化并执行 realpath 校验；
- 拒绝绝对路径、`..`、`.git`、目录、符号链接逃逸和设备路径；
- 文件列表、读取、diff 和搜索都有文件数、字节数、行数、并发和速率预算；
- 工具 annotations 固定声明 read-only、non-destructive、idempotent、closed-world；
- 初始化说明要求模型把 repository 内容视为不可信输入，且不得声称修改过文件。

### 4.2 敏感内容泄露

源码、diff、提交标题或搜索结果可能包含 API Key、Token、私钥、连接串、个人信息、客户数据或内部地址。

P9 应对：

- 公开文档明确告知 P9 不自动秘密扫描；
- 限制一次连接一个 repository；
- 限制文件类型、大小、行数、结果数和调用速率；
- 日志不记录查询词、文件正文、diff、搜索结果或原始秘密；
- remote URL 返回前移除用户名和密码；
- 大结果有明确截断标记，不以静默截断伪装成完整检查；
- 建议用户使用脱敏副本、测试分支或专用 review repository。

用户应对：

- 连接前移除、轮换或脱敏真实秘密；
- 不连接无权提供给 OpenAI 的 repository；
- 不把生产数据库、真实客户数据或高权限凭据放入测试 repository；
- 发现泄漏后立即撤销 Runtime API Key 和相关业务凭据。

P8 Advanced Review Pack 的 SecretScanner 和导出门禁是独立控制，只保护通过 P8 流程收集和导出的内容，不自动覆盖 P9 MCP。

### 4.3 本地端口滥用

其他网页或本地进程可能尝试访问 MCP endpoint。

应对：

- 只监听 `127.0.0.1` 随机端口；
- 每次启动生成新的 256-bit Token；
- 官方 Tunnel 使用专用 `X-ReviewLume-Token` Header；
- 无凭据 GET `/mcp` 只允许返回 405 可达性结果，不返回工具或 repository 数据；
- 无凭据 POST/DELETE 或错误 Token 返回 401；
- 限制 Origin、Content-Type、请求体大小、并发和调用频率；
- 停止连接后端口和 Token 立即失效。

### 4.4 Tunnel 配置与凭据泄漏

Runtime API Key、本地 Token、代理或 ambient 环境可能污染官方客户端。

应对：

- Runtime API Key 只存储在 VS Code SecretStorage；
- 凭据通过环境变量传入子进程，不进入 argv；
- Tunnel ID、官方客户端路径、规范化控制面代理和浏览器偏好只保存在机器级 globalState；
- 启动前清除 ambient Tunnel profile、MCP command、admin key、Cloudflared、Harpoon、远程 UI、日志文件和 raw HTTP logging 覆盖项；
- 只向 tunnel-client 设置 `CONTROL_PLANE_HTTP_PROXY`，不把通用代理强加给 VS Code、Git、pnpm 或本地 MCP；
- doctor 输出在展示前脱敏；长期进程 stdout/stderr 不采集；
- `/readyz` 后继续校验 `/api/status` 中的 Tunnel ID、metadata error 和 main channel 状态；
- 不接受 OpenAI Admin Key，文档要求使用最小权限 Runtime API Key。

### 4.5 浏览器与第三方页面

ReviewLume 只负责打开 ChatGPT 新对话或由用户显式打开管理页面。

应对：

- 不安装或注入浏览器扩展作为 P9 主流程；
- 不读取 Cookie、Session、密码、浏览历史、ChatGPT 输入框或回答；
- 系统默认浏览器、Edge 和 Chrome 均通过固定命令与独立 URL 参数启动，`shell: false`；
- repository 内容不能覆盖浏览器 URL；
- 正常连接只打开 `https://chatgpt.com/`，连接器设置仅由用户显式打开；
- 旧浏览器填入桥接原型不注册命令和 activation events，不作为发布主能力宣传。

### 4.6 恶意 AI 回复

AI 可能输出危险命令、删除指令、伪造路径或补丁。

应对：

- ReviewLume 不执行 AI 回复；
- 不自动应用补丁；
- 不把 ChatGPT 的自然语言结论当作工具权限；
- P8 Advanced 导入内容只作为不可信文本记录；
- 路径、行号和修复建议都需用户独立验证。

## 5. Repository、路径和 Git 边界

- 只在 VS Code Trusted Workspace 中启动 repository MCP；
- 多根工作区必须选择一个 workspace folder；
- repository root 由受控 Git discovery 确定；
- Git 仅允许审核需要的只读子命令；
- 固定禁用 external diff 和 textconv；
- 不执行 checkout、reset、clean、add、commit、merge、rebase、fetch、push 或任意 shell；
- 不返回包含凭据的 remote URL；
- 不读取 `.git` 内容；
- 不跨 repository 读取文件。

## 6. 只读 MCP 工具

当前只允许：

- `repository_summary`
- `git_status`
- `recent_commits`
- `get_diff`
- `list_files`
- `read_file`
- `search_code`

每个工具必须声明：

```json
{
  "readOnlyHint": true,
  "destructiveHint": false,
  "idempotentHint": true,
  "openWorldHint": false
}
```

工具参数、错误和结果必须经过 schema 与边界验证。用户取消或 Extension Host reload 属于正常取消，不得显示为红色运行错误；代理、浏览器、Tunnel、鉴权、协议和 repository 错误不得被取消识别逻辑吞掉。

## 7. P8 Advanced 本地数据

Review Pack、历史、导入回答、issue 状态、实施摘要和二次复核继续保留为 Advanced：

- 默认写入 repository 内 `.reviewlume/` 管理目录；
- 自动加入 Git 排除规则或提供恢复操作；
- 不自动上传到 ReviewLume 服务；
- 只有用户主动复制、导出、打开或发送时才离开本机；
- 删除历史时只删除受管理且通过路径校验的目录；
- 导入的 AI 内容始终视为不可信文本；
- SecretScanner、HARD_BLOCK/BLOCK/WARN 和导出门禁只属于该工作流。

## 8. 日志、遥测与诊断

- 不收集 telemetry 或 analytics；
- ReviewLume 日志不得包含 Runtime API Key、本地 Token、Authorization Header、文件正文、diff、搜索词或搜索结果；
- tunnel-client raw HTTP logging 保持关闭；
- Tunnel Diagnostics 只监听 loopback；
- 用户分享日志前仍应人工检查；
- 日志属于 best-effort observability，日志通道失败不得改变工具调用结果。

## 9. ChatGPT 和 OpenAI 产品边界

- ReviewLume 不能启用用户账户中不存在的自定义应用/连接器权限；
- OpenAI 的套餐、Developer mode、Apps/Connectors 界面和工具快照行为可能变化；
- ChatGPT 批准应用后可能冻结工具定义，MCP 工具变化后需要刷新、重新扫描或重新创建应用；
- ReviewLume 不调用模型 API，不绕过 ChatGPT、Codex 或 OpenAI API 额度；
- ReviewLume 不承诺 OpenAI 的可用性、数据保留、训练、驻留、合规或工作空间权限。

允许的产品描述：

- “通过 OpenAI Secure MCP Tunnel 将一个 VS Code Git repository 以只读工具连接给 ChatGPT。”
- “独立开源项目，与 OpenAI、Microsoft 或其他服务商无隶属或背书关系。”

禁止的产品描述：

- “官方 ChatGPT 插件”；
- “自动保护所有秘密”；
- “免费调用付费模型”；
- “绕过 API、Codex 或 ChatGPT 额度”；
- 使用第三方服务商 Logo 作为主图标；
- 声称启用连接器后 repository 数据永远不离开本机。

## 10. 发布前隐私最低要求

公共版本必须提供：

- [PRIVACY.md](../PRIVACY.md)；
- [SECURITY.md](../SECURITY.md)；
- [ChatGPT 与 OpenAI Secure MCP Tunnel 配置指南](chatgpt-secure-mcp-setup.md)；
- 明确的数据流、实际可读范围、权限、第三方服务免责声明和已知限制；
- Marketplace 页面中的隐私政策和安全报告链接；
- 无 telemetry 声明；
- 本地数据删除方式；
- OpenAI 处理通过 Tunnel 返回数据的说明；
- 明确说明 P9 不自动 SecretScanner，P8 SecretScanner 仅保护 Advanced Review Pack；
- 不把 `.gitignore`、文件名规则或模型判断宣传成机密保证。

## 11. 安全事件响应

- 漏洞通过 GitHub private vulnerability reporting 私下提交；
- 高危问题优先停止发布、撤回受影响版本并发布修复；
- 维护 Changelog、GitHub Security Advisory 和受影响版本说明；
- 不要求报告者在修复前公开 PoC、凭据或敏感 repository 内容；
- 真实密钥泄漏时应先撤销和轮换，再进行技术取证。