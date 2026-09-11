# 测试与验收

## 1. 当前测试模型

ReviewLume 当前只读 MCP 同时支持两类 Project Context：

- **Git Project**：公共文件工具 + Git 工具 + 已完成 Local Verification evidence；
- **Folder Project**：仅 `project_summary`、`list_files`、`read_file`、`search_code`。

所有自动测试都必须同时验证“新增 Folder 能力”和“既有 Git 能力不回归”。

## 2. Folder Project 专项测试

至少覆盖：

1. Trusted 普通 folder 可以解析为 `projectKind: folder`；
2. 没有 `.git` 不再返回 NoGit / 连接失败；
3. `project_summary` 返回项目身份并明确没有可靠 Git history；
4. `list_files` 只返回 bound root 内的有界普通文件；
5. `read_file` 可读取 root 内允许的普通文本；
6. `search_code` 可在允许文本文件中做有界字面量搜索；
7. `tools/list` 不包含 `repository_summary`、`git_status`、`recent_commits`、`get_diff`；
8. `tools/list` 不包含 `verification_status`、`read_verification_output`；
9. 隐藏调用 Git-only / verification tool 也返回 unsupported，不执行相关能力；
10. `../` traversal 被拒绝；
11. POSIX absolute、Windows drive absolute、UNC path 被拒绝；
12. `.git` / VCS metadata 被拒绝或枚举时跳过；
13. root 外 symlink / junction escape 不能读取或枚举；
14. Windows 路径规范化不能绕过 root；
15. obvious credential-like path 仍拒绝；
16. 二进制、目录和超大文件仍拒绝；
17. Workspace Untrusted 仍禁止启动 MCP；
18. multi-root workspace 仍只选择并绑定一个 root；
19. Folder 与 Git identity 不混淆；
20. macOS canonical path（例如 `/var` → `/private/var`）不造成错误失败。

Folder 枚举还必须验证：

- 不跟随 symlink / junction-like entry；
- 跳过依赖、构建、缓存和 credential-store 目录；
- 文件数、访问 entry 数和深度预算生效；
- `.env.example/.sample/.template/.dist` 作为模板可保留；
- 真实 `.env`、常见 credentials/secrets、私钥/证书容器路径被 Folder policy 拒绝。

这些规则是 filename/path 边界测试，不是正文 DLP 测试。

## 3. Git Project 回归测试

必须保持：

- `repository_summary`
- `git_status`
- `recent_commits`
- `get_diff`
- `list_files`
- `read_file`
- `search_code`
- `verification_status`（可用时）
- `read_verification_output`（可用时）

重点覆盖：

- repository discovery 和 canonical Git root；
- staged / unstaged / untracked；
- commit range；
- Git argument allowlist；
- external diff / textconv disabled；
- remote URL credential stripping；
- traversal / absolute / `.git` / symlink / binary / size boundary；
- 既有 tracked + non-ignored untracked 枚举；
- 当前 0.3.0 Git MCP 的敏感文件名兼容语义不被 Folder denylist 意外改变。

## 4. Local Verification 回归

Local Verification 只属于 Git Project。

自动测试必须验证：

- Git Project 可以继续发现/运行已批准规则；
- approval、HEAD、working-tree fingerprint、config、lockfile、runner binding 不改变；
- verification evidence tools 仍只读，不能启动进程；
- Folder Project 不调用 `runOnConnect`；
- Folder Project 不发现规则、不运行规则、不注册 evidence tools；
- 不能用 Folder Project 绕过 repository identity / approval 安全模型。

测试代码仍是不可信可执行代码，Local Verification 仍不是 sandbox。

## 5. MCP 网络与协议测试

必须覆盖：

- 仅绑定 `127.0.0.1`；
- 每次启动随机端口和新 Token；
- Bearer 和 `X-ReviewLume-Token`；
- unauthenticated GET `/mcp` 只返回 reachability 405；
- unauthorized POST/DELETE 返回 401；
- Origin、Content-Type、request size、rate limit；
- Protected Resource Metadata 只暴露 loopback resource；
- initialize / ping / tools/list / tools/call；
- Folder initialize instructions 明确无 Git history / Local Verification；
- Git initialize instructions 保持既有 repository 审核语义；
- stop 后旧 endpoint / token 失效；
- OutputChannel / observer 失败不能把正常 tools/call 变成 HTTP 500。

## 6. Tunnel、凭据和浏览器

继续覆盖：

- 官方 `tunnel-client` help 特征和 Tunnel ID；
- Runtime API Key 只存 SecretStorage；
- Key/Token 不进 argv、settings JSON、repository、clipboard、logs；
- ambient Tunnel/MCP/Admin Key/Cloudflared/Harpoon/remote UI/raw logging 清理；
- doctor 失败不启动长期进程；
- `/readyz` + `/api/status` 双重 ready；
- Tunnel ID mismatch / metadata error / unhealthy main channel 失败；
- diagnostics 仅 loopback；
- System default / Edge / Chrome 跨平台启动参数；
- repository/project 内容不能覆盖浏览器 URL。

## 7. P8 Advanced 回归

Folder Project Support 不改变 P8 Advanced 的 Git Review Pack 模型。继续覆盖：

- Git scope / file selection；
- SecretScanner HARD_BLOCK/BLOCK/WARN/INFO；
- Review Pack serialization / budget / export；
- history / response import / report parse；
- issue state / implementation prompt / re-review；
- imported AI content 永远不执行；
- P8 SecretScanner 不被错误宣传成 Git MCP 或 Folder MCP 的通用 DLP。

## 8. VSIX 内容测试

生成 VSIX 后直接检查 ZIP：

- manifest version/publisher/preview/pricing；
- README/LICENSE/icon/NLS；
- 必需 runtime 与 vendor；
- `projectContext`、Folder MCP runtime 等新增代码实际进入包；
- 不包含 TypeScript source、compiled tests、source maps、`*.tsbuildinfo`；
- 不包含 `.env`、真实凭据、Runtime API Key、local MCP Token；
- 不包含用户项目内容和 `.reviewlume/` history；
- 不捆绑 `tunnel-client`；
- 不新增 shell / run_command / patch 等运行入口。

## 9. 四平台 CI

PR final head 必须通过：

- Ubuntu Node 20；
- Ubuntu Node 22；
- Windows Node 22；
- macOS Node 22。

每个平台步骤：

1. checkout；
2. pnpm setup；
3. Node setup；
4. `pnpm install --frozen-lockfile`；
5. lint；
6. TypeScript typecheck；
7. tests；
8. legacy browser-extension validation；
9. build；
10. VSIX package；
11. artifact upload；
12. VSIX content validation。

失败必须读取具体 job log，并区分：代码问题、测试问题、环境问题、外部服务问题或权限问题。

## 10. Windows F5 人工验收

本轮涉及真实 VS Code 连接 UI，所以自动 CI 全绿后仍必须人工验证。

### Git Project

- [ ] `Connect Current Project to ChatGPT` 能自动识别 Git；
- [ ] 状态明确显示 `· Git`；
- [ ] ChatGPT tools/list 仍有 Git tools；
- [ ] 当前已有 Local Verification 行为不回归；
- [ ] status/diff/recent commits/read/search 正常。

### Folder Project

准备一个 Trusted 普通目录，例如 `G:\Projects\temp-demo`，不创建 `.git`：

- [ ] 可以直接连接，不出现 No Git；
- [ ] 状态明确显示 `· Folder`；
- [ ] tools/list 只有 `project_summary/list_files/read_file/search_code`；
- [ ] list/read/search 正常；
- [ ] 询问“最近改了什么”时明确说明没有可靠 Git history；
- [ ] 没有 verification tools；
- [ ] 不自动运行 Local Verification；
- [ ] `../`、绝对路径和 root 外链接不能读；
- [ ] obvious credential-like fixture 被拒绝。

### Multi-root / Trust

- [ ] multi-root 仍要求选择一个 Workspace Folder；
- [ ] 一次连接只读一个解析后的 Project Root；
- [ ] Restricted Mode 不允许启动 MCP。

## 11. 合并门禁

只有全部满足后才能合并 Folder Project Support：

- final head 四平台 CI 全绿；
- lint/typecheck/test/build/VSIX validation 全绿；
- 最终代码复核无未处理高风险问题；
- README、architecture、user guide、privacy、security、MCP setup/plan 与真实代码一致；
- Windows F5 Git + Folder 实机验收完成；
- PR 不再是 Draft；
- 不存在浏览器桥接、Multi Project Registry、Folder Verification 等越界实现。

Windows F5 完成前必须保持 Draft，不得声称已经发布。
