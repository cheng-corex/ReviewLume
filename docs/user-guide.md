# 用户指南

## 1. 当前默认主流程

ReviewLume 的默认主流程是：把当前 VS Code 中选定的一个本地项目通过只读 MCP 和 OpenAI Secure MCP Tunnel 连接给 ChatGPT，然后直接在 ChatGPT 中发出审核指令。

项目可以是：

- **Git Project**：能从所选 Workspace Folder 解析出 Git repository；
- **Folder Project**：普通受信任文件夹，没有可用 Git repository。

首次使用前，请先完成：

- [ChatGPT 与 OpenAI Secure MCP Tunnel 配置指南](chatgpt-secure-mcp-setup.md)
- [Folder Project Support](folder-project-support.md)

日常使用：

1. 在 VS Code 打开要检查的项目文件夹。
2. 确认 Workspace Trust 已开启。
3. 点击底部状态栏 **ReviewLume MCP**。
4. 选择 **Connect Current Project to ChatGPT**。
5. 多根工作区时选择本次要连接的一个 workspace folder。
6. ReviewLume 自动判断 Git Project 或 Folder Project。
7. 等待 Tunnel 健康并自动打开 ChatGPT 新对话。
8. 在当前对话启用 ReviewLume 应用/连接器。
9. 直接发送审核指令。

一次连接仍只绑定一个 canonical project root。切换项目时，应停止旧连接，再从目标项目重新连接。本功能不把多个 Workspace Folder 混成一个审核上下文。

## 2. Git Project

Git Project 保持现有只读审核体验。

示例：

```text
检查当前项目最近 5 个提交，自己选择合理的文件和测试范围，找出明确问题和优化建议。不要修改任何文件。
```

可用 Git/文件工具：

- `repository_summary`：当前连接项目、分支、HEAD、最近提交和工作区摘要；
- `git_status`：staged、unstaged 和 untracked 状态；
- `recent_commits`：最近提交列表；
- `get_diff`：working、staged 或 commit range diff；
- `list_files`：tracked 和未忽略 untracked 文件列表；
- `read_file`：repository 内普通文本文件的有界行范围；
- `search_code`：有界字面量搜索。

当当前安装版本启用 Local Verification 时，Git Project 还可以暴露只读 evidence 工具：

- `verification_status`
- `read_verification_output`

这些 evidence 工具只能读取已经完成的结果，不能启动、重试、修改或拼接验证命令。

## 3. Folder Project

Folder Project 不要求 `.git`。例如打开：

```text
G:\Projects\temp-demo
```

即使它只是普通文件夹，也可以连接后执行：

```text
project_summary
    ↓
list_files
    ↓
search_code
    ↓
read_file
```

适合的请求包括：

```text
分析一下当前项目结构，看看主要入口、配置、测试和明显代码问题。不要修改任何文件。
```

```text
搜索当前项目里和 WebSocket 重连有关的实现，读取相关代码和测试，给我做一次只读代码审核。
```

Folder Project 只暴露：

- `project_summary`
- `list_files`
- `read_file`
- `search_code`

Folder Project **没有可靠 Git 历史**，因此不能回答：

- 最近提交是什么；
- 最近改了什么；
- staged / unstaged 有什么；
- 某个 commit range 的 diff；
- 当前 branch/HEAD 历史。

如果用户提出这些问题，正确行为是明确说明当前连接是 Folder Project，没有可靠 Git 历史，而不是根据文件时间或内容猜测“最近改动”。

Folder Project 第一版也不提供 Local Verification：不会发现验证规则、不会运行测试、不会暴露验证 evidence 工具。

## 4. 只读边界

无论 Git Project 还是 Folder Project，MCP 工具都是只读、非破坏和幂等的。ReviewLume 不提供：

- shell 或终端；
- 任意命令或 package script；
- 写入、删除或重命名文件；
- 应用补丁；
- Git add、commit、checkout、reset、clean、merge、rebase、fetch 或 push；
- 执行 ChatGPT 返回的命令；
- 执行项目文件、README、测试输出或 AI 回答里出现的指令。

项目文件始终是不可信输入。

## 5. 当前连接项目名称和类型

ReviewLume 是连接器名称，不是项目名称。

状态栏会明确显示实际项目和类型，例如：

```text
ReviewLume: NursePrep · Git
```

或：

```text
ReviewLume: temp-demo · Folder
```

项目不叫 ReviewLume 并不是错误。用户也不需要提前选择 Git/Folder 模式。

## 6. 多 Workspace Folder

如果当前 VS Code Workspace 包含多个 folder：

- ReviewLume 仍让用户选一个 Workspace Folder；
- 一次 MCP connection 只绑定该选择最终解析出的一个 Project Root；
- 不跨 root 枚举、读取或搜索；
- 本轮不实现多项目同时连接或 Multi Project Registry。

## 7. 浏览器和连接管理

首次连接时可以选择：

- System default browser；
- Microsoft Edge；
- Google Chrome。

偏好会保存在 VS Code extension globalState。需要修改时：

1. 点击 **ReviewLume MCP**；
2. 选择 **Choose ChatGPT Browser**。

System default browser 使用操作系统原生 URL 启动，不应出现 VS Code 的 Open/Cancel 外部网站确认。

连接器管理：

- **Open New Chat in ChatGPT**：保持当前 Tunnel，打开新对话；
- **Manage ChatGPT Connector (Advanced)**：显式打开 ChatGPT Apps/Connectors 管理页；
- **Open Tunnel Diagnostics**：查看 loopback-only Tunnel 健康页面；
- **Show ReviewLume Logs**：查看脱敏诊断日志；
- **Stop Secure MCP Connection**：停止 Tunnel 和本地 MCP，使当前本地 Token 失效。

Folder Project Support 不启动或扩展可选浏览器桥接。

## 8. 重要隐私说明

### Git Project

现有 Git MCP 为保持兼容，不会仅因为文件名或内容看起来敏感就自动阻止读取：

- `.env`、credentials、secrets、证书、私钥、数据库或生产配置文件名不会自动阻止；
- `read_file` 可以读取 repository 内被明确指定的普通文本文件，包括 ignored 文件；
- tracked 敏感文件可以出现在 `list_files` 和 `search_code` 中；
- diff、文件摘录、提交标题和搜索结果可能包含 API Key、Token、密码、连接串、个人数据、客户数据或内部地址；
- `.gitignore` 不是完整保密边界；
- P8 Advanced Review Pack 的 SecretScanner 不会自动保护 MCP 调用。

### Folder Project

Folder Project 的文件枚举更保守：

- 不枚举 `.git` 等 VCS metadata；
- 不跟随 symlink/junction-like link；
- 跳过常见依赖、构建和 credential-store 目录；
- 阻止 `.env` secret、常见 credential 文件和 key/certificate container 等明显敏感路径；
- 绝对路径、`..`、Windows drive/UNC 越界、root 外 realpath、二进制和超大文件继续被拒绝。

但这只是路径/文件类型边界，不是内容 SecretScanner。普通源码或配置中仍可能包含真实密钥和敏感数据。

连接前应：

1. 移除、轮换或脱敏真实密钥；
2. 不使用包含生产凭据、生产数据库或真实客户数据的项目副本；
3. 必要时使用脱敏副本、测试分支或专用 review project；
4. 确认组织允许把这些内容提供给 OpenAI；
5. 审核完成后停止连接。

完整说明见 [PRIVACY.md](../PRIVACY.md)。

## 9. 常见审核指令

### Git Project：最近提交检查

```text
检查当前项目最近 5 个提交。先看 Git 状态和提交范围，再读取必要的 diff、源码、测试和配置。只报告明确问题和高价值优化，不要修改任何文件。
```

### Git Project：当前未提交改动

```text
检查当前工作区所有 staged、unstaged 和 untracked 改动。自己选择相关测试和配置，重点找类型、并发、路径、安全和回归问题。不要修改文件。
```

### Git Project：指定 commit range

```text
检查 <base SHA> 到 HEAD 的改动。先确认范围，再查看相关实现和测试。按严重程度报告明确问题，并说明证据。
```

### Folder Project：结构与代码审核

```text
先确认当前连接类型。如果是 Folder Project，就查看项目摘要、文件结构，再搜索和读取与 <模块名> 有关的源码、配置和测试。不要推断 Git 历史，不要修改文件。
```

## 10. P8 Advanced 审核包流程

需要可审计 Review Pack、回答导入、问题状态和二次复核时，继续使用 P8 Advanced。

P8 Advanced 仍是 Git repository 工作流。本轮 Folder Project Support 只扩展只读 MCP，不把 Review Pack、Git diff、Review History 或二次复核状态机改造成 Folder 模式。

### 创建审核包

1. 运行 `ReviewLume: Create Review Pack`。
2. 选择 staged、unstaged 或 commit range。
3. 选择审核模式和文件范围。
4. 查看敏感扫描结果。
5. 预览并导出 Markdown、ZIP 或两者。

P8 Advanced 的 SecretScanner、HARD_BLOCK、BLOCK、WARN 和导出门禁只保护该 Review Pack 流程。

### 导入审核回答

1. 运行 `ReviewLume: Import Review Response`。
2. 选择审核会话。
3. 从文件或剪贴板导入完整回答。
4. ReviewLume 保存原始 `response.md` 并尝试生成 `report.json`。

### 查看和处理问题

1. 运行 `ReviewLume: Open Review History`。
2. 选择历史记录。
3. 查看结构化报告或原始回答。
4. 将问题设置为 Open、Fixed、Rejected 或 Needs review。
5. 生成实施提示、修复摘要或二次复核请求。

导入的 AI 回答始终是不可信文本；ReviewLume 不执行其中的命令或补丁。

## 11. 常见问题

### 普通文件夹没有 `.git`，还能连接吗？

可以。Trusted Workspace Folder 会作为 Folder Project 连接，提供 `project_summary`、`list_files`、`read_file` 和 `search_code`。

### Folder Project 能看“最近改了什么”吗？

不能可靠判断。没有 Git 历史时 ReviewLume 不会根据 mtime 或文件内容猜测最近改动。

### Folder Project 会运行本地测试吗？

不会。第一版 Folder Project 不启用 Local Verification。

### ChatGPT 没有自定义应用/连接器入口

这是 ChatGPT 账户、套餐、工作空间或灰度权限问题。ReviewLume 无法本地开启或绕过。查看 OpenAI 当前官方说明，或使用具有该入口的工作空间。

### ChatGPT 看不到最新工具

ChatGPT 可能保存已批准工具的冻结快照。Folder 和 Git Project 的 tool set 不同；切换项目类型后如工具未刷新，进入应用/连接器设置执行刷新或重新扫描，仍无效时删除旧应用并重新创建。

### Tunnel 无法启动

检查：

- Tunnel ID 是否正确；
- Runtime API Key 是否有效且权限足够；
- `tunnel-client` 是否来自官方 Release；
- 代理是否能访问 OpenAI 控制面；
- 防火墙或安全软件是否阻止子进程联网。

使用 **Open Tunnel Diagnostics** 和 **Show ReviewLume Logs** 排查，但不要公开粘贴 Runtime API Key、本地 MCP Token、Authorization Header、真实秘密或私有源码。

### ReviewLume 会自动修改代码吗？

不会。公开 MCP 只提供当前 Project Kind 对应的只读工具。

### ReviewLume 会调用模型 API 吗？

不会。它使用 OpenAI Secure MCP Tunnel 把本地只读工具连接给用户自己的 ChatGPT 账户，不调用模型 API，也不绕过 ChatGPT 或 API 额度。

### 审核结果一定正确吗？

不一定。ChatGPT 输出必须作为辅助意见，最终仍需开发者验证。
