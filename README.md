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

VS Code 状态栏提供 `ReviewLume MCP` 主入口：

1. 打开一个 Git 项目。
2. 选择 `Start Read-only MCP`。
3. ReviewLume 绑定当前 workspace folder 所属的一个 Git repository。
4. 复制 MCP 连接信息。
5. 通过 OpenAI Secure MCP Tunnel 把本地 endpoint 连接到 ChatGPT。
6. 以后直接在 ChatGPT 中发审核指令。

当前工具：

- `repository_summary`
- `git_status`
- `recent_commits`
- `get_diff`
- `list_files`
- `read_file`
- `search_code`

每个工具都声明为 read-only、non-destructive 和 idempotent。ChatGPT 可以选择“需要读什么”，但不能改变“允许读什么”。

详细设计见 [P9 ChatGPT 只读项目 MCP 计划](docs/p9-readonly-mcp-plan.md)。

## 安全边界

- 一次连接只绑定一个 Git repository。
- 只在 VS Code Trusted Workspace 中启动。
- 本地服务只监听 `127.0.0.1` 随机端口。
- 每次启动生成新的 bearer token；停止后立即失效。
- 不允许绝对路径、`..`、`.git` 或 symlink 越出 repository。
- 默认阻止 `.env`、私钥、证书、credentials 和 secrets 等敏感路径。
- Git 仅允许受控的只读命令，并固定禁用 external diff 和 textconv。
- 文件、diff、搜索结果、请求大小和调用频率均有限制。
- 不记录 bearer token、文件正文、diff 正文或搜索结果。
- 不提供 shell、终端、写文件、删除文件、Git 修改或补丁应用工具。
- repository 文件和文档始终视为不可信输入。
- 本地 endpoint 不得直接暴露到公网；ChatGPT 接入使用受支持的 Secure MCP Tunnel。

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
- 把本地 repository 端口直接暴露到公网；
- 一次连接跨越多个 Git repository。

## 文档阅读顺序

1. [产品方案](docs/product-overview.md)
2. [系统架构](docs/architecture.md)
3. [安全与合规边界](docs/security-and-compliance.md)
4. [P9 ChatGPT 只读项目 MCP 计划](docs/p9-readonly-mcp-plan.md)
5. [审核包格式（高级）](docs/review-pack-format.md)
6. [实施计划](docs/implementation-plan.md)
7. [任务清单](docs/task-plan.md)
8. [测试与验收](docs/test-and-verification.md)
9. [发布指南](docs/publishing-guide.md)
10. [用户指南](docs/user-guide.md)
11. [P9 浏览器填入桥接原型说明](docs/p9-browser-bridge-plan.md)

## 推荐技术栈

- TypeScript
- VS Code Extension API
- Model Context Protocol（Streamable HTTP）
- pnpm workspace
- 受控 Git 子进程封装
- Vitest

## 许可建议

公共开源版本建议使用 MIT License。发布前应补充隐私政策、第三方服务免责声明和安全报告渠道。
