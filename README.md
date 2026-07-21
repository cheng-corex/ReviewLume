# ReviewLume

> 面向 VS Code 的隐私优先、只读优先的 ChatGPT 项目连接器。

ReviewLume 把当前 VS Code 中的一个 Git repository 以受控的只读 MCP 工具连接给 ChatGPT。用户直接在 ChatGPT 中提出审核指令，ChatGPT 再按需查看 Git 状态、最近提交、diff、相关源码、测试和配置，并直接给出问题与优化建议。

ReviewLume 不提供终端、写文件、应用补丁或 Git 修改能力，也不读取浏览器 Cookie、Session、Token、密码或网页回答。

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

## P9：ChatGPT 只读项目 MCP

VS Code 状态栏提供 `ReviewLume MCP` 主入口。首次连接需要完成一次官方 Secure MCP Tunnel 配置：

1. 在 OpenAI Platform 创建或选择一个 Tunnel，并创建最小权限的 Runtime API Key；
2. 从 `openai/tunnel-client` 官方 GitHub Releases 下载对应平台压缩包；
3. 在 ReviewLume 中选择其中的 `tunnel-client` 可执行文件；
4. 粘贴 Tunnel ID 和 Runtime API Key。Runtime Key 只保存在 VS Code SecretStorage 中。

之后每次只需选择 **Connect Current Repository to ChatGPT**。ReviewLume 会自动：

1. 绑定当前 Trusted Workspace 中的一个 Git repository；
2. 启动仅监听 `127.0.0.1` 随机端口的本地只读 MCP；
3. 运行官方 `tunnel-client doctor --explain`；
4. 启动 OpenAI Secure MCP Tunnel；
5. 等待 loopback `/readyz` 健康检查通过；
6. 复制非敏感的 Tunnel ID；
7. 打开 ChatGPT Connectors 页面。

在 ChatGPT 创建自定义连接器时选择 **Connection: Tunnel**，粘贴 Tunnel ID。以后直接在 ChatGPT 中下达项目检查指令。

当前工具：

- `repository_summary`
- `git_status`
- `recent_commits`
- `get_diff`
- `list_files`
- `read_file`
- `search_code`

每个工具都声明为 read-only、non-destructive 和 idempotent。ChatGPT 可以选择“需要读什么”，但不能改变“允许读什么”。

详细设计见 [P9 ChatGPT 只读项目 MCP 计划](docs/p9-readonly-mcp-plan.md)，真实验收见 [P9 Secure MCP Tunnel 验收清单](docs/p9-readonly-mcp-verification.md)。

## Secure MCP Tunnel 安全处理

- 只执行用户明确选择、PATH 中可用或机器设置指定的官方 `tunnel-client`；不静默下载、不通过 shell 启动；
- 使用官方帮助文本识别客户端，并按官方规则接受 `tunnel_` 后 32 位小写字母或数字的 Tunnel ID；
- Runtime API Key 使用 VS Code SecretStorage，不写入 repository、用户设置、命令参数、剪贴板或日志；
- Tunnel ID 和官方二进制路径可保存在 VS Code globalState；
- 启动前清除宿主环境中的 Tunnel profile、MCP command、admin key、Cloudflared、Harpoon、远程 UI 和原始 HTTP 日志覆盖项，只保留普通系统与网络环境；
- 控制面密钥和本地 MCP Token 只通过环境变量传给子进程；
- 本地 MCP 使用专用 `X-ReviewLume-Token`，避免与 ChatGPT 连接器认证头冲突；
- tunnel-client 的健康监听和诊断 UI 固定为 loopback；
- 启动前运行官方 doctor；失败时停止子进程，不保持半连接状态；doctor 完成后删除其 health URL，长期进程必须生成新的健康地址；
- doctor 的完整诊断文本在返回前脱敏；长期 tunnel-client 的 stdout/stderr 不采集，避免凭据跨输出分块时绕过脱敏；
- 关闭扩展或选择停止连接时，先停止隧道，再停止本地 MCP 并使短时 Token 失效；
- 不启用原始 HTTP 日志、远程诊断 UI、自动打开 UI 或 Harpoon payload 捕获。

## 仓库访问安全边界

- 一次连接只绑定一个 Git repository；
- 只在 VS Code Trusted Workspace 中启动；
- 本地服务只监听 `127.0.0.1` 随机端口；
- 每次启动生成新的本地 Token；停止后立即失效；
- 不允许绝对路径、`..`、`.git` 或 symlink 越出 repository；
- 默认阻止 `.env`、私钥、证书、credentials 和 secrets 等敏感路径；
- 文件正文、diff、搜索结果和提交标题还经过现有 SecretScanner 内容门禁；
- Git 仅允许受控的只读命令，并固定禁用 external diff 和 textconv；
- 文件、diff、搜索结果、请求大小和调用频率均有限制；
- 不记录文件正文、diff 正文、搜索词、搜索结果或任何凭据；
- 不提供 shell、终端、写文件、删除文件、Git 修改或补丁应用工具；
- repository 文件和文档始终视为不可信输入；
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

旧实现暂时保留在 Draft PR 分支，用于提取安全设计；主扩展清单已停止注册浏览器配对和填入命令。说明见 [P9 浏览器填入桥接原型](docs/p9-browser-bridge-plan.md)。

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

1. [产品方案](docs/product-overview.md)
2. [系统架构](docs/architecture.md)
3. [安全与合规边界](docs/security-and-compliance.md)
4. [P9 ChatGPT 只读项目 MCP 计划](docs/p9-readonly-mcp-plan.md)
5. [P9 Secure MCP Tunnel 验收清单](docs/p9-readonly-mcp-verification.md)
6. [审核包格式（高级）](docs/review-pack-format.md)
7. [实施计划](docs/implementation-plan.md)
8. [任务清单](docs/task-plan.md)
9. [测试与验收](docs/test-and-verification.md)
10. [发布指南](docs/publishing-guide.md)
11. [用户指南](docs/user-guide.md)
12. [P9 浏览器填入桥接原型说明](docs/p9-browser-bridge-plan.md)

## 推荐技术栈

- TypeScript
- VS Code Extension API
- Model Context Protocol（Streamable HTTP）
- OpenAI Secure MCP Tunnel (`openai/tunnel-client`)
- pnpm workspace
- 受控 Git 子进程封装
- Vitest

## 许可建议

公共开源版本建议使用 MIT License。发布前应补充隐私政策、第三方服务免责声明和安全报告渠道。
