# ReviewLume

> 面向 VS Code 的隐私优先、最小权限优先 ChatGPT 项目连接器。

ReviewLume 把当前 VS Code 中的一个 Git repository 通过受控 MCP 工具连接给 ChatGPT。默认连接保持只读；用户也可以为当前 VS Code 窗口显式启用“逐批确认写入”，让 ChatGPT 在每次实际修改前请求 VS Code 人工确认。

ReviewLume 不读取浏览器 Cookie、Session、Token、密码或网页回答，不提供任意终端、任意文件系统或自动 Git 提交/推送能力。

## 核心体验

只读检查时，用户可以直接在 ChatGPT 中说：

> 看一下当前项目最近的提交，有没有明显问题和优化点。

ChatGPT 可以通过 ReviewLume 自动执行合理的检查链路：

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

启用 P10 逐批确认写入后，用户还可以说：

> 修复刚才发现的问题，并补上测试。

ChatGPT 会先读取需要编辑的完整文件和 SHA-256，再提交一批拟创建或替换的文本文件。ReviewLume 在 VS Code 中显示文件列表、创建/替换类型和字节变化；只有用户点击 **Apply changes** 后才会写入磁盘。

## P9：ChatGPT 项目 MCP

VS Code 状态栏提供 `ReviewLume MCP` 主入口。首次连接需要完成一次官方 Secure MCP Tunnel 配置：

1. 在 OpenAI Platform 创建或选择一个 Tunnel，并创建最小权限的 Runtime API Key；
2. 从 `openai/tunnel-client` 官方 GitHub Releases 下载对应平台压缩包；
3. 在 ReviewLume 中选择其中的 `tunnel-client` 可执行文件；
4. 粘贴 Tunnel ID 和 Runtime API Key。Runtime Key 只保存在 VS Code SecretStorage 中。

之后每次只需选择 **Connect Current Repository to ChatGPT**。ReviewLume 会自动：

1. 绑定当前 Trusted Workspace 中的一个 Git repository；
2. 启动仅监听 `127.0.0.1` 随机端口的本地 MCP；
3. 运行官方 `tunnel-client doctor --explain`；
4. 启动 OpenAI Secure MCP Tunnel；
5. 等待 loopback `/readyz` 和 `/api/status` 健康检查通过；
6. 在用户选择的浏览器中打开 ChatGPT 新对话。

首次连接可选择系统默认浏览器、Microsoft Edge 或 Google Chrome；选择会保存在 VS Code globalState。正常连接不会打开 Connectors 设置页。需要调整连接器时，从状态栏菜单显式选择 **Manage ChatGPT Connector (Advanced)**。

扩展重载或用户取消选择属于正常取消，不会弹出误导性的 `Canceled` 错误通知；代理、浏览器、Tunnel 和 MCP 等真实运行错误仍会显示。

默认只读工具：

- `repository_summary`
- `git_status`
- `recent_commits`
- `get_diff`
- `list_files`
- `read_file`
- `search_code`

详细设计见 [P9 ChatGPT 项目 MCP 计划](docs/p9-readonly-mcp-plan.md)，真实验收见 [P9 Secure MCP Tunnel 验收清单](docs/p9-readonly-mcp-verification.md)。

## P10：逐批确认写入

设置 `reviewlume.mcp.writeAccess`：

- `disabled`：默认值，只暴露 P9 只读工具；
- `confirmEachRequest`：额外暴露 `read_file_for_edit` 和 `write_files`。

`read_file_for_edit` 返回完整原始文本、文件字节数和 SHA-256。`write_files` 的约束：

- 每批 1–20 个文件；
- 只允许创建或完整替换仓库内文本文件；
- 替换现有文件必须提交最近一次读取得到的 SHA-256；
- SHA 不匹配、文件在确认期间发生变化或目标编辑器存在未保存内容时 fail-closed；
- 每批有效修改都必须在 VS Code 模态窗口中明确确认；
- 不支持删除、重命名、shell、包安装、Git add/commit/reset/clean/push；
- 禁止绝对路径、父目录逃逸、`.git`、符号链接逃逸、二进制和超限文件；
- 批次中途失败时尽力恢复本批已经写入的文件；
- 写入结果保持为普通 working-tree change，由用户继续检查、测试和提交。

设计与验收范围见 [P10 逐批确认写入计划](docs/p10-confirmed-write-mcp-plan.md)。

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

## 仓库访问安全边界

- 一次连接只绑定一个 Git repository；
- 只在 VS Code Trusted Workspace 中启动；
- 本地服务只监听 `127.0.0.1` 随机端口；
- 每次启动生成新的本地 Token；停止后立即失效；
- 不允许绝对路径、`..`、`.git` 或 symlink 越出 repository；
- 可读取仓库内实际文本内容，包括 `.env` 和安全相关源码；ReviewLume 不把内容扫描当作仓库访问授权边界；
- Git 读取命令固定禁用 external diff 和 textconv；
- 文件、diff、搜索结果、请求大小和调用频率均有限制；
- 不记录文件正文、diff 正文、搜索词、搜索结果、写入内容或任何凭据；
- 默认不暴露写入工具；启用后也只提供逐批确认的文本创建/替换；
- 不提供 shell、终端、删除文件、任意文件系统访问或 Git 修改工具；
- repository 文件、AI 请求理由和 AI 回复始终视为不可信输入；
- 本地 endpoint 不直接暴露到公网，外部连接由 OpenAI Secure MCP Tunnel 管理。

## 高级功能

P8 已实现的完整审核闭环继续保留，但不再是默认主流程：

- Review Pack；
- 敏感内容扫描；
- AI 回答导入；
- Review History；
- issue 状态管理；
- 实施提示和修复摘要；
- 二次复核和结果对比。

这些命令在扩展中标记为 `Advanced`，适用于需要可审计报告或人工闭环管理的场景。

## 已停止的浏览器填入原型

原 P9 浏览器扩展方案只能把预先生成的提示填入 ChatGPT、Claude 或 Gemini，不能让模型在回答过程中反复调用项目工具，因此不再作为主方案，也不再要求用户验收。

旧实现暂时保留在历史分支，用于提取安全设计；主扩展清单已停止注册浏览器配对和填入命令。说明见 [P9 浏览器填入桥接原型](docs/p9-browser-bridge-plan.md)。

## 明确不实现

- 自动登录 AI 网站；
- 获取 Cookie、Session Token、浏览器密码或访问令牌；
- 调用第三方 AI 内部接口或绕过额度；
- 自动执行 AI 返回的命令；
- 未经 VS Code 明确确认自动修改用户项目代码；
- 向 ChatGPT 暴露任意 shell、任意磁盘或 `.git` 写权限；
- 自己实现、代理或绕过 OpenAI Tunnel 控制面；
- 把本地 repository 端口直接暴露到公网；
- 一次连接跨越多个 Git repository。

## 文档阅读顺序

1. [产品方案](docs/product-overview.md)
2. [系统架构](docs/architecture.md)
3. [安全与合规边界](docs/security-and-compliance.md)
4. [P9 ChatGPT 项目 MCP 计划](docs/p9-readonly-mcp-plan.md)
5. [P9 Secure MCP Tunnel 验收清单](docs/p9-readonly-mcp-verification.md)
6. [P10 逐批确认写入计划](docs/p10-confirmed-write-mcp-plan.md)
7. [审核包格式（高级）](docs/review-pack-format.md)
8. [实施计划](docs/implementation-plan.md)
9. [任务清单](docs/task-plan.md)
10. [测试与验收](docs/test-and-verification.md)
11. [发布指南](docs/publishing-guide.md)
12. [用户指南](docs/user-guide.md)
13. [P9 浏览器填入桥接原型说明](docs/p9-browser-bridge-plan.md)

## 推荐技术栈

- TypeScript
- VS Code Extension API
- Model Context Protocol（Streamable HTTP）
- OpenAI Secure MCP Tunnel (`openai/tunnel-client`)
- pnpm workspace
- 受控 Git 子进程封装
- Vitest

## 许可

ReviewLume 使用 MIT License。隐私政策、第三方服务免责声明和安全报告渠道见仓库对应文档。
