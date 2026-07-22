# P9 ChatGPT 只读项目 MCP + Secure MCP Tunnel 人工验收清单

> 当前人工验收基线为 `main` 的 ReviewLume 0.1.16 只读 MCP。自动化测试负责协议、路径、安全边界、浏览器启动、取消异常识别、构建、打包和 VSIX 内容检查；真实 ChatGPT 工具调用仍需在用户实际环境完成。

首次申请和配置步骤见 [ChatGPT 与 OpenAI Secure MCP Tunnel 配置指南](chatgpt-secure-mcp-setup.md)。

## 当前验收基线

- VSIX：0.1.16。
- 官方客户端：`openai/tunnel-client`。
- ChatGPT 网页端已创建并授权 ReviewLume Tunnel 应用/连接器。
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

1. 安装最新 Windows artifact 中的 VSIX，并完全退出 VS Code。
2. 正常双击打开 VS Code，确认启动完成后底部直接出现 `ReviewLume MCP` 状态项。
3. 确认左侧 Activity Bar 不再出现 ReviewLume 专用操作栏。
4. 确认自动激活只注册状态栏、命令和必要服务；不会自动启动 Tunnel、打开 ChatGPT、读取 Git diff 或扫描 repository。
5. 打开一个不含真实凭据的测试 Git repository，确认 Workspace Trust 已开启。
6. P8 Review Pack、历史、问题状态、实施提示和二次复核继续通过命令面板或 Review Panel 使用。
7. 打开 ReviewLume 状态栏菜单或浏览器选择框后执行 Extension Host reload，确认用户取消或重载不会弹出红色 `Canceled` 错误通知。

通过标准：

- P9 只有底部状态栏这一处常驻主入口；
- 不再需要先点击左侧栏才能初始化；
- 删除左侧栏不影响命令注册和 P8 Advanced 能力；
- 启动激活不会主动建立网络连接或读取项目内容；
- 明确的 VS Code 取消异常被视为正常取消，不写成操作失败，也不显示错误通知；
- 代理、配置、浏览器启动、Tunnel 和 MCP 等真实运行错误仍必须正常显示。

## 2. OpenAI Platform 和首次配置

1. 按 [配置指南](chatgpt-secure-mcp-setup.md) 创建或选择 OpenAI Tunnel。
2. 创建最小权限 Runtime API Key，确认不是 Admin Key。
3. 从 `openai/tunnel-client` 官方 Release 下载对应平台客户端。
4. 点击状态栏 `ReviewLume MCP`，选择 `Configure Secure MCP Tunnel`。
5. 选择官方 `tunnel-client.exe`。
6. 粘贴 OpenAI Tunnel ID。
7. 粘贴 Runtime API Key。
8. 检查 VS Code settings 和 repository，确认没有 Runtime Key、Token 或新增凭据文件。

连接时按以下顺序发现 OpenAI 控制面代理：

1. ReviewLume 上次保存的控制面代理；
2. `CONTROL_PLANE_HTTP_PROXY`；
3. `HTTPS_PROXY`；
4. `HTTP_PROXY`；
5. VS Code `http.proxy`；
6. Windows 当前用户系统代理注册表。

首次发现规范化代理后，ReviewLume 会把地址保存到 VS Code globalState。以后可正常双击启动 VS Code，只需代理软件仍在相同端口运行。

通过标准：

- 非官方帮助文本的程序被拒绝；
- Tunnel ID 必须是 `tunnel_` 加 32 位小写字母或数字；
- Runtime Key 只在 SecretStorage；
- 二进制路径和代理地址均为机器级本地状态，不进入 repository；
- 代理 URL 含账号密码、路径、查询或非 HTTP(S) 协议时被拒绝；
- 子进程只设置 `CONTROL_PLANE_HTTP_PROXY`，不继承通用 `HTTP_PROXY`、`HTTPS_PROXY`、`ALL_PROXY` 或 `NO_PROXY`；
- 代理只作用于 OpenAI Tunnel 控制面，VS Code、Git、pnpm 和本地 MCP 不被改为全局走代理。

## 3. ChatGPT 应用/连接器

1. 先让 ReviewLume Tunnel 保持已连接。
2. 从状态栏选择 `Manage ChatGPT Connector (Advanced)`，或进入 ChatGPT Apps/Connectors 设置。
3. 创建名为 ReviewLume 的自定义应用/连接器。
4. 连接方式选择 Tunnel，并填写相同 Tunnel ID。
5. 扫描工具。
6. 确认只发现 7 个 read-only 工具，没有 write、delete、shell、terminal、patch 或 Git mutation。
7. 保存应用；工作空间需要共享时，再按 OpenAI 当前管理员流程审核和发布。
8. 工具定义发生变化后，验证 ChatGPT 需要刷新、重新扫描或重新创建应用，不会自动采用新快照。

如果 ChatGPT 没有创建自定义应用/连接器的入口，应判定为账户、套餐、工作空间或灰度权限阻塞，不得归因于 ReviewLume 本地代码，也不得尝试绕过。

## 4. ChatGPT 浏览器选择与新对话入口

1. 点击状态栏 `ReviewLume MCP`。
2. 首次连接时确认出现浏览器选择：System default browser、Microsoft Edge、Google Chrome。
3. 选择一个浏览器并完成连接。
4. 确认选择被保存；停止连接、完全退出 VS Code 后再次连接，不应重复询问。
5. 需要修改时，从状态栏菜单选择 `Choose ChatGPT Browser`。
6. 选择 Edge 或 Chrome 时，确认不会改变 Windows 系统默认浏览器。
7. 选择 System default browser 时，确认使用系统原生 URL 启动，不出现 VS Code 的 Open/Cancel 外部网站确认。
8. 正常连接或选择 `Open New Chat in ChatGPT` 时，应打开 `https://chatgpt.com/` 的新聊天页面。
9. 不得自动打开 Apps/Connectors 设置或连接器详情弹框。
10. 连接器设置仅能通过 `Manage ChatGPT Connector (Advanced)` 显式打开。

## 5. 一键启动与真实就绪判断

1. 选择 `Connect Current Repository to ChatGPT`。
2. 多根 workspace 时只选择一个 workspace folder。
3. 确认 ReviewLume 自动启动本地 MCP、运行 `tunnel-client doctor --explain`、启动长期 Tunnel 进程。
4. 确认 `/readyz` 返回 200。
5. 确认 `/api/status` 同时满足：Tunnel ID 一致、不存在 `tunnel_metadata_error`、`main` channel enabled 且 `probe_status` 为 `ok`。
6. 只有上述检查全部通过后，状态栏才显示当前 repository 名称并在所选浏览器打开 ChatGPT 新对话。
7. ChatGPT 回答 repository 身份时应中性表述“当前连接项目是 <项目名>”，不得把 ReviewLume 连接器名误当成期望 repository 名。

## 6. tunnel-client 与本地协议边界

1. Diagnostics UI 必须是 `http://127.0.0.1:<随机端口>/ui` 或 localhost。
2. 长期进程参数只有 `run`，不含 Runtime Key、本地 Token 或 Authorization Header。
3. `X-ReviewLume-Token` 使用 `env:` 引用，Header 配置不含 Token 明文。
4. ambient Tunnel profile、MCP command、Admin Key、Cloudflared、Harpoon、远程 UI、日志文件和原始 HTTP 日志覆盖项必须被移除。
5. doctor 无凭据 GET `/mcp` 返回 405，而不是 401。
6. Protected Resource Metadata 返回 200，只包含当前 loopback `resource`，不包含 `authorization_servers`。
7. doctor 的 `oauth_metadata` 检查通过，不启动 OAuth 登录。

## 7. ChatGPT 自主范围选择与 tools/call 稳定性

在新对话启用 ReviewLume，发送：

> 检查当前 VS Code 项目最近 5 个提交，自己选择合理的文件和测试范围，找出明确问题和优化建议。不要修改任何文件。

通过标准：

- 只发现 7 个只读工具，没有 shell、terminal、write、delete、patch 或 Git mutation；
- 调用链从 repository summary、Git status 和 recent commits 开始，再按需要调用 diff、搜索和文件读取；
- 用户不需要预先扫描、选择提交、导出审核包或导入回答；
- Tunnel Diagnostics 中不出现 `sending "tools/call": Internal Server Error`；
- 扩展宿主重载、OutputChannel 关闭或日志记录失败不能改变工具调用结果；
- 工具参数、repository 路径、文件类型或大小被拒绝时，应返回 MCP `isError` 结果，而不是 HTTP 500。

## 8. 路径、读取与隐私边界

使用只含假数据的测试 fixture 验证：

- endpoint 只能是 `http://127.0.0.1:<随机端口>/mcp`；
- 无凭据 GET `/mcp` 返回 405，且不返回工具或 repository 数据；
- 无凭据 POST/DELETE 或错误 Token 返回 401；
- 停止并重启后旧端口或旧 Token 不可继续使用；
- `../outside.txt`、绝对路径、`.git/config`、外部 symlink、目录、二进制和超大文件必须拒绝；
- repository 内明确指定的普通文本文件可以被 `read_file` 读取；
- `.env`、credentials 或其他敏感命名文本文件不会因文件名被 P9 自动拒绝；
- tracked 敏感命名文件可以出现在 `list_files` 和 `search_code` 候选中；
- ignored 文件不会被普通枚举，但若已知路径，`read_file` 仍可读取 repository 内普通文本文件；
- diff、文件内容、搜索结果和提交标题不会自动经过 P8 SecretScanner；
- 日志不得包含 Runtime Key、本地 Token、Authorization、查询词、文件正文、diff 或搜索结果。

必须同时确认 UI 和文档明确警告用户：连接前移除、轮换或脱敏真实秘密，不得使用含生产凭据或真实客户数据的测试 repository。

## 9. 停止、异常、重启与高级功能回归

1. 选择 `Stop Secure MCP Connection`。
2. 确认 Tunnel 和本地 MCP 均停止，旧 endpoint/Token 不可用。
3. 在连接状态关闭 Extension Host，确认没有残留进程，也不出现误导性的 `Canceled` 错误通知。
4. 强制结束 tunnel-client，确认状态栏显示失败。
5. 重新连接不需要再次输入 SecretStorage 中的 Runtime Key。
6. 正常重启 VS Code 后不需要 PowerShell 启动脚本，保存的代理和浏览器选择会自动复用。
7. P8 Advanced 能力继续可用。
8. P8 Review Pack SecretScanner 仍按原规则工作，但不会被宣传为 P9 MCP 保护层。

## 10. 实际 VSIX 内容门禁

自动化必须直接检查生成的 VSIX ZIP：

- 包含 Marketplace README、LICENSE、图标、manifest、NLS 和必要运行时；
- 不包含 TypeScript 源码、编译后的测试、`*.tsbuildinfo`、`.env` 或 `.reviewlume/`；
- 不包含已停用的 browser input bridge、web-bridge vendor、bridge-protocol vendor 或旧 Activity Bar 运行时代码；
- 不捆绑 `tunnel-client`；
- 不包含 Runtime API Key、本地 MCP Token、Authorization Header、测试密钥或用户 repository 内容；
- 记录最终 VSIX SHA-256。

## 11. 发布门禁

只有全部满足后才能发布稳定版本：

- 最新 head 四平台 CI 全绿；
- 实际 VSIX 内容门禁全绿；
- 用户完成本清单中的 Windows + ChatGPT 人工验收；
- Marketplace Publisher ID 与 `package.json` 中的 `publisher` 一致且维护者拥有权限；
- README、Changelog、隐私政策、安全政策、配置指南、发布指南和实际行为一致；
- P9 不自动秘密扫描的限制已明确公开；
- 没有未处理的高风险问题。

## 验收记录

记录 Windows、VS Code、VSIX、ChatGPT 工作空间、浏览器选择、tunnel-client 版本、Tunnel ID 脱敏后缀、代理来源、测试 repository 和每项结果。不得记录 Runtime API Key、本地 MCP Token、完整 Authorization Header、真实秘密或私有源码。