# P9 ChatGPT 只读项目 MCP + Secure MCP Tunnel 人工验收清单

> 使用 Draft PR #21 最新四平台全绿 CI 及其 Windows VSIX 0.1.15 artifact。自动化测试负责协议、安全边界、浏览器启动解析和打包；真实 ChatGPT 工具调用仍需在用户 Windows 环境完成。

## 当前验收基线

- VSIX：0.1.15。
- 官方客户端：`openai/tunnel-client` v0.0.10 Windows amd64。
- ChatGPT Personal workspace 已创建并授权 ReviewLume Tunnel 连接器。
- ReviewLume 一次连接只绑定一个 Trusted Workspace 中的 Git repository。
- 本地 MCP 只监听 `127.0.0.1` 随机端口。
- Runtime API Key 只保存在 VS Code SecretStorage。
- 只提供 7 个只读工具：
  - `repository_summary`
  - `git_status`
  - `recent_commits`
  - `get_diff`
  - `list_files`
  - `read_file`
  - `search_code`

## 1. 安装、启动激活与界面收口

1. 安装 Draft PR #21 最新 Windows artifact 中的 VSIX 0.1.15，并完全退出 VS Code。
2. 正常双击打开 VS Code，确认启动完成后底部直接出现 `ReviewLume MCP` 状态项。
3. 确认左侧 Activity Bar 不再出现 ReviewLume 专用操作栏。
4. 确认自动激活只注册状态栏、命令和必要服务；不会自动启动 Tunnel、打开 ChatGPT、读取 Git diff 或扫描 repository。
5. 打开一个不含真实凭据的测试 Git repository，确认 Workspace Trust 已开启。
6. P8 Review Pack、历史、问题状态、实施提示和二次复核继续通过命令面板或 Review Panel 使用。

通过标准：

- P9 只有底部状态栏这一处常驻主入口；
- 不再需要先点击左侧栏才能初始化；
- 删除左侧栏不影响命令注册和 P8 Advanced 能力；
- 启动激活不会主动建立网络连接或读取项目内容。

## 2. 首次配置、代理自动发现与持久化

1. 点击状态栏 `ReviewLume MCP`，选择 `Configure Secure MCP Tunnel`。
2. 选择官方 `tunnel-client.exe`。
3. 粘贴 OpenAI Tunnel ID。
4. 粘贴最小权限 Runtime API Key，确认不是 Admin Key。
5. 检查 VS Code settings 和 repository，确认没有 Runtime Key、Token 或新增凭据文件。

连接时按以下顺序发现 OpenAI 控制面代理：

1. ReviewLume 上次保存的控制面代理；
2. `CONTROL_PLANE_HTTP_PROXY`；
3. `HTTPS_PROXY`；
4. `HTTP_PROXY`；
5. VS Code `http.proxy`；
6. Windows 当前用户系统代理注册表。

首次从 `HTTPS_PROXY=http://127.0.0.1:10809` 启动并连接后，ReviewLume 会把规范化地址保存到 VS Code globalState。以后可正常双击启动 VS Code，只需代理软件仍在相同端口运行。

通过标准：

- 非官方帮助文本的程序被拒绝；
- Tunnel ID 必须是 `tunnel_` 加 32 位小写字母或数字；
- Runtime Key 只在 SecretStorage；
- 二进制路径和代理地址均为机器级本地状态，不进入 repository；
- 代理 URL 含账号密码、路径、查询或非 HTTP(S) 协议时被拒绝；
- 子进程只设置 `CONTROL_PLANE_HTTP_PROXY`，不继承通用 `HTTP_PROXY`、`HTTPS_PROXY`、`ALL_PROXY` 或 `NO_PROXY`；
- 代理只作用于 OpenAI Tunnel 控制面，VS Code、Git、pnpm 和本地 MCP 不被改为全局走代理。

## 3. ChatGPT 浏览器选择与新对话入口

1. 点击状态栏 `ReviewLume MCP`。
2. 首次连接时确认出现浏览器选择：
   - System default browser；
   - Microsoft Edge；
   - Google Chrome。
3. 选择一个浏览器并完成连接。
4. 确认选择被保存；停止连接、完全退出 VS Code 后再次连接，不应重复询问。
5. 需要修改时，从状态栏菜单选择 `Choose ChatGPT Browser`。
6. 选择 Edge 或 Chrome 时，确认不会改变 Windows 系统默认浏览器。
7. 正常连接或选择 `Open New Chat in ChatGPT` 时，应打开 `https://chatgpt.com/` 的新聊天页面。
8. 不得自动打开 `#settings/Connectors`，也不得再次弹出截图中的连接器详情弹框。
9. 连接器设置仅能通过 `Manage ChatGPT Connector (Advanced)` 显式打开。

通过标准：

- 正常路径直接进入新聊天；
- 浏览器选择跨重启持久化；
- Edge/Chrome 使用无 shell 的显式进程启动；
- 找不到所选浏览器时给出受控错误，并允许用户改选，不回退到任意未知命令；
- OpenAI Platform、Tunnel Diagnostics 等非 ChatGPT 页面仍可使用系统默认浏览器。

## 4. 一键启动与真实就绪判断

1. 点击 `ReviewLume MCP`。
2. 选择 `Connect Current Repository to ChatGPT`。
3. 多根 workspace 时只选择一个 workspace folder。
4. 确认 ReviewLume 自动启动本地 MCP、运行 `tunnel-client doctor --explain`、启动长期 Tunnel 进程。
5. 确认 `/readyz` 返回 200。
6. 确认 ReviewLume 随后读取 loopback `/api/status`，并同时满足：
   - `control_plane_tunnel_id` 与配置的 Tunnel ID 一致；
   - 不存在非空 `tunnel_metadata_error`；
   - `main` channel 为 enabled；
   - `main.probe_status` 为 `ok`。
7. 只有上述检查全部通过后，状态栏才显示已连接并在所选浏览器打开 ChatGPT 新对话。

失败验收：

- 关闭代理软件或设置不可达代理，确认 ReviewLume 明确报告 OpenAI 控制面未就绪；
- `/readyz` 即使为 200，只要 `/api/status` 含 `tunnel_metadata_error`，不得显示 ready；
- 恢复代理后重新连接能够成功。

## 5. tunnel-client 与本地协议边界

1. Diagnostics UI 必须是 `http://127.0.0.1:<随机端口>/ui` 或 localhost。
2. 长期进程参数只有 `run`，不含 Runtime Key、本地 Token 或 Authorization Header。
3. `X-ReviewLume-Token` 使用 `env:` 引用，Header 配置不含 Token 明文。
4. 宿主中的 `TUNNEL_CLIENT_CONFIG`、`MCP_COMMAND`、Admin Key、Cloudflared、Harpoon、远程 UI、日志文件和原始 HTTP 日志覆盖项必须被移除。
5. doctor 无凭据 GET `/mcp` 返回 405，而不是 401。
6. `/.well-known/oauth-protected-resource/mcp` 和 `/.well-known/oauth-protected-resource` 返回 200，只包含当前 loopback `resource`，不包含 `authorization_servers`。
7. doctor 的 `oauth_metadata` 检查通过，不启动 OAuth 登录。
8. doctor 结束后长期进程必须写入新的 health URL。

## 6. ChatGPT 自主范围选择与 tools/call 稳定性

1. 在新对话启用 ReviewLume，发送：

> 检查当前 VS Code 项目最近 5 个提交，自己选择合理的文件和测试范围，找出明确问题和优化建议。不要修改任何文件。

合理调用链应从 repository summary、Git status 和 recent commits 开始，再按需要调用 diff、搜索和文件读取。

通过标准：

- 只发现 7 个只读工具，没有 shell、terminal、write、delete、patch 或 Git mutation；
- 用户不需要预先扫描、选择提交、导出审核包或导入回答；
- Tunnel Diagnostics 中不再出现 `sending "tools/call": Internal Server Error`；
- 扩展宿主重载、OutputChannel 关闭或日志记录失败不能改变工具调用结果；
- 工具参数、仓库路径或敏感内容被拒绝时，应返回 MCP `isError` 结果，而不是 HTTP 500。

所有工具 annotations 必须为：

```json
{
  "readOnlyHint": true,
  "destructiveHint": false,
  "idempotentHint": true,
  "openWorldHint": false
}
```

## 7. 网络、鉴权、路径与敏感内容

- endpoint 只能是 `http://127.0.0.1:<随机端口>/mcp`。
- 不得监听 `0.0.0.0`、局域网或公网 IP。
- 无凭据 GET `/mcp` 返回 405，且不返回工具或 repository 数据。
- 无凭据 POST/DELETE 或错误 Token 返回 401。
- 停止并重启后旧端口或旧 Token 不可继续使用。
- `../outside.txt`、绝对路径、`.git/config`、`.env`、私钥、证书、外部 symlink、二进制和超大文件必须拒绝。
- 文件、diff、搜索结果和提交标题中的敏感值必须拒绝或脱敏。
- 大结果必须有截断标记；超大请求返回 413，非 JSON 请求返回 415。
- 日志不得包含 Runtime Key、本地 Token、Authorization、查询词、文件正文、diff 或搜索结果。

## 8. Git 只读边界

MCP 不得执行或间接触发：

- checkout、reset、clean；
- add、commit、merge、rebase、push、fetch；
- 任意 shell 命令；
- 写文件、删除文件或应用补丁。

## 9. 停止、异常、重启与高级功能回归

1. 选择 `Stop Secure MCP Connection`。
2. 确认 Tunnel 和本地 MCP 均停止，旧 endpoint/Token 不可用。
3. 在连接状态关闭 Extension Host，确认没有残留进程。
4. 强制结束 tunnel-client，确认状态栏显示失败。
5. 重新连接不需要再次输入 SecretStorage 中的 Runtime Key。
6. 正常重启 VS Code 后不需要 PowerShell 启动脚本，保存的代理和浏览器选择会自动复用。
7. Review Pack、敏感内容扫描、Review History、回答导入、issue 状态、实施提示和二次复核继续可用。
8. 原浏览器填入桥接命令不得重新出现在命令面板或 activation events 中。

## 验收记录

记录 Windows、VS Code、VSIX、ChatGPT 工作区、浏览器选择、tunnel-client 版本、Tunnel ID 脱敏后缀、代理来源、测试 repository 和每项结果。不得记录 Runtime API Key、本地 MCP Token 或完整 Authorization Header。
