# 产品方案

## 1. 产品名称

正式名称：**ReviewLume**

VS Code Marketplace 展示名建议：

> ReviewLume – Read-only ChatGPT Repository Connector

不建议把 ChatGPT、OpenAI、GPT、Claude 或 Gemini 放入产品正式名称。兼容服务可在功能描述中准确说明，并附第三方独立项目免责声明。

## 2. 当前定位

ReviewLume 是一个面向 VS Code 的隐私感知、只读优先的项目连接器。

默认主流程：

```text
当前 VS Code Git repository
  → ReviewLume loopback read-only MCP
  → OpenAI Secure MCP Tunnel
  → ChatGPT 自定义应用/连接器
  → 用户直接提出代码审核指令
```

ReviewLume 不提供 shell、终端、文件写入、文件删除、补丁应用或 Git mutation，也不读取浏览器 Cookie、Session、密码、浏览历史或 ChatGPT 回答。

P8 的 Review Pack、SecretScanner、回答导入、历史、问题状态和二次复核继续作为 Advanced 本地工作流保留。

## 3. 目标用户

- 希望直接在 ChatGPT 中检查本地项目的开发者；
- 希望模型自行选择合理提交范围、相关源码、测试和配置，但不允许模型修改项目的维护者；
- 希望一次连接严格绑定一个 repository 的用户；
- 需要保留 Review Pack 和问题闭环作为高级审计能力的团队；
- 愿意在连接前自行移除、轮换或脱敏秘密信息的用户。

## 4. 核心痛点

### 4.1 ChatGPT 与本地 repository 割裂

用户可以在 ChatGPT 中讨论代码，但模型无法按需读取当前 Git 状态、提交、diff 和相关文件。

### 4.2 通用编码 Agent 权限过大

许多 Agent 同时具备终端、文件写入和 Git 操作能力，不适合只需要代码审核的场景。

### 4.3 Repository 身份和范围不清晰

多根工作区或多个项目并存时，用户需要明确知道当前连接的是哪个 repository。

### 4.4 敏感信息风险

项目中可能包含 `.env`、证书、生产配置、数据库、访问令牌和客户数据。P9 MCP 不自动秘密扫描，因此必须公开真实边界并要求用户在连接前完成数据最小化。

### 4.5 审核结果不可追踪

ChatGPT 回答适合快速检查，但重要项目仍可能需要 Review Pack、结构化问题、处理状态和二次复核记录。

## 5. 产品原则

- **Read-only**：不提供项目修改能力。
- **Repository-bound**：一次连接只绑定一个明确选择的 Git repository。
- **User-initiated**：扩展启动不自动连接、不自动读取、不自动打开网页。
- **Transparent**：清楚显示当前项目、工具、数据流和已知限制。
- **Privacy-aware, not secret-proof**：提供边界、最小化和日志保护，但不宣称自动识别所有秘密。
- **Human-in-the-loop**：用户决定何时连接、何时启用 ChatGPT 应用、何时停止。
- **Untrusted-input by default**：repository 内容和 AI 回复都不能提升工具权限或触发执行。
- **Auditable when needed**：P8 Advanced 提供本地 Review Pack 和复核闭环。

## 6. 默认用户故事

### US-01 连接当前项目

作为开发者，我希望从 VS Code 一键启动本地只读 MCP 和 Secure MCP Tunnel，并打开 ChatGPT 新对话。

### US-02 自主选择审核范围

作为开发者，我希望 ChatGPT 先查看 repository summary、Git status 和最近提交，再自行选择合理 diff、源码、测试和配置范围。

### US-03 保持只读

作为项目维护者，我希望 ChatGPT 可以读取必要上下文，但无法写文件、执行命令或修改 Git 状态。

### US-04 明确项目身份

作为多项目用户，我希望状态栏和工具结果明确显示当前连接项目，而不会把 ReviewLume 连接器名与 repository 名混淆。

### US-05 控制数据外发

作为用户，我希望只有主动连接、在 ChatGPT 对话中启用 ReviewLume 并触发工具调用后，repository 数据才可能离开本机。

### US-06 撤销连接

作为用户，我希望停止连接后本地端口和 Token 立即失效，并可在 OpenAI Platform 撤销 Runtime API Key 或删除 Tunnel。

## 7. 当前只读工具

- `repository_summary`
- `git_status`
- `recent_commits`
- `get_diff`
- `list_files`
- `read_file`
- `search_code`

所有工具声明 read-only、non-destructive、idempotent 和 closed-world。

## 8. 隐私边界

P9 MCP 强制：

- repository root、realpath 和 `.git` 边界；
- 拒绝绝对路径、父目录逃逸和外部 symlink；
- 拒绝目录、二进制和超大文件读取；
- 限制结果大小、文件数、行数、并发和调用频率；
- Runtime API Key 只存入 VS Code SecretStorage；
- 日志不记录文件正文、diff、搜索词、搜索结果或凭据。

P9 MCP 不自动：

- 阻止 `.env`、credentials、secrets、证书、私钥或生产配置文件名；
- 对文件、diff、搜索结果或提交标题运行 SecretScanner；
- 保证识别 API Key、Token、密码、连接串、个人数据或客户数据；
- 把 `.gitignore` 当成完整保密边界。

P8 Advanced Review Pack 的 SecretScanner 和导出门禁是独立能力，不会自动保护 P9 工具调用。

## 9. 高级审计工作流

需要保存审核证据时，可以使用 P8 Advanced：

- Git 范围和文件选择；
- SecretScanner；
- Review Pack 导出；
- AI 回答导入；
- 结构化问题报告；
- 问题状态处理；
- 实施提示和修复摘要；
- 二次复核和结果对比。

这些能力不改变 P9 默认只读 MCP 的权限。

## 10. 明确不实现

- 通用编码 Agent；
- 自动写代码或删除文件；
- 自动应用补丁；
- 自动执行命令；
- Git commit、push、checkout、reset、clean、merge 或 rebase；
- 自动登录 ChatGPT；
- 读取 Cookie、Session、密码或浏览历史；
- 调用第三方 AI 内部接口；
- 绕过 ChatGPT、Codex 或 API 额度；
- 一次连接跨越多个 Git repository；
- 声称所有秘密都会被自动拦截。

## 11. 第三方与可用性

ReviewLume 是独立开源项目，与 OpenAI、Microsoft 或其他服务商没有隶属或背书关系。

OpenAI Platform Tunnel、Runtime API Key、ChatGPT Apps/Connectors、Developer mode、套餐权限和界面由 OpenAI 控制并可能变化。ReviewLume 不能为缺少自定义 MCP 入口的账户本地开启或绕过该能力。

首次配置见 [ChatGPT 与 OpenAI Secure MCP Tunnel 配置指南](chatgpt-secure-mcp-setup.md)，数据处理见 [PRIVACY.md](../PRIVACY.md)。