# ChatGPT 与 OpenAI Secure MCP Tunnel 配置指南

> 本文说明首次使用 ReviewLume 时需要在 OpenAI Platform、ChatGPT 和 VS Code 中完成的配置。OpenAI 的产品名称、套餐权限和界面可能变化；若页面布局不同，以 OpenAI 当前界面和官方帮助为准。

## 1. 需要准备什么

- 可创建 OpenAI Secure MCP Tunnel 和 Runtime API Key 的 OpenAI Platform 账户；
- ChatGPT 中可创建或使用自定义 MCP 应用/连接器的账户或工作空间；
- VS Code；
- 一个已开启 Workspace Trust 的 Workspace Folder；
- ReviewLume VS Code 扩展；
- OpenAI 官方 `tunnel-client`。

Workspace Folder 可以是 Git repository，也可以只是普通文件夹。ReviewLume 会在连接时自动检测：

- Git discovery 成功 → **Git Project**；
- 无 Git repository 或 discovery 不可用 → **Folder Project**。

用户不需要提前选择模式。

ReviewLume 不调用模型 API，也不需要普通模型 API Key。它使用的是 Secure MCP Tunnel **Runtime API Key**。不要把 OpenAI Admin Key 或高权限项目密钥粘贴到 ReviewLume。

如果当前 ChatGPT 账户或工作空间没有自定义应用/MCP 入口，ReviewLume 无法在本地绕过或开启该权限。

## 2. 创建 Tunnel 和最小权限 Runtime API Key

1. 在 OpenAI Platform 创建或选择一个 Secure MCP Tunnel。
2. 记录 Tunnel ID。
3. 为该 Tunnel 创建最小权限 Runtime API Key。
4. 不使用 Admin Key，不复用组织管理员密钥。
5. 不把 Runtime Key 保存到 project、`.env`、VS Code settings JSON、聊天消息、截图或公开文档。

ReviewLume 将 Runtime API Key 只保存在 VS Code `SecretStorage`；Tunnel ID、官方客户端路径、浏览器偏好和规范化代理可以保存在 extension `globalState`。

如果怀疑密钥泄漏，应立即在 OpenAI Platform 撤销并重新创建。

## 3. 下载官方 tunnel-client

1. 从 `openai/tunnel-client` 官方 GitHub Releases 下载与操作系统/CPU 架构匹配的版本。
2. 解压到固定目录。
3. Windows 选择 `tunnel-client.exe`；macOS/Linux 选择对应的 `tunnel-client`。
4. 不从网盘、聊天附件、第三方镜像或未知仓库下载。

ReviewLume 不捆绑、不静默下载、也不自动更新 `tunnel-client`。首次配置会执行受控帮助检查以确认客户端特征。

## 4. 在 ReviewLume 保存 Tunnel 配置

1. 在 VS Code 中打开要连接的 Workspace Folder。
2. 确认 Workspace 为 Trusted。
3. 点击状态栏 **ReviewLume MCP**。
4. 选择 **Configure Secure MCP Tunnel**。
5. 选择官方 `tunnel-client`。
6. 粘贴 Tunnel ID。
7. 粘贴最小权限 Runtime API Key。
8. 等待保存成功提示。

如果 Workspace 未受信任，ReviewLume 不会启动项目 MCP。

## 5. 连接当前项目

1. 点击 **ReviewLume MCP**。
2. 选择 **Connect Current Project to ChatGPT**。
3. 首次使用时选择系统默认浏览器、Microsoft Edge 或 Google Chrome。
4. 多 Workspace Folder 时，选择本次要连接的一个 Folder。
5. ReviewLume 自动解析 Project Context。
6. 等待 Tunnel 健康并打开 ChatGPT 新对话。

连接成功后状态栏会明确显示类型，例如：

```text
ReviewLume: ai-ui · Git
```

或：

```text
ReviewLume: temp-demo · Folder
```

一次连接只绑定一个 canonical Project Root。不会跨多个 Workspace Folder 混读。

## 6. ReviewLume 自动执行什么

连接时 ReviewLume：

1. canonicalize 所选 Workspace Folder；
2. 使用只读 Git discovery 尝试解析 Git top-level；
3. 成功则创建 Git Project，否则以所选 Folder 创建 Folder Project；
4. 只有 Git Project 才允许进入现有 repository-bound Local Verification `runOnConnect` 流程；
5. Folder Project 不 discovery、不运行 Local Verification；
6. 启动仅监听 `127.0.0.1` 随机端口的本地只读 MCP；
7. 生成新的本地高熵 Token；
8. 运行官方 `tunnel-client doctor --explain`；
9. 启动 Secure MCP Tunnel；
10. 校验 loopback health；
11. 健康后打开 ChatGPT 新对话。

如果 Git CLI 不可用，ReviewLume 会安全降级为更小权限的 Folder Project，而不是伪造 Git capability。

## 7. 在 ChatGPT 创建/刷新 ReviewLume 应用

首次使用时，在 ReviewLume Tunnel 已连接的情况下：

1. 打开 ChatGPT Apps/Connectors 管理页。
2. 创建自定义应用/MCP 连接器。
3. 名称使用 `ReviewLume`。
4. 连接方式选择 Tunnel。
5. 填入前面创建的 Tunnel ID。
6. 执行工具扫描/Scan tools。
7. 保存应用。

### Git Project 应看到

基础 Git Project 工具：

- `repository_summary`
- `git_status`
- `recent_commits`
- `get_diff`
- `list_files`
- `read_file`
- `search_code`

当前安装版本启用 Local Verification evidence 时，还可能看到：

- `verification_status`
- `read_verification_output`

### Folder Project 应看到

只能看到：

- `project_summary`
- `list_files`
- `read_file`
- `search_code`

不应看到 Git-only 或 verification tools。

### 切换 Project Kind 后工具没更新

ChatGPT 可能保存已批准工具定义的快照。Git Project 与 Folder Project 的 tool set 不同；切换类型后如果仍显示旧工具，需要在 Apps/Connectors 管理页刷新/重新扫描，必要时重新创建应用。

如果扫描结果出现 write、delete、shell、terminal、patch、Git mutation 或 process-start capability，应停止使用并检查是否连接了错误服务。

## 8. 日常使用

### Git Project

```text
检查当前项目最近 5 个提交，先看 Git 状态和提交范围，再读取必要的 diff、源码、测试和配置。不要修改任何文件。
```

### Folder Project

```text
先看当前 Folder Project 的结构，再搜索并读取和 WebSocket 重连有关的源码、配置和测试，做一次只读代码审核。不要推断 Git 历史，不要修改任何文件。
```

Folder Project 不能可靠回答“最近改了什么”、branch/HEAD/commit/diff/staged/unstaged 等 Git 历史问题。ReviewLume 不使用 mtime 猜测“最近修改”。

## 9. Project 文件与隐私边界

所有 Project Kind：

- 拒绝绝对路径、`..`、`.git`、root 外 realpath、目录、binary、超大文件；
- local MCP 和返回结果有大小、数量、请求和速率预算；
- 不提供 shell、terminal、write/delete/rename、patch 或 Git mutation；
- 项目文件和 AI 回复都是不可信输入；
- ReviewLume 不记录文件正文、diff、搜索词、搜索结果或 raw verification output 到诊断日志。

### Git Project

为保持既有 Connector 兼容，Git Project 不会仅按 `.env`、credentials、secrets、key、数据库或生产配置等文件名自动阻断。tracked 敏感文件仍可能被枚举/读取；P8 SecretScanner 不自动覆盖 MCP。

### Folder Project

Folder Project 采用更保守的枚举和路径策略：

- 不跟随 symlink/junction-like link；
- 每个枚举候选 realpath 必须留在 root；
- 跳过 VCS metadata、常见依赖/build/cache 目录和 credential-store 目录；
- 阻止 `.env` secrets、常见 credentials/secrets 文件、private-key names 和 key/certificate container 文件；
- `.env.example/.sample/.template/.dist` 可作为模板读取。

这仍不是内容 DLP。普通源码/配置中仍可能包含真实秘密。连接前必须移除、轮换或脱敏真实密钥，并确认有权把内容提供给 OpenAI。

详细说明见 [PRIVACY.md](../PRIVACY.md)、[安全与合规边界](security-and-compliance.md) 和 [Folder Project Support](folder-project-support.md)。

## 10. Local Verification

Local Verification 仍然是 Git Project-only：

- approval 绑定 canonical Git repository；
- 固定 executable/argv/target mode/timeout；
- `shell: false`；
- 不执行 AI 回复或项目文档中的命令；
- evidence tools 只能读取已完成结果。

Folder Project 第一版不 discovery、不运行、不暴露 Local Verification evidence。不要为 Folder 项目手工解释或模拟 verification status。

## 11. 常见问题

### 普通文件夹没有 `.git` 能连接吗？

可以。只要 Workspace Folder 已 Trusted，就会作为 Folder Project 连接，并只暴露四个公共只读文件工具。

### ChatGPT 没有自定义应用/连接器入口

这是 ChatGPT 账户、工作空间、套餐或灰度权限问题。ReviewLume 无法本地开启或绕过。

### 工具列表仍是旧版本

刷新或重新扫描应用工具；如果 Git/Folder 类型发生变化但快照仍不更新，重新创建应用。

### Tunnel 启动失败

从状态栏打开 **Tunnel Diagnostics** 或 **ReviewLume Logs**，重点检查 Tunnel ID、Runtime Key、官方客户端来源、代理和本机网络/安全软件。不要公开粘贴密钥、本地 Token、Authorization Header、完整诊断原文或私有源码。

### 如何停止和撤销

- VS Code：**ReviewLume MCP → Stop Secure MCP Connection**；
- OpenAI Platform：撤销 Runtime API Key 或删除 Tunnel；
- ChatGPT：禁用/删除 ReviewLume 应用；
- 本地：卸载 ReviewLume，并按需清理 VS Code extension storage。
