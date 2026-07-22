# ReviewLume

> 面向 VS Code 的隐私感知、只读优先的 ChatGPT 项目连接器。

ReviewLume 把当前 VS Code 中的一个 Git repository 以受控的只读 MCP 工具连接给 ChatGPT。用户直接在 ChatGPT 中提出审核指令，ChatGPT 再按需查看 Git 状态、最近提交、diff、相关源码、测试和配置，并直接给出问题与优化建议。

ReviewLume 不提供终端、写文件、应用补丁或 Git 修改能力，也不读取浏览器 Cookie、Session、Token、密码或 ChatGPT 回答。

> **重要隐私提醒：** P9 MCP 不会自动运行 SecretScanner，也不会仅因为文件名是 `.env`、`credentials`、`secrets` 或内容像密钥就阻止读取。连接前必须移除、轮换或脱敏真实凭据，只连接你有权提供给 OpenAI 的 repository。详细说明见 [PRIVACY.md](PRIVACY.md)。

## 核心体验

用户在 ChatGPT 中直接说：

> 看一下当前项目最近的提交，有没有明显问题和优化点。

ChatGPT 可以通过 ReviewLume 自动执行合理的只读检查链路：

```text
repository_summary
    ↓
git_status + recent_commits
    ↓
选择合理的 commit range
    ↓
get_diff
    ↓
search_code + read_file
    ↓
检查相关实现、测试与配置
    ↓
直接在 ChatGPT 中给出建议
```

用户不需要先扫描、手动选文件、导出审核包、导入回答或执行多次复核。

## 首次使用需要准备什么

首次使用需要：

1. OpenAI Platform 中的一个 Secure MCP Tunnel；
2. 对应该 Tunnel 的最小权限 Runtime API Key；
3. 从 `openai/tunnel-client` 官方 Releases 下载的本机客户端；
4. ChatGPT 网页端中可创建或使用自定义 MCP 应用/连接器的账户或工作空间；
5. 一个已开启 Workspace Trust 的 VS Code Git repository。

OpenAI 的套餐、工作空间权限和界面会变化。ReviewLume 不会绕过 ChatGPT 的账户或套餐限制；如果 ChatGPT 中没有创建自定义应用/连接器的入口，ReviewLume 无法在本地开启它。

完整申请、创建和连接步骤见：

- [ChatGPT 与 OpenAI Secure MCP Tunnel 配置指南](docs/chatgpt-secure-mcp-setup.md)

## P9：ChatGPT 只读项目 MCP

VS Code 状态栏提供 `ReviewLume MCP` 主入口。首次连接需要完成一次官方 Secure MCP Tunnel 配置：

1. 在 OpenAI Platform 创建或选择 Tunnel，并创建最小权限 Runtime API Key；
2. 从 `openai/tunnel-client` 官方 GitHub Releases 下载对应平台压缩包；
3. 在 ReviewLume 中选择其中的 `tunnel-client` 可执行文件；
4. 粘贴 Tunnel ID 和 Runtime API Key。Runtime Key 只保存在 VS Code SecretStorage 中；
5. 在 ChatGPT 中创建一次 ReviewLume 自定义应用/连接器，连接方式选择 Tunnel，并扫描工具。

之后每次只需选择 **Connect Current Repository to ChatGPT**。ReviewLume 会自动：

1. 绑定当前 Trusted Workspace 中的一个 Git repository；
2. 启动仅监听 `127.0.0.1` 随机端口的本地只读 MCP；
3. 运行官方 `tunnel-client doctor --explain`；
4. 启动 OpenAI Secure MCP Tunnel；
5. 等待 loopback `/readyz` 和 `/api/status` 健康检查通过；
6. 在用户选择的浏览器中打开 ChatGPT 新对话。

首次连接可选择系统默认浏览器、Microsoft Edge 或 Google Chrome；选择会保存在 VS Code globalState。正常连接不会打开 Apps/Connectors 设置页。需要调整连接器时，从状态栏菜单显式选择 **Manage ChatGPT Connector (Advanced)**。

扩展重载或用户取消选择属于正常取消，不会弹出误导性的 `Canceled` 错误通知；代理、浏览器、Tunnel 和 MCP 等真实运行错误仍会显示。

当前工具：

- `repository_summary`
- `git_status`
- `recent_commits`
- `get_diff`
- `list_files`
- `read_file`
- `search_code`

每个工具都声明为 read-only、non-destructive 和 idempotent。ChatGPT 可以选择“需要读什么”，但不能获得写入、删除、Shell、终端或 Git mutation 能力。

详细设计见 [P9 ChatGPT 只读项目 MCP 计划](docs/p9-readonly-mcp-plan.md)，真实验收见 [P9 Secure MCP Tunnel 验收清单](docs/p9-readonly-mcp-verification.md)。

## Secure MCP Tunnel 安全处理

- 只执行用户明确选择、PATH 中可用或机器设置指定的官方 `tunnel-client`；不静默下载、不通过 shell 启动；
- 使用官方帮助文本识别客户端，并按官方规则接受 `tunnel_` 后 32 位小写字母或数字的 Tunnel ID；
- Runtime API Key 使用 VS Code SecretStorage，不写入 repository、用户设置、命令参数、剪贴板或日志；
- Tunnel ID、官方二进制路径、控制面代理和 ChatGPT 浏览器偏好可保存在 VS Code globalState；
- 启动前清除宿主环境中的 Tunnel profile、MCP command、admin key、Cloudflared、Harpoon、远程 UI 和原始 HTTP 日志覆盖项；
- 控制面密钥和本地 MCP Token 只通过环境变量传给子进程；
- 本地 MCP 使用专用 `X-ReviewLume-Token`，避免与 ChatGPT 连接器认证头冲突；
- tunnel-client 的健康监听和诊断 UI 固定为 loopback；
- 启动前运行官方 doctor；失败时停止子进程，不保持半连接状态；
- doctor 的完整诊断文本在返回前脱敏；长期 tunnel-client 的 stdout/stderr 不采集；
- 关闭扩展或选择停止连接时，先停止隧道，再停止本地 MCP 并使短时 Token 失效；
- 不启用原始 HTTP 日志、远程诊断 UI、自动打开 UI 或 Harpoon payload 捕获。

## Repository 访问边界

ReviewLume P9 MCP 实际执行以下边界：

- 一次连接只绑定一个 Git repository；
- 只在 VS Code Trusted Workspace 中启动；
- 本地服务只监听 `127.0.0.1` 随机端口；
- 每次启动生成新的本地 Token；停止后立即失效；
- 拒绝绝对路径、`..`、`.git`、repository 外部 symlink、目录、二进制和超大文件；
- Git 仅允许受控的只读命令，并固定禁用 external diff 和 textconv；
- 文件、diff、搜索结果、请求大小和调用频率均有限制；
- 不记录文件正文、diff 正文、搜索词、搜索结果或任何凭据；
- 不提供 shell、终端、写文件、删除文件、Git 修改或补丁应用工具；
- repository 文件和文档始终视为不可信输入；
- 本地 endpoint 不直接暴露到公网，外部连接由 OpenAI Secure MCP Tunnel 管理。

P9 MCP **不会**自动执行以下保护：

- 不按 `.env`、credentials、secrets、证书、私钥或生产配置等文件名自动阻止；
- 不自动用 SecretScanner 扫描文件正文、diff、搜索结果或提交标题；
- 不保证识别或移除 API Key、Token、密码、连接串、个人数据、客户数据或内部地址；
- `.gitignore` 不是完整隐私边界：tracked 文件仍可枚举，被明确指定的 ignored 文本文件仍可由 `read_file` 读取。

因此，用户必须在连接前完成秘密移除、轮换或脱敏，并遵守组织的数据使用规则。

## 高级功能

P8 已实现的完整审核闭环继续保留，但不再是默认主流程：

- Review Pack；
- 敏感内容扫描；
- AI 回答导入；
- Review History；
- issue 状态管理；
- 实施提示和修复摘要；
- 二次复核和结果对比。

P8 Advanced Review Pack 的 SecretScanner 和导出门禁只保护该高级工作流，不会自动过滤 P9 MCP 工具调用。

## 已停止的浏览器填入原型

原 P9 浏览器扩展方案只能把预先生成的提示填入 ChatGPT、Claude 或 Gemini，不能让模型在回答过程中反复调用项目工具，因此不再作为主方案，也不再要求用户验收。

旧实现暂时保留在历史分支和设计文档中，用于提取安全设计；主扩展清单已停止注册浏览器配对和填入命令。说明见 [P9 浏览器填入桥接原型](docs/p9-browser-bridge-plan.md)。

## 明确不实现

- 自动登录 AI 网站；
- 获取 Cookie、Session Token、浏览器密码或访问令牌；
- 调用第三方 AI 内部接口或绕过额度；
- 自动执行 AI 返回的命令；
- 自动修改用户项目代码；
- 自动应用补丁；
- 自己实现、代理或绕过 OpenAI Tunnel 控制面；
- 把本地 repository 端口直接暴露到公网；
- 一次连接跨越多个 Git repository。

## 文档阅读顺序

1. [ChatGPT 与 OpenAI Secure MCP Tunnel 配置指南](docs/chatgpt-secure-mcp-setup.md)
2. [隐私政策](PRIVACY.md)
3. [安全政策](SECURITY.md)
4. [安全与合规边界](docs/security-and-compliance.md)
5. [P9 ChatGPT 只读项目 MCP 计划](docs/p9-readonly-mcp-plan.md)
6. [P9 Secure MCP Tunnel 验收清单](docs/p9-readonly-mcp-verification.md)
7. [用户指南](docs/user-guide.md)
8. [产品方案](docs/product-overview.md)
9. [系统架构](docs/architecture.md)
10. [审核包格式（高级）](docs/review-pack-format.md)
11. [发布指南](docs/publishing-guide.md)

## 推荐技术栈

- TypeScript
- VS Code Extension API
- Model Context Protocol（Streamable HTTP）
- OpenAI Secure MCP Tunnel (`openai/tunnel-client`)
- pnpm workspace
- 受控 Git 子进程封装
- Vitest

## 第三方免责声明

ReviewLume 是独立开源项目，与 OpenAI、Microsoft、Anthropic、Google 或其他服务商没有隶属或背书关系。ChatGPT、OpenAI Platform、Secure MCP Tunnel、VS Code、Git 和浏览器的可用性、套餐权限、数据处理和服务条款由各自提供商负责。