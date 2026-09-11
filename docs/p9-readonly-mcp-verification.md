# ChatGPT 只读项目 MCP + Secure MCP Tunnel 人工验收清单

> 当前主线发布基线为 ReviewLume `0.3.0` Preview。本清单覆盖现有 Git Project 和本轮新增 Folder Project。Folder Project Support 不是浏览器桥接，也不改变一次连接一个 Project Root 的原则。

首次配置见 [ChatGPT 与 OpenAI Secure MCP Tunnel 配置指南](chatgpt-secure-mcp-setup.md)。自动测试矩阵见 [测试与验收](test-and-verification.md)。

## 当前验收基线

- Publisher ID：`ReviewLume`
- Extension ID：`ReviewLume.reviewlume-vscode`
- VSIX 基线版本：`0.3.0` Preview
- 官方客户端：`openai/tunnel-client`
- Local MCP：仅 `127.0.0.1` 随机端口
- Runtime API Key：仅 VS Code SecretStorage
- 一次 connection：一个 selected Project Root

Project kind 自动检测：

- Git discovery 成功 → **Git Project**
- 否则 → **Folder Project**

## 1. 安装与启动

1. 安装 PR final head 对应 Windows VSIX。
2. 完全退出并重启 VS Code。
3. 确认底部出现 `ReviewLume MCP`。
4. 确认启动本身不会自动建立 Tunnel、打开 ChatGPT、读取项目文件或运行验证。
5. 确认 Workspace Restricted Mode 下 MCP connection 仍被禁止。

## 2. Secure MCP Tunnel 配置回归

1. 使用 OpenAI Platform Tunnel。
2. 使用最小权限 Runtime API Key，不使用 Admin Key。
3. 选择官方 `tunnel-client.exe`。
4. 确认 Tunnel ID 校验、doctor、proxy discovery 与 `/readyz` + `/api/status` 就绪判断保持正常。
5. 确认 Runtime Key / local token 不出现在 repository、settings JSON、argv、clipboard、ReviewLume logs。
6. 停止连接后确认 Tunnel 与本地 MCP 都关闭，旧 endpoint/token 失效。

## 3. Git Project 人工验收

打开一个 Trusted Git repository：

1. 选择 **Connect Current Project to ChatGPT**。
2. 确认 ReviewLume 自动识别为 Git Project，不要求手工选择模式。
3. 状态栏应显示实际项目名和 `Git` 类型。
4. ChatGPT 重新扫描工具。

预期 Git 工具：

- `repository_summary`
- `git_status`
- `recent_commits`
- `get_diff`
- `list_files`
- `read_file`
- `search_code`
- `verification_status`（Local Verification 可用时）
- `read_verification_output`（Local Verification 可用时）

验证：

- [ ] repository identity 正确；
- [ ] Git status 正常；
- [ ] recent commits 正常；
- [ ] working/staged/range diff 正常；
- [ ] list/read/search 与 0.3.0 行为兼容；
- [ ] 已批准 Local Verification 行为不回归；
- [ ] verification evidence 仍只读，ChatGPT 不能启动进程；
- [ ] 没有 write/delete/shell/terminal/patch/Git mutation 工具。

## 4. Folder Project 人工验收

准备一个不含 `.git` 的普通目录，例如：

```text
G:\Projects\temp-demo
```

放入少量源码、配置和测试 fixture，不要使用真实凭据。

1. 在 VS Code 打开该目录并设为 Trusted。
2. 选择 **Connect Current Project to ChatGPT**。
3. 确认不再出现 `No Git Repository` 或要求初始化 Git。
4. 确认状态显示实际目录名和 `Folder` 类型。
5. 在 ChatGPT 重新扫描工具。

预期**只能**看到：

- `project_summary`
- `list_files`
- `read_file`
- `search_code`

必须确认：

- [ ] 没有 `repository_summary`；
- [ ] 没有 `git_status`；
- [ ] 没有 `recent_commits`；
- [ ] 没有 `get_diff`；
- [ ] 没有 `verification_status`；
- [ ] 没有 `read_verification_output`；
- [ ] 连接时没有运行 Local Verification。

发送：

> 看一下这个项目最近改了什么。

通过标准：ChatGPT / `project_summary` 明确说明 Folder Project 没有可靠 Git history，不能判断最近修改，不得根据 mtime、文件顺序或内容猜测 staged/commit/branch/diff。

再验证：

- [ ] `list_files` 能列出普通源码；
- [ ] `read_file` 能读取允许文本；
- [ ] `search_code` 能搜索普通源码/测试/配置；
- [ ] 目录、二进制、超大文件不被正常读取。

## 5. Folder 路径与安全边界

仅使用假 fixture 验证：

- [ ] `../outside.txt` 拒绝；
- [ ] `C:\outside.txt` 拒绝；
- [ ] `\\server\share\outside.txt` 拒绝；
- [ ] `.git/config` 拒绝；
- [ ] root 外 symlink / Windows junction 不能枚举或读取；
- [ ] 大小写/路径规范化不能绕过 root；
- [ ] `.ssh` / `.aws` / `.kube` 等 credential-store 目录不枚举；
- [ ] `.env` 等明显 secret path 被 Folder policy 拒绝；
- [ ] `.env.example` 等模板文件仍可正常读取；
- [ ] private key / certificate container fixture path 被拒绝。

该测试只验证 path policy。不要把它描述为正文秘密扫描；Folder Project 仍可能读取普通源码正文里的敏感值，因此真实秘密必须提前移除/轮换/脱敏。

## 6. Multi-root Workspace

创建至少两个 Workspace Folder：

1. 一个 Git Project；
2. 一个普通 Folder Project。

验证：

- [ ] Connect 时要求选择一个 Workspace Folder；
- [ ] 本次 connection 只绑定一个解析后的 root；
- [ ] 选择 Folder 时不能读取另一个 Git root；
- [ ] 选择 Git 时不能跨到另一个 Folder root；
- [ ] 切换项目需停止/重新连接，不存在 Multi Project Registry。

## 7. ChatGPT / MCP 协议回归

- [ ] unauthenticated GET `/mcp` 只返回 405；
- [ ] unauthorized POST/DELETE 返回 401；
- [ ] tools/list 与 ProjectKind 对应；
- [ ] Folder hidden-call Git tool 返回 MCP error，而不是执行 Git；
- [ ] initialize instructions 与 Git/Folder 类型一致；
- [ ] 连续 tools/call 不出现 HTTP 500；
- [ ] OutputChannel / Extension Host reload 不把日志异常变成工具失败；
- [ ] Open New Chat / browser preference 保持正常。

## 8. P8 Advanced 与 Local Verification 边界

Folder Project Support 不把 P8 Advanced 改造成非 Git 工作流。

验证：

- [ ] Git Project 下 Review Pack / history / re-review 继续按原逻辑工作；
- [ ] Git Project Local Verification 继续使用 repository-bound approval；
- [ ] Folder Project 不开放 Local Verification；
- [ ] Folder Project 不新增 shell、terminal、run command、write、patch；
- [ ] 没有开始浏览器桥接。

## 9. 最终 VSIX 内容

自动 CI 的 VSIX validation 必须通过，并人工抽查：

- manifest publisher/name/version 正确；
- README/NLS 包含 Current Project / Folder Project 用户文案；
- Folder runtime (`projectContext` / folder MCP support) 已打入 `dist`；
- 没有 TypeScript source、compiled tests、source maps、`.env`、真实 secret；
- 不捆绑 `tunnel-client`；
- 不新增浏览器桥接、shell、run_command 或 patch 执行入口。

## 10. 合并门禁

本 PR 在以下条件全部满足前保持 Draft：

- final head 四平台 CI 全绿；
- lint/typecheck/test/build/VSIX validation 全绿；
- 最终代码复核完成；
- 无未处理高风险问题；
- 文档与 Git/Folder 真实工具集一致；
- 本清单中的 Windows F5 Git + Folder 连接/UI 验收完成。

人工验收前不合并、不发布、不声称 Folder Project 已上线。

## 验收记录

记录：Windows 版本、VS Code 版本、VSIX 文件、final head SHA、ChatGPT workspace、浏览器、tunnel-client 版本、测试用 Git Project、测试用 Folder Project 和结果。

不得记录 Runtime API Key、local MCP token、Authorization Header、真实秘密或私有源码。
