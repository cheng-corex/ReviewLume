# 用户指南

## 1. 当前默认主流程

ReviewLume 的默认主流程是：把当前 VS Code 中的一个 Git repository 通过只读 MCP 和 OpenAI Secure MCP Tunnel 连接给 ChatGPT，然后直接在 ChatGPT 中发出审核指令。

首次使用前，请先完成：

- [ChatGPT 与 OpenAI Secure MCP Tunnel 配置指南](chatgpt-secure-mcp-setup.md)

日常使用：

1. 在 VS Code 打开要检查的 Git repository。
2. 确认 Workspace Trust 已开启。
3. 点击底部状态栏 **ReviewLume MCP**。
4. 选择 **Connect Current Repository to ChatGPT**。
5. 多根工作区时选择本次要连接的一个 workspace folder。
6. 等待 Tunnel 健康并自动打开 ChatGPT 新对话。
7. 在当前对话启用 ReviewLume 应用/连接器。
8. 直接发送审核指令。

示例：

```text
检查当前项目最近 5 个提交，自己选择合理的文件和测试范围，找出明确问题和优化建议。不要修改任何文件。
```

一次连接只绑定一个 Git repository。切换项目时，应停止旧连接，再从目标项目的 VS Code 窗口重新连接。

## 2. ReviewLume 提供给 ChatGPT 的工具

- `repository_summary`：当前连接项目、分支、HEAD、最近提交和工作区摘要。
- `git_status`：staged、unstaged 和 untracked 状态。
- `recent_commits`：最近提交列表。
- `get_diff`：working、staged 或 commit range diff。
- `list_files`：tracked 和未忽略 untracked 文件列表。
- `read_file`：repository 内普通文本文件的有界行范围。
- `search_code`：有界字面量搜索。

这些工具都是只读、非破坏和幂等的。ReviewLume 不提供：

- shell 或终端；
- 写入或删除文件；
- 应用补丁；
- Git add、commit、checkout、reset、clean、merge、rebase、fetch 或 push；
- 执行 ChatGPT 返回的命令。

## 3. 当前连接项目名称

ReviewLume 是连接器名称，不是 repository 名称。

正常状态示例：

```text
当前连接项目是 NursePrep，访问模式为只读。
```

项目不叫 ReviewLume 并不是错误。状态栏会显示本次实际连接的 repository 名称。

## 4. 浏览器和连接管理

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

## 5. 重要隐私说明

P9 MCP 不会自动运行 SecretScanner，也不会仅因为文件名或内容看起来敏感就阻止读取。

必须理解：

- `.env`、credentials、secrets、证书、私钥、数据库或生产配置文件名不会被 P9 自动阻止；
- `read_file` 可以读取 repository 内被明确指定的普通文本文件，包括 ignored 文件；
- tracked 敏感文件可以出现在 `list_files` 和 `search_code` 中；
- diff、文件摘录、提交标题和搜索结果可能包含 API Key、Token、密码、连接串、个人数据、客户数据或内部地址；
- `.gitignore` 不是完整保密边界；
- P8 Advanced Review Pack 的 SecretScanner 不会自动保护 P9 MCP 调用。

连接前应：

1. 移除、轮换或脱敏真实密钥；
2. 不使用包含生产凭据、生产数据库或真实客户数据的测试 repository；
3. 必要时使用脱敏副本、测试分支或专用 review repository；
4. 确认组织允许把这些内容提供给 OpenAI；
5. 审核完成后停止连接。

完整说明见 [PRIVACY.md](../PRIVACY.md)。

## 6. 常见审核指令

### 最近提交检查

```text
检查当前项目最近 5 个提交。先看 Git 状态和提交范围，再读取必要的 diff、源码、测试和配置。只报告明确问题和高价值优化，不要修改任何文件。
```

### 当前未提交改动

```text
检查当前工作区所有 staged、unstaged 和 untracked 改动。自己选择相关测试和配置，重点找类型、并发、路径、安全和回归问题。不要修改文件。
```

### 指定 commit range

```text
检查 <base SHA> 到 HEAD 的改动。先确认范围，再查看相关实现和测试。按严重程度报告明确问题，并说明证据。
```

### 指定模块

```text
检查当前项目中与 <模块名> 有关的最近改动。优先查看调用链、类型、错误处理、测试和跨平台影响。不要扩大到无关模块。
```

## 7. P8 Advanced 审核包流程

需要可审计 Review Pack、回答导入、问题状态和二次复核时，继续使用 P8 Advanced。

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

## 8. 常见问题

### ChatGPT 没有自定义应用/连接器入口

这是 ChatGPT 账户、套餐、工作空间或灰度权限问题。ReviewLume 无法本地开启或绕过。查看 OpenAI 当前官方说明，或使用具有该入口的工作空间。

### ChatGPT 看不到最新工具

ChatGPT 可能保存已批准工具的冻结快照。进入应用/连接器设置执行刷新或重新扫描；仍无效时删除旧应用并重新创建。

### Tunnel 无法启动

检查：

- Tunnel ID 是否正确；
- Runtime API Key 是否有效且权限足够；
- `tunnel-client` 是否来自官方 Release；
- 代理是否能访问 OpenAI 控制面；
- 防火墙或安全软件是否阻止子进程联网。

使用 **Open Tunnel Diagnostics** 和 **Show ReviewLume Logs** 排查，但不要公开粘贴 Runtime API Key、本地 MCP Token、Authorization Header、真实秘密或私有源码。

### ReviewLume 会自动修改代码吗？

不会。当前公开主线只提供 7 个只读 MCP 工具。

### ReviewLume 会调用模型 API 吗？

不会。它使用 OpenAI Secure MCP Tunnel 把本地只读工具连接给用户自己的 ChatGPT 账户，不调用模型 API，也不绕过 ChatGPT 或 API 额度。

### 审核结果一定正确吗？

不一定。ChatGPT 输出必须作为辅助意见，最终仍需开发者验证。