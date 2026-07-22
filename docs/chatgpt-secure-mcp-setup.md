# ChatGPT 与 OpenAI Secure MCP Tunnel 配置指南

> 本文说明首次使用 ReviewLume 时需要在 OpenAI Platform、ChatGPT 和 VS Code 中完成的配置。OpenAI 的产品名称、套餐权限和界面会变化；若页面布局与本文不同，以 OpenAI 当前界面和官方帮助为准。

## 1. 需要准备什么

- 一个可登录 `https://platform.openai.com/` 的 OpenAI Platform 账户，并具有创建 Tunnel 和 Runtime API Key 的权限；
- 一个可登录 `https://chatgpt.com/` 的 ChatGPT 账户，并且账户界面中可以创建或使用自定义 MCP 应用/连接器；
- VS Code、Git 和一个已开启 Workspace Trust 的 Git repository；
- ReviewLume VS Code 扩展；
- OpenAI 官方 `tunnel-client`。

ReviewLume 不调用模型 API，也不需要普通模型 API Key。它使用的是为 Secure MCP Tunnel 创建的 **Runtime API Key**。不要把 OpenAI Admin Key 或普通高权限项目密钥粘贴到 ReviewLume。

### ChatGPT 套餐和界面可用性

OpenAI 当前官方帮助把完整 MCP 与开发者模式主要列为 ChatGPT Business、Enterprise 和 Edu 的网页版能力，并说明 Pro 可连接具有 read/fetch 权限的自定义 MCP。ReviewLume 本身只暴露只读工具，但最终能否创建自定义应用/连接器仍取决于 ChatGPT 账户、工作空间和灰度开放状态。

判断方法很简单：

1. 打开 ChatGPT 网页版；
2. 进入 **Settings → Apps**、**Settings → Connectors** 或工作空间的 **Apps** 管理页；
3. 确认存在创建自定义应用、创建自定义连接器、Developer mode 或添加 MCP 的入口。

如果完全没有这些入口，ReviewLume 无法在本地绕过或开启该权限。

官方说明：

- [Developer mode and MCP apps in ChatGPT](https://help.openai.com/en/articles/12584461-developer-mode-apps-and-full-mcp-connectors-in-chatgpt-beta.svgz)
- [Apps in ChatGPT](https://help.openai.com/en/articles/11487775-connectors-in)

## 2. 在 OpenAI Platform 创建 Tunnel

1. 打开 [OpenAI Platform Tunnel 管理页](https://platform.openai.com/settings/organization/tunnels)。
2. 选择正确的 Organization。
3. 点击创建 Tunnel。
4. 名称建议使用容易识别的名称，例如 `ReviewLume Local Repository`。
5. 创建后复制 Tunnel ID。

Tunnel ID 格式应类似：

```text
tunnel_0123456789abcdefghijklmnopqrstuv
```

ReviewLume 会校验 `tunnel_` 后必须是 32 位小写字母或数字。

不要公开 Tunnel ID。它不是 Runtime API Key，但仍属于连接配置标识。

## 3. 创建最小权限 Runtime API Key

1. 打开 [OpenAI Platform API Keys 页面](https://platform.openai.com/settings/organization/api-keys)。
2. 选择创建新的 Runtime API Key。
3. 如果界面允许选择 Tunnel、资源范围或权限，只授予刚创建的 Tunnel 运行所需权限。
4. 不要选择 Admin Key，也不要复用组织管理员密钥。
5. 创建后立即复制密钥；离开页面后通常无法再次查看完整值。
6. 不要把密钥保存到 repository、`.env`、VS Code settings JSON、聊天消息、截图或公开文档中。

ReviewLume 只把 Runtime API Key 保存到 VS Code `SecretStorage`，不会主动写入：

- repository 文件；
- VS Code settings JSON；
- 子进程命令行参数；
- 剪贴板；
- ReviewLume 日志。

如果怀疑密钥泄漏，应立即在 OpenAI Platform 撤销并重新创建。

## 4. 下载官方 tunnel-client

1. 打开 [openai/tunnel-client 官方 Releases](https://github.com/openai/tunnel-client/releases/latest)。
2. 下载与操作系统和 CPU 架构匹配的压缩包。
3. 解压到固定目录。
4. Windows 选择 `tunnel-client.exe`；macOS/Linux 选择对应的 `tunnel-client` 可执行文件。
5. 不要从网盘、聊天附件、第三方镜像或不明仓库下载。

ReviewLume 不捆绑、不静默下载、也不自动更新 `tunnel-client`。首次配置时会执行 `tunnel-client --help`，确认帮助文本符合 OpenAI 官方客户端特征。

## 5. 在 ReviewLume 中保存 Tunnel 配置

1. 在 VS Code 中打开要连接的 Git repository。
2. 确认工作区处于 Trusted 状态。
3. 点击底部状态栏的 **ReviewLume MCP**。
4. 选择 **Configure Secure MCP Tunnel**。
5. 选择刚下载的官方 `tunnel-client` 可执行文件。
6. 粘贴 Tunnel ID。
7. 粘贴最小权限 Runtime API Key。
8. 等待配置保存成功提示。

本地存储位置：

- Tunnel ID：VS Code extension `globalState`；
- tunnel-client 路径：VS Code extension `globalState`；
- 浏览器偏好：VS Code extension `globalState`；
- Runtime API Key：VS Code `SecretStorage`。

## 6. 启动 ReviewLume Tunnel

1. 点击 **ReviewLume MCP**。
2. 选择 **Connect Current Repository to ChatGPT**。
3. 首次使用时选择系统默认浏览器、Microsoft Edge 或 Google Chrome。
4. 多根工作区时，选择本次要连接的一个 workspace folder。
5. 等待状态栏显示当前 repository 名称并进入已连接状态。

ReviewLume 会自动：

1. 识别所选 workspace 对应的 Git root；
2. 启动仅监听 `127.0.0.1` 随机端口的本地只读 MCP；
3. 生成新的本地高熵 Token；
4. 运行 `tunnel-client doctor --explain`；
5. 启动官方 Secure MCP Tunnel；
6. 校验 `/readyz` 和 `/api/status`；
7. 健康后打开 ChatGPT 新对话。

## 7. 在 ChatGPT 创建 ReviewLume 应用/连接器

首次只需创建一次。先让 ReviewLume Tunnel 保持已连接，然后：

1. 在 ReviewLume 状态栏菜单选择 **Manage ChatGPT Connector (Advanced)**，或手动进入 ChatGPT 的 Apps/Connectors 设置。
2. 选择创建自定义应用或自定义 MCP 连接器。
3. 名称填写 `ReviewLume`。
4. 连接方式选择 **Tunnel**。
5. 粘贴前面创建的 Tunnel ID。
6. 执行工具扫描或 **Scan tools**。
7. 确认发现以下 7 个只读工具：
   - `repository_summary`
   - `git_status`
   - `recent_commits`
   - `get_diff`
   - `list_files`
   - `read_file`
   - `search_code`
8. 保存或创建应用。

对于 Business、Enterprise 或 Edu 工作空间：

1. 管理员/Owner 先启用 Developer mode；
2. 在工作空间 Apps 页面创建并测试应用；
3. 需要提供给其他成员时，再由管理员审核权限并发布；
4. MCP 工具定义变更后，需要在 ChatGPT 中执行刷新、重新扫描，或重新创建应用。ChatGPT 不会自动采用服务器的新工具定义。

ReviewLume 没有写入、删除、Shell、终端或 Git mutation 工具。若扫描结果出现这些能力，应停止使用并检查是否选错了连接器。

## 8. 每次使用的日常流程

1. 在 VS Code 打开要检查的 repository。
2. 点击 **ReviewLume MCP → Connect Current Repository to ChatGPT**。
3. 等待 Tunnel 健康并自动打开 ChatGPT 新对话。
4. 在当前对话中启用 ReviewLume 应用/连接器。
5. 直接发送指令，例如：

```text
检查当前项目最近 5 个提交，自己选择合理的文件和测试范围，找出明确问题和优化建议。不要修改任何文件。
```

一次连接只绑定一个 Git repository。切换项目时，应停止旧连接，再从目标项目的 VS Code 窗口重新连接。

## 9. 重要隐私说明

ReviewLume P9 MCP **不会自动运行 SecretScanner，也不会默认阻止 `.env`、credentials、secrets、私钥文本或其他敏感配置文件**。

实际行为是：

- `list_files` 和 `search_code` 枚举 Git 已跟踪文件以及未忽略的未跟踪文本文件；
- `read_file` 可以读取 repository 内被明确指定的普通文本文件，即使文件名看起来敏感；
- `get_diff` 可以返回变更中出现的密钥、Token、连接串、个人数据或内部地址；
- `.git`、绝对路径、父目录逃逸、repository 外部 symlink、二进制和超大文件会被拒绝；
- 结果大小、读取行数、文件数、并发和调用频率受限；
- ReviewLume 不记录文件正文、diff、搜索词或搜索结果。

因此，在连接前必须：

- 移除、轮换或脱敏真实密钥；
- 不连接无权提供给 OpenAI 的 repository；
- 不在测试项目中放入真实生产数据；
- 必要时使用专门的脱敏副本或测试分支。

P8 Advanced Review Pack 流程仍然使用 SecretScanner 和导出门禁，但那是独立的高级工作流，不会自动保护 P9 MCP 工具调用。

完整说明见 [PRIVACY.md](../PRIVACY.md) 和 [安全与合规边界](security-and-compliance.md)。

## 10. 常见问题

### ChatGPT 没有自定义应用/连接器入口

这是 ChatGPT 账户、工作空间、套餐或灰度权限问题。ReviewLume 无法本地开启。查看 OpenAI 官方可用性说明，或换到具有该入口的工作空间。

### 工具列表仍是旧版本

ChatGPT 会保存已批准工具的快照。进入应用/连接器管理页执行刷新或重新扫描；仍不更新时，删除旧应用并重新创建。

### Tunnel 启动失败

从状态栏选择 **Open Tunnel Diagnostics** 或 **Show ReviewLume Logs**，重点检查：

- Tunnel ID 是否正确；
- Runtime API Key 是否被撤销或权限不足；
- `tunnel-client` 是否来自官方 Release；
- 代理是否可访问 OpenAI 控制面；
- 防火墙或安全软件是否阻止子进程联网。

不要在公开 issue 中粘贴 Runtime API Key、本地 MCP Token、Authorization Header、完整诊断原文或私有源码。

### ChatGPT 说当前项目不是 ReviewLume

ReviewLume 是连接器名称，不是 repository 名称。正常表述应是“当前连接项目是 NursePrep/你的项目名，访问模式为只读”。

### 如何停止和撤销

- VS Code：**ReviewLume MCP → Stop Secure MCP Connection**；
- OpenAI Platform：撤销 Runtime API Key，或删除 Tunnel；
- ChatGPT：禁用或删除 ReviewLume 应用/连接器；
- 本地：卸载 ReviewLume，并按需清理 VS Code extension storage。