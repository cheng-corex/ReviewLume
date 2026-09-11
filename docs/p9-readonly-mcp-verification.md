# ChatGPT 只读项目 MCP + Secure MCP Tunnel 人工验收清单

> 当前主线发布基线为 ReviewLume `0.3.0` Preview。本清单覆盖现有 Git Project 和新增 Folder Project，包括授权 Folder root 内的 nested Git 只读查询。Folder Project Support 不启动浏览器桥接，也不改变一次连接一个 outer Project Root 的原则。

首次配置见 [ChatGPT 与 OpenAI Secure MCP Tunnel 配置指南](chatgpt-secure-mcp-setup.md)。自动测试矩阵见 [测试与验收](test-and-verification.md)。

## 当前验收基线

- Publisher ID：`ReviewLume`
- Extension ID：`ReviewLume.reviewlume-vscode`
- VSIX 基线版本：`0.3.0` Preview
- 官方客户端：`openai/tunnel-client`
- Local MCP：仅 `127.0.0.1` 随机端口
- Runtime API Key：仅 VS Code SecretStorage
- 一次 connection：一个 selected outer Project Root

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

## 4. Folder Project 基础人工验收

准备一个根目录本身不含 `.git` 的普通目录。为了覆盖真实场景，可以让其中包含多个独立 Git 子项目，例如：

```text
G:\Projects\fbs\
├─ fbs-iot-ui\   (.git)
├─ fbs-lowcode\  (.git)
└─ fbs-ui\       (.git)
```

使用假 fixture 或可公开测试数据，不要使用真实凭据。

1. 在 VS Code 打开 outer Folder，例如 `G:\Projects\fbs`，并设为 Trusted。
2. 选择 **Connect Current Project to ChatGPT**。
3. 确认不再出现 `No Git Repository` 或要求初始化 Git。
4. 确认状态显示 outer 目录名和 `Folder` 类型。
5. 在 ChatGPT 重新扫描工具。

预期看到：

- `project_summary`
- `list_git_repositories`
- `repository_summary`
- `git_status`
- `recent_commits`
- `get_diff`
- `list_files`
- `read_file`
- `search_code`

必须确认：

- [ ] 没有 `verification_status`；
- [ ] 没有 `read_verification_output`；
- [ ] 连接时没有运行 Local Verification；
- [ ] `project_summary` 明确 outer Folder root 没有 aggregate Git history；
- [ ] status bar 仍显示 `Folder`，不会因为 child repos 存在而伪装成一个 Git Project。

Folder-wide file 验证：

- [ ] `list_files` 能跨多个 child project 列出普通源码；
- [ ] `read_file` 能读取允许文本；
- [ ] `search_code` 能跨 child project 搜索普通源码/测试/配置；
- [ ] 目录、二进制、超大文件不被正常读取。

## 5. Folder nested Git 人工验收

先发送：

> 列出当前 Folder Project 内可用的 Git repositories。

预期 `list_git_repositories` 返回实际 child repos，例如 `fbs-iot-ui`、`fbs-lowcode`、`fbs-ui`。

然后发送：

> 查看 fbs-ui 当前 branch、Git status、最近 5 次提交和 working diff。

通过标准：

- [ ] `repository_summary` 只针对 `fbs-ui`；
- [ ] `git_status` 只针对 `fbs-ui`；
- [ ] `recent_commits` 只针对 `fbs-ui`；
- [ ] `get_diff` 只针对 `fbs-ui`；
- [ ] 返回中能区分 outer Folder project 与 selected child repository；
- [ ] 不读取/混合其它 child repository 的 Git 状态；
- [ ] 不把 `fbs` 本身描述成 aggregate Git repository。

再验证另一个 child repository，确认不同 repository 的 branch/status/history 不串台。

## 6. Folder 路径、selector 与安全边界

仅使用假 fixture 验证 direct-file boundary：

- [ ] `../outside.txt` 拒绝；
- [ ] `C:\outside.txt` 拒绝；
- [ ] `\\server\share\outside.txt` 拒绝；
- [ ] `.git/config` direct read 拒绝；
- [ ] root 外 symlink / Windows junction 不能枚举或读取；
- [ ] `.ssh` / `.aws` / `.kube` 等 credential-store 目录不枚举；
- [ ] `.env` 等明显 secret path 被 Folder direct-file policy 拒绝；
- [ ] `.env.example` 等模板文件仍可正常读取；
- [ ] private key / certificate container fixture path 被拒绝。

Nested Git selector 还必须验证：

- [ ] 缺少 `repository` 参数拒绝；
- [ ] `../repo` 拒绝；
- [ ] absolute / Windows drive / UNC repository selector 拒绝；
- [ ] `.` / outer Folder root 拒绝；
- [ ] 普通非 Git 目录拒绝；
- [ ] `.git` path component 拒绝；
- [ ] 指向已发现 repo 的 symlink/junction alias 也不能替代 discovery 返回路径；
- [ ] Git metadata 解析到 outer root 外的 candidate 不进入 discovery；
- [ ] 外部 link 中的 repository 不进入 discovery。

注意：Folder direct-file path denylist 不是正文 DLP；nested Git status/history/diff 复用既有 Git 语义，也可能返回 tracked sensitive-looking path/content。不要用真实秘密做验收。

## 7. Multi-root Workspace

创建至少两个 Workspace Folder：

1. 一个 Git Project；
2. 一个普通 Folder Project。

验证：

- [ ] Connect 时要求选择一个 Workspace Folder；
- [ ] 本次 connection 只绑定一个解析后的 outer root；
- [ ] 选择 Folder 时不能读取另一个 Workspace Git root；
- [ ] 选择 Git 时不能跨到另一个 Workspace Folder root；
- [ ] Folder 内 child Git 是 outer root 内部资源，不等同 Multi Project Registry；
- [ ] 切换 outer project 需停止/重新连接。

## 8. ChatGPT / MCP 协议回归

- [ ] unauthenticated GET `/mcp` 只返回 405；
- [ ] unauthorized POST/DELETE 返回 401；
- [ ] tools/list 与 ProjectKind 对应；
- [ ] Folder initialize instructions 明确 outer root 无 aggregate Git history，并要求先 discovery 后显式 child repository；
- [ ] Folder tools/list 没有 verification tools；
- [ ] 连续 tools/call 不出现 HTTP 500；
- [ ] OutputChannel / Extension Host reload 不把日志异常变成工具失败；
- [ ] Open New Chat / browser preference 保持正常。

## 9. P8 Advanced 与 Local Verification 边界

Folder Project Support 不把 P8 Advanced 改造成非 Git 工作流。

验证：

- [ ] Git Project 下 Review Pack / history / re-review 继续按原逻辑工作；
- [ ] Git Project Local Verification 继续使用 repository-bound approval；
- [ ] Folder Project 不开放 Local Verification；
- [ ] discovered child repository 不自动运行 Local Verification；
- [ ] Folder Project 不新增 shell、terminal、run command、write、patch；
- [ ] 没有开始浏览器桥接。

## 10. 最终 VSIX 内容

自动 CI 的 VSIX validation 必须通过，并人工抽查：

- manifest publisher/name/version 正确；
- README/NLS 包含 Current Project / Folder Project 用户文案；
- Folder runtime（`projectContext` / `mcpFolderTools` / `mcpFolderProjectTools`）已打入 `dist`；
- 没有 TypeScript source、compiled tests、source maps、`.env`、真实 secret；
- 不捆绑 `tunnel-client`；
- 不新增浏览器桥接、shell、run_command 或 patch 执行入口。

## 11. 合并门禁

本 PR 在以下条件全部满足前保持 Draft：

- final head 四平台 CI 全绿；
- lint/typecheck/test/build/VSIX validation 全绿；
- 最终代码复核完成；
- 无未处理高风险问题；
- 文档与 Git/Folder/nested Git 真实工具集一致；
- Windows Git Project + Folder Project + nested Git 实机验收完成。

人工验收前不合并、不发布、不声称 Folder Project 已上线。

## 验收记录

记录：Windows 版本、VS Code 版本、VSIX 文件、final head SHA、ChatGPT workspace、浏览器、tunnel-client 版本、测试用 Git Project、测试用 Folder Project、测试用 nested Git repository 和结果。

不得记录 Runtime API Key、local MCP token、Authorization Header、真实秘密或私有源码。
