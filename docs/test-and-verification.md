# 测试与验收

## 1. 当前测试模型

ReviewLume 当前只读 MCP 同时支持两类 Project Context：

- **Git Project**：公共文件工具 + Git 工具 + 已完成 Local Verification evidence；
- **Folder Project**：Folder-wide 文件工具 + 授权 root 内显式 child repository 的只读 Git query；没有 Local Verification。

所有自动测试都必须同时验证“新增 Folder/nested Git 能力”和“既有 direct Git 能力不回归”。

## 2. Folder Project 专项测试

基础 Folder 至少覆盖：

1. Trusted 普通 folder 可以解析为 `projectKind: folder`；
2. 根目录没有 `.git` 不再返回 NoGit / 连接失败；
3. `project_summary` 返回项目身份、outer root 无 aggregate Git history、nested Git capability 和 no Local Verification；
4. `list_files` 只返回 bound root 内的有界普通文件；
5. `read_file` 可读取 root 内允许的普通文本；
6. `search_code` 可在允许文本文件中做有界字面量搜索；
7. `tools/list` 包含 `list_git_repositories` 与四个显式 scoped Git query；
8. `tools/list` 不包含 `verification_status`、`read_verification_output`；
9. `../` traversal 被拒绝；
10. POSIX absolute、Windows drive absolute、UNC file path 被拒绝；
11. direct `.git` / VCS metadata read 被拒绝或枚举时跳过；
12. root 外 symlink / junction escape 不能读取或枚举；
13. obvious credential-like direct-file path 仍拒绝；
14. 二进制、目录和超大文件仍拒绝；
15. Workspace Untrusted 仍禁止启动 MCP；
16. multi-root workspace 仍只选择并绑定一个 outer root；
17. Folder 与 Git identity 不混淆；
18. macOS canonical path（例如 `/var` → `/private/var`）不造成错误失败。

Folder file enumeration 还必须验证：

- 不跟随 symlink / junction-like entry；
- 跳过依赖、构建、缓存和 credential-store 目录；
- 文件数、访问 entry 数和深度预算生效；
- `.env.example/.sample/.template/.dist` 作为模板可保留；
- 真实 `.env`、常见 credentials/secrets、私钥/证书容器路径被 Folder direct-file policy 拒绝。

这些 direct-file 规则是 filename/path 边界测试，不是正文 DLP 测试。

## 3. Folder Nested Git 专项测试

必须覆盖：

1. `list_git_repositories` 能发现 outer Folder root 内真实 child repositories；
2. discovery 支持更深层 child path，而不是只依赖一级目录名称；
3. discovery 最大 repository / entry / depth 有界；
4. discovery 不跟随 directory symlink/junction-like entry；
5. candidate 必须有本地非 symlink `.git` marker；
6. `rev-parse --show-toplevel` 必须回到 candidate 自身；
7. `rev-parse --absolute-git-dir` 必须留在 canonical Folder root；
8. external git-dir candidate 被排除；
9. `repository_summary` 对一个显式 child repo 返回其 branch/HEAD/status/latest commit；
10. `git_status` 只返回显式 child repo 的状态；
11. `recent_commits` 只返回显式 child repo 的历史；
12. `get_diff` 复用 working/staged/range 和 path/ref 安全边界；
13. child query 结果包含 outer `project/projectKind` 与 `repositoryPath`，避免身份混淆；
14. 缺失 repository selector 拒绝；
15. `../` / absolute / drive / UNC / `.` / `.git` selector 拒绝；
16. ordinary non-repository selector 拒绝；
17. selector 必须精确匹配 discovery 返回 path；
18. 指向合法 child repo 的 symlink/junction alias 也拒绝；
19. separate child repositories 不会合并成 synthetic status/history/diff；
20. Folder mode verification tools 始终拒绝，且 nested discovery/query 不触发 Local Verification。

Nested Git query 还必须继续受 `McpRepositoryTools` 和 git-context read-only allowlist 保护，不能新增 Git mutation/general command 路径。

## 4. Git Project 回归测试

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
- traversal / absolute / direct `.git` / symlink / binary / size boundary；
- 既有 tracked + non-ignored untracked 枚举；
- 当前 0.3.0 Git MCP 的敏感文件名兼容语义不被 Folder denylist 意外改变。

## 5. Local Verification 回归

Local Verification 只属于 direct Git Project。

自动测试必须验证：

- Git Project 可以继续发现/运行已批准规则；
- approval、HEAD、working-tree fingerprint、config、lockfile、runner binding 不改变；
- verification evidence tools 仍只读，不能启动进程；
- Folder Project 不调用 `runOnConnect`；
- Folder Project 不发现规则、不运行规则、不注册 evidence tools；
- Folder child Git discovery/query 不自动触发 verification；
- 不能用 Folder mode 绕过 repository identity / approval 安全模型。

测试代码仍是不可信可执行代码，Local Verification 仍不是 sandbox。

## 6. MCP 网络与协议测试

必须覆盖：

- 仅绑定 `127.0.0.1`；
- 每次启动随机端口和新 Token；
- Bearer 和 `X-ReviewLume-Token`；
- unauthenticated GET `/mcp` 只返回 reachability 405；
- unauthorized POST/DELETE 返回 401；
- Origin、Content-Type、request size、rate limit；
- Protected Resource Metadata 只暴露 loopback resource；
- initialize / ping / tools/list / tools/call；
- Folder initialize instructions 明确 outer root 无 aggregate Git history、nested Git 需 discovery + explicit selector、无 Local Verification；
- Git initialize instructions 保持既有 repository 审核语义；
- stop 后旧 endpoint / token 失效；
- OutputChannel / observer 失败不能把正常 tools/call 变成 HTTP 500。

## 7. Tunnel、凭据和浏览器

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

## 8. P8 Advanced 回归

Folder Project Support 不改变 P8 Advanced 的 Git Review Pack 模型。继续覆盖：

- Git scope / file selection；
- SecretScanner HARD_BLOCK/BLOCK/WARN/INFO；
- Review Pack serialization / budget / export；
- history / response import / report parse；
- issue state / implementation prompt / re-review；
- imported AI content 永远不执行；
- P8 SecretScanner 不被错误宣传成 Git MCP、Folder file MCP 或 nested Git 的通用 DLP。

## 9. VSIX 内容测试

生成 VSIX 后直接检查 ZIP：

- manifest version/publisher/preview/pricing；
- README/LICENSE/icon/NLS；
- 必需 runtime 与 vendor；
- `projectContext`、`mcpFolderTools`、`mcpFolderProjectTools` 等新增 runtime 实际进入包；
- 不包含 TypeScript source、compiled tests、source maps、`*.tsbuildinfo`；
- 不包含 `.env`、真实凭据、Runtime API Key、local MCP Token；
- 不包含用户项目内容和 `.reviewlume/` history；
- 不捆绑 `tunnel-client`；
- 不新增 shell / run_command / patch 等运行入口。

## 10. 四平台 CI

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

## 11. Windows 人工验收

本轮涉及真实 VS Code 连接 UI/tool schema，所以自动 CI 全绿后仍必须人工验证。

### Git Project

- [ ] `Connect Current Project to ChatGPT` 能自动识别 Git；
- [ ] 状态明确显示 `· Git`；
- [ ] ChatGPT tools/list 仍有 Git tools；
- [ ] 当前已有 Local Verification 行为不回归；
- [ ] status/diff/recent commits/read/search 正常。

### Folder Project

准备一个 Trusted outer Folder，根目录本身无 `.git`，内部可以有多个 child repositories：

- [ ] 可以直接连接，不出现 No Git；
- [ ] 状态明确显示 `· Folder`；
- [ ] file list/read/search 可跨 child directories；
- [ ] tools/list 有 `list_git_repositories` + scoped Git queries；
- [ ] `list_git_repositories` 能列出真实 child repos；
- [ ] 指定一个 child repo 后 summary/status/commits/diff 正常；
- [ ] 另一个 child repo 的状态不会混入；
- [ ] outer Folder root 不被伪装成 Git repository；
- [ ] 没有 verification tools；
- [ ] 不自动运行 Local Verification；
- [ ] `../`、绝对路径和 root 外链接不能读；
- [ ] invalid/alias child selector 被拒绝；
- [ ] obvious credential-like direct-file fixture 被拒绝。

### Multi-root / Trust

- [ ] multi-root 仍要求选择一个 Workspace Folder；
- [ ] 一次连接只读一个 outer Project Root；
- [ ] Folder 内 child repo 不等于跨 Workspace root；
- [ ] Restricted Mode 不允许启动 MCP。

## 12. 合并门禁

只有全部满足后才能合并 Folder Project Support：

- final head 四平台 CI 全绿；
- lint/typecheck/test/build/VSIX validation 全绿；
- 最终代码复核无未处理高风险问题；
- README、architecture、user guide、privacy、security、MCP setup/plan 与真实代码一致；
- Windows Git + Folder + nested Git 实机验收完成；
- PR 不再是 Draft；
- 不存在浏览器桥接、跨 root Multi Project Registry、Folder Verification 等越界实现。

Windows 人工验收完成前必须保持 Draft，不得声称已经发布。
