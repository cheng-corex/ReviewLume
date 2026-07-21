# P9 ChatGPT 只读项目 MCP + Secure MCP Tunnel 人工验收清单

## 验收前提

- 使用 Draft PR #21 最新分支构建并安装 VSIX 0.1.8。
- Windows VS Code 打开一个不含真实凭据的测试 Git repository。
- VS Code Workspace Trust 已开启。
- ChatGPT Plus 账号已开启开发者模式，并可创建自定义连接器。
- OpenAI Platform 已创建一个 Tunnel 和对应的最小权限 Runtime API Key。
- 从 `openai/tunnel-client` 官方 Releases 下载 Windows 压缩包并完整解压；不要只移动单个可执行文件，保留同包 companion 文件。
- 不把本地 MCP 端口直接发布到公网。

## 1. 首次配置

1. 点击状态栏 `ReviewLume MCP`。
2. 选择 `Configure Secure MCP Tunnel`。
3. 选择解压目录中的官方 `tunnel-client.exe`。
4. 粘贴 OpenAI Tunnel ID。
5. 粘贴 Runtime API Key，确认使用的是 Runtime Key 而不是 admin key。
6. 关闭并重新打开设置，确认 VS Code settings 中没有 Runtime Key、Token 或 Secret 字段。
7. 检查 repository，确认没有新增凭据文件。

通过标准：

- 非 `tunnel-client` 程序被拒绝；
- Tunnel ID 格式错误被拒绝；
- Runtime Key 只保存在 VS Code SecretStorage；
- 设置中最多出现机器级官方二进制路径，不出现密钥。

## 2. 一键启动

1. 点击状态栏 `ReviewLume MCP`。
2. 选择 `Connect Current Repository to ChatGPT`。
3. 多根 workspace 时确认只选择一个 workspace folder。
4. 观察状态栏依次出现启动中和已连接状态。
5. 确认 ReviewLume 自动运行本地 MCP、`tunnel-client doctor --explain`、隧道启动和 readiness 检查。
6. 确认 ChatGPT Connectors 页面自动打开，剪贴板中只有 Tunnel ID，没有 Runtime Key 或本地 Token。

通过标准：一次操作完成本地 MCP 和官方 Secure MCP Tunnel 启动；一次连接只绑定一个 repository。

## 3. tunnel-client 和健康边界

1. 打开 `Open Tunnel Diagnostics`。
2. 确认诊断 UI 地址是 `http://127.0.0.1:<随机端口>/ui` 或 `localhost`，不是公网地址。
3. 确认 `/readyz` 返回 200。
4. 确认 tunnel-client 进程参数只有 `run`，没有 Runtime Key、本地 Token 或 Authorization Header。
5. 确认进程环境通过 `env:` 引用构造 `X-ReviewLume-Token`，Header 配置本身不含 Token 明文。
6. 故意使用错误 Tunnel ID 或 Runtime Key，确认 doctor/启动失败且状态栏显示失败，不保持“已连接”。
7. 恢复正确配置后重新连接。

通过标准：诊断面仅 loopback；凭据不在 argv；失败安全停止。

## 4. ChatGPT 自定义连接器

1. 在 ChatGPT Connectors 页面创建自定义连接器。
2. 选择 `Connection: Tunnel`。
3. 粘贴 ReviewLume 已复制的 Tunnel ID。
4. 扫描工具并确认只出现：
   - `repository_summary`
   - `git_status`
   - `recent_commits`
   - `get_diff`
   - `list_files`
   - `read_file`
   - `search_code`
5. 确认没有 shell、terminal、write、delete、patch、Git mutation 工具。
6. 保存并在新对话中启用该连接器。

所有工具 annotations 应为：

```json
{
  "readOnlyHint": true,
  "destructiveHint": false,
  "idempotentHint": true,
  "openWorldHint": false
}
```

## 5. ChatGPT 自主范围选择

在 ChatGPT 中发送：

> 看一下当前项目最近的提交，有没有明显问题和优化点。

观察工具调用链。合理链路应包含其中若干项：

1. `repository_summary`；
2. `git_status`；
3. `recent_commits`；
4. `get_diff`；
5. `search_code`；
6. `read_file`。

通过标准：用户不需要在 VS Code 预先扫描、选择提交、选择文件、导出审核包或导入回答；ChatGPT 根据问题和工具结果继续读取必要上下文。

## 6. 本地网络和鉴权边界

1. 确认本地 endpoint 为 `http://127.0.0.1:<随机端口>/mcp`。
2. 确认未监听 `0.0.0.0`、局域网 IP 或公网 IP。
3. 不带 Authorization 或 `X-ReviewLume-Token` 调用 endpoint，确认返回 401。
4. 使用错误 Token，确认返回 401。
5. 本地 Bearer 和官方 Tunnel 专用 Header 都能以正确 Token完成 `ping`。
6. 停止并重新启动，确认端口或 Token 至少一项发生变化，旧 Token 不可继续使用。

通过标准：服务仅 loopback，随机 Token 不跨服务生命周期复用，ChatGPT 连接器认证不会替代本地专用 Header。

## 7. 路径和敏感内容

尝试通过 `read_file` 或 `get_diff` 访问：

- `../outside.txt`；
- 绝对路径；
- `.git/config`；
- `.env`；
- 私钥或 `.pem`/`.p12`/`.pfx` 文件；
- 指向 repository 外部的 symlink；
- 二进制文件；
- 超过文件大小上限的文本文件；
- 普通 `.ts` 文件中临时放置的测试 Token/密码格式；
- 包含敏感内容的 diff、搜索结果或提交标题。

通过标准：全部拒绝或排除；错误中不泄漏文件正文、凭据、Token 或 repository 外部内容。

## 8. Git 只读边界

确认 MCP 工具不能执行或间接触发：

- checkout；
- reset；
- clean；
- add；
- commit；
- merge；
- rebase；
- push；
- fetch；
- 任意 shell 命令；
- 写文件、删除文件或应用补丁。

通过标准：MCP 工具列表中不存在写操作或通用命令执行入口。

## 9. 内容、大小和日志边界

- 大 diff 明确返回截断标记。
- 搜索结果达到上限时明确标记截断。
- 超大请求返回 413，非 JSON 请求返回 415。
- 日志只出现安全的状态、repository 显示名、Tunnel ID 和工具名。
- 日志不出现 Runtime Key、本地 Token、Authorization、查询词、文件正文、diff 或搜索结果。
- repository 文档中的提示无法要求 ReviewLume 扩大权限或执行命令。

## 10. 停止、异常和重启

1. 选择 `Stop Secure MCP Connection`。
2. 确认 tunnel-client 先停止，本地 MCP 后停止。
3. 使用旧 endpoint/Token 再次请求，确认不可用。
4. 在连接状态关闭 VS Code Extension Host，确认隧道和本地 MCP 都退出。
5. 强制结束 tunnel-client，确认状态栏显示失败而不是继续显示已连接。
6. 重新启动时确认需要新的本地 Token，但不需要重新输入已保存在 SecretStorage 的 Runtime Key。

通过标准：没有残留进程、半连接状态或持久化本地 Token。

## 11. 原有高级功能回归

确认以下能力仍可通过命令面板使用，但不影响 MCP 主流程：

- Review Pack；
- 敏感内容扫描；
- Review History；
- 回答导入；
- issue 状态；
- 实施提示；
- 二次复核。

原浏览器填入桥接命令不应出现在命令面板或 activation events 中。

## 验收记录

请记录：

- Windows 版本；
- VS Code 版本；
- ReviewLume VSIX 版本；
- ChatGPT 套餐/工作区类型；
- ChatGPT 开发者模式状态；
- tunnel-client 版本；
- Tunnel ID 的脱敏后缀；
- 测试 repository 类型；
- 每项结果；
- 必要的脱敏截图。

不得在验收记录中粘贴 Runtime API Key、本地 MCP Token 或完整 Authorization Header。
