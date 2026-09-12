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
- 根目录无 Git repository 或 discovery 不可用 → **Folder Project**。

Folder Project 内部可以包含多个真实 Git 子仓库。它们仍然位于同一个授权 Folder root 内，并且只能按显式子仓库路径做只读 Git 查询。

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

连接成功后状态栏会明确显示外层项目类型，例如：

```text
ReviewLume: ai-ui · Git
```

或：

```text
ReviewLume: fbs · Folder
```

Folder 内即使发现多个 Git 子仓库，状态栏仍显示 `Folder`，因为本次连接的授权边界仍是这个 Folder root。

一次连接只绑定一个 canonical Project Root。不会跨多个 Workspace Folder 混读。

## 6. ReviewLume 自动执行什么

连接时 ReviewLume：

1. canonicalize 所选 Workspace Folder；
2. 使用只读 Git discovery 尝试解析根 Git top-level；
3. 成功则创建 Git Project，否则以所选 Folder 创建 Folder Project；
4. 只有直接 Git Project 才允许进入现有 repository-bound Local Verification `runOnConnect` 流程；
5. Folder Project 不 discovery、不运行 Local Verification；
6. 启动仅监听 `127.0.0.1` 随机端口的本地只读 MCP；
7. 生成新的本地高熵 Token；
8. 运行官方 `tunnel-client doctor --explain`；
9. 启动 Secure MCP Tunnel；
10. 校验 loopback health；
11. 健康后打开 ChatGPT 新对话。

如果 Git CLI 不可用，ReviewLume 会安全降级为 Folder Project；文件工具仍可工作，但 nested Git discovery/query 不能伪造 Git 结果。

## 7. 在 ChatGPT 创建/刷新 ReviewLume 应用

首次使用时，在 ReviewLume Tunnel 已连接的情况下：

1. 打开 ChatGPT Apps/Connectors 管理页。
2. 创建自定义应用/MCP 连接器。
3. 名称使用 `ReviewLume`。
4. 连接方式选择 Tunnel。
5. 选择前面创建的 Tunnel。
6. 执行工具扫描/Scan tools。
7. 保存应用。

### 稳定工具契约

ReviewLume 对 Git Project 和 Folder Project 都固定暴露同一组 **11 个只读工具**：

- `project_summary`
- `list_git_repositories`
- `repository_summary`
- `git_status`
- `recent_commits`
- `get_diff`
- `list_files`
- `read_file`
- `search_code`
- `verification_status`
- `read_verification_output`

这样做是因为 ChatGPT 可能保留已批准工具名和 input schema 的快照。如果 Git/Folder 切换时 `tools/list` 发生变化，同一个 Tunnel 会出现旧快照和新运行时不一致。

现在切换 Project Kind 时，工具名称和公开 schema 保持不变，运行时根据当前 `projectKind` 决定行为：

- **Git Project**：`repository_summary` / `git_status` / `recent_commits` / `get_diff` 直接作用于当前 Git root，`repository` 参数必须省略；`list_git_repositories` 只说明当前 root 已经是 Git Project，无需子仓库选择。
- **Folder Project**：先用 `list_git_repositories` 找到真实子仓库；四个 Git query 的 `repository` 参数在运行时必填，并且只能使用 discovery 返回的 Folder-relative path。
- **Local Verification evidence**：两个工具名在两种模式下都稳定存在，但 Folder Project 调用会明确返回 unavailable，并且不会启动任何进程；直接 Git Project 才能按原有 repository-bound 规则读取 evidence。

任一模式都不应出现 shell、terminal、write、delete、patch、Git mutation 或通用 process-start 工具。

### 什么时候需要重新 Scan Tools

正常在 Git Project 与 Folder Project 之间切换，**不再需要**因为 project kind 变化而删除/重建 ChatGPT 应用。

只有 ReviewLume 未来版本真的修改了这组稳定工具名或公开 input schema 时，才需要在 Apps/Connectors 管理页 Refresh / Scan Tools；如果当前 ChatGPT 工作区无法刷新，才需要重新创建应用。

如果扫描结果出现 write、delete、shell、terminal、patch、Git mutation 或 general process-start capability，应停止使用并检查是否连接了错误服务。

## 8. 日常使用

### Git Project

```text
检查当前项目最近 5 个提交，先看 Git 状态和提交范围，再读取必要的 diff、源码、测试和配置。不要修改任何文件。
```

### Folder Project：跨子项目读代码

```text
先看当前 Folder Project 的结构，再搜索并读取和 WebSocket 重连有关的源码、配置和测试，做一次只读代码审核。不要修改任何文件。
```

### Folder Project：查看一个下级 Git 仓库

```text
先列出当前 Folder 内可用的 Git repositories，然后查看 fbs-ui 的 branch、当前 Git status、最近 5 次提交和 working diff。只检查 fbs-ui，不要合并其它仓库状态。
```

Folder root 本身不能可靠回答一个“聚合的最近改动”。但如果问题明确指向一个 `list_git_repositories` 已发现的子仓库，ReviewLume 可以读取那个子仓库自己的 branch/HEAD/status/commits/diff。

## 9. Project 文件与隐私边界

所有 Project Kind：

- project file 工具拒绝绝对路径、`..`、直接 `.git` 读取、root 外 realpath、目录、binary、超大文件；
- local MCP 和返回结果有大小、数量、请求和速率预算；
- 不提供 shell、terminal、write/delete/rename、patch 或 Git mutation；
- 项目文件和 AI 回复都是不可信输入；
- ReviewLume 不记录文件正文、diff、搜索词、搜索结果或 raw verification output 到诊断日志。

### Git Project

为保持既有 Connector 兼容，Git Project 不会仅按 `.env`、credentials、secrets、key、数据库或生产配置等文件名自动阻断。tracked 敏感文件仍可能被枚举/读取；P8 SecretScanner 不自动覆盖 MCP。

### Folder Project 文件工具

Folder file listing/reading/search 采用更保守的策略：

- 不跟随 symlink/junction-like link；
- 每个枚举候选 realpath 必须留在 root；
- 跳过 VCS metadata、常见依赖/build/cache 目录和 credential-store 目录；
- 阻止 `.env` secrets、常见 credentials/secrets 文件、private-key names 和 key/certificate container 文件；
- `.env.example/.sample/.template/.dist` 可作为模板读取。

### Folder Project nested Git

Nested Git discovery 只在授权 root 内有界扫描，并要求：

- candidate 是实际目录，不通过外部 symlink/junction 进入；
- candidate 有本地 `.git` marker；
- Git top-level 与 absolute git-dir 都 canonicalize 到授权 root 内；
- Git query 的 `repository` 必须精确匹配 discovery 返回值。

Nested Git status/history/diff 复用现有 Git Project 语义，因此**不会被 Folder direct-file 的 `.env` 等文件名 denylist 自动过滤**。显式 Git diff 仍可能包含敏感 tracked 内容。

这些机制都不是内容 DLP。连接前必须移除、轮换或脱敏真实密钥，并确认有权把内容提供给 OpenAI。

详细说明见 [PRIVACY.md](../PRIVACY.md)、[安全与合规边界](security-and-compliance.md) 和 [Folder Project Support](folder-project-support.md)。

## 10. Local Verification

Local Verification 仍然是 direct Git Project-only：

- approval 绑定 canonical Git repository；
- 固定 executable/argv/target mode/timeout；
- `shell: false`；
- 不执行 AI 回复或项目文档中的命令；
- evidence tools 只能读取已完成结果。

为保持 ChatGPT MCP schema 稳定，`verification_status` 和 `read_verification_output` 的工具名在 Folder Project 也会被广告，但调用会直接返回 unavailable；Folder Project 不 discovery、不运行 Local Verification，也不会自动对 nested Git repositories 执行测试或复用授权。

## 11. 常见问题

### 普通文件夹没有根 `.git` 能连接吗？

可以。只要 Workspace Folder 已 Trusted，就会作为 Folder Project 连接并提供跨 Folder 文件读取/搜索；如果内部包含真实 Git 子仓库，还可以通过 `list_git_repositories` 和显式 repository 参数做只读 Git 查询。

### Folder Project 可以看某个子项目的 Git 吗？

可以。先让 ReviewLume 列出 nested Git repositories，再明确指定其中一个，例如 `fbs-ui`。它可以查看该仓库自己的 summary/status/commits/diff，但不会把多个仓库合成一个 Git 状态。

### 从 Folder 切到 Git Project 要重建 ChatGPT App 吗？

当前稳定工具契约下不需要。保持同一个 ReviewLume Tunnel/App，重新连接当前项目即可。只有将来 ReviewLume 版本真的改变稳定工具名或公开 schema 时才需要 Refresh / Scan Tools。

### ChatGPT 没有自定义应用/连接器入口

这是 ChatGPT 账户、工作空间、套餐或灰度权限问题。ReviewLume 无法本地开启或绕过。

### 工具列表仍是旧版本

如果刚升级到引入稳定工具契约的版本，旧 App 可能仍保存此前的 7/9-tool 快照。执行一次 Refresh / Scan Tools；如果当前界面没有刷新能力，删除旧 App 后用同一 Tunnel 重新创建一次。完成这一次迁移后，日常 Git/Folder 切换不再需要重复重建。

### Tunnel 启动失败

从状态栏打开 **Tunnel Diagnostics** 或 **ReviewLume Logs**，重点检查 Tunnel ID、Runtime Key、官方客户端来源、代理和本机网络/安全软件。不要公开粘贴密钥、本地 Token、Authorization Header、完整诊断原文或私有源码。

### 如何停止和撤销

- VS Code：**ReviewLume MCP → Stop Secure MCP Connection**；
- OpenAI Platform：撤销 Runtime API Key 或删除 Tunnel；
- ChatGPT：禁用/删除 ReviewLume 应用；
- 本地：卸载 ReviewLume，并按需清理 VS Code extension storage。
