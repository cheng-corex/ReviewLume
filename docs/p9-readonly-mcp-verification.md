# P9 ChatGPT 只读项目 MCP 人工验收清单

## 验收前提

- 使用 Draft PR #21 最新分支构建并安装 VSIX。
- Windows VS Code 打开一个不含真实凭据的测试 Git repository。
- VS Code Workspace Trust 已开启。
- ChatGPT 账号和工作区具备自定义 MCP app 能力。
- 使用 OpenAI Secure MCP Tunnel 连接本地 endpoint，不把本地端口直接发布到公网。

## 1. 启动和 repository 绑定

1. 点击状态栏 `ReviewLume MCP`。
2. 选择 `Start Read-only MCP`。
3. 多根 workspace 时确认只选择一个 workspace folder。
4. 确认状态栏显示被绑定的 repository 名称。
5. 确认日志只记录 repository 显示名和 loopback 端口，不记录 bearer token。

通过标准：一次连接只绑定一个 repository；非 Trusted Workspace 被拒绝。

## 2. 网络边界

1. 确认 endpoint 为 `http://127.0.0.1:<随机端口>/mcp`。
2. 确认未监听 `0.0.0.0`、局域网 IP 或公网 IP。
3. 不带 bearer token 调用 endpoint，确认返回 401。
4. 使用错误 token 调用，确认返回 401。
5. 停止并重新启动，确认端口或 token 至少一项发生变化，旧 token 不可继续使用。

通过标准：服务仅 loopback，随机 token 不跨服务生命周期复用。

## 3. MCP 协议

通过 MCP Inspector 或实际 ChatGPT app 验证：

- `initialize`；
- `notifications/initialized`；
- `ping`；
- `tools/list`；
- `tools/call`。

确认所有工具 annotations 为：

```json
{
  "readOnlyHint": true,
  "destructiveHint": false,
  "idempotentHint": true,
  "openWorldHint": false
}
```

## 4. ChatGPT 自主范围选择

在 ChatGPT 中发送：

> 看一下当前项目最近的提交，有没有明显问题和优化点。

观察工具调用链。合理链路应包含其中若干项：

1. `repository_summary`；
2. `git_status`；
3. `recent_commits`；
4. `get_diff`；
5. `search_code`；
6. `read_file`。

通过标准：用户不需要在 VS Code 预先选择提交、文件或测试；ChatGPT 根据问题和工具结果继续读取必要上下文。

## 5. 路径和敏感文件

尝试通过 `read_file` 读取：

- `../outside.txt`；
- 绝对路径；
- `.git/config`；
- `.env`；
- 私钥或 `.pem`/`.p12`/`.pfx` 文件；
- 指向 repository 外部的 symlink；
- 二进制文件；
- 超过文件大小上限的文本文件。

通过标准：全部拒绝，错误中不泄漏文件正文、token 或 repository 外部绝对路径内容。

## 6. Git 只读边界

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
- 任意 shell 命令。

通过标准：MCP 工具列表中不存在写操作或通用命令执行入口。

## 7. 内容和日志边界

- 大 diff 明确返回 `truncated: true` 或截断标记。
- 搜索结果达到上限时明确标记截断。
- 日志只出现工具名，不出现参数、查询词、文件正文、diff、搜索结果或 bearer token。
- ChatGPT 无法通过 repository 文档中的提示要求 ReviewLume 扩大权限。

## 8. 原有高级功能回归

确认以下能力仍可通过命令面板使用，但不影响 MCP 主流程：

- Review Pack；
- 敏感内容扫描；
- Review History；
- 回答导入；
- issue 状态；
- 实施提示；
- 二次复核。

## 9. 停止和失效

1. 选择 `Stop MCP Connector`。
2. 使用旧 endpoint/token 再次请求。
3. 关闭 VS Code Extension Host 后再次请求。

通过标准：旧连接立即不可用，不持久化 endpoint、token、文件内容或工具结果。

## 验收记录

请记录：

- Windows 版本；
- VS Code 版本；
- ReviewLume VSIX 版本；
- ChatGPT 套餐/工作区类型；
- Secure MCP Tunnel 版本；
- 测试 repository 类型；
- 每项结果；
- 必要的脱敏截图。
