# ChatGPT 只读项目 MCP 连接器

> 本文记录 ReviewLume 当前只读 MCP 主流程。文件名保留历史命名；Folder Project Support 仍属于当前 P8 二次复核闭环相关只读能力，不启动可选浏览器桥接，也不改变路线阶段编号。

## 产品目标

ReviewLume 是“本地项目只读审核连接器”，而不是“必须依赖 Git 的审核连接器”。当前项目模型为：

```text
Project Context
├─ Git Project
└─ Folder Project
```

一次 MCP connection 仍只绑定一个明确选择的 outer Project Root。多根 VS Code Workspace 可以选择其中一个 Workspace Folder，但不会把多个 root 合并成一个审核上下文。

Folder Project 可以在这个已授权 root 内发现多个真实 Git 子仓库，并按显式子仓库路径执行只读 Git 查询；这些 child repositories 不会变成跨 root 的 Multi Project Registry。

## 架构

```text
ChatGPT custom app / connector
  │  OpenAI Secure MCP Tunnel
  ▼
ReviewLume VS Code extension
  │
  ├─ McpConnectorService
  │    └─ ProjectContext { root, displayName, kind }
  │
  ├─ Git Project
  │    ├─ common file tools
  │    ├─ Git tools
  │    └─ completed Local Verification evidence
  │
  └─ Folder Project
       ├─ common file tools across the authorized root
       └─ explicitly scoped read-only Git tools for discovered child repositories
```

Workspace readiness 只要求：存在 Workspace Folder 且 Workspace Trusted。没有根 Git 不再等同于连接失败。连接时 ReviewLume 自动检测项目类型：受控 Git discovery 成功则使用 canonical Git root；否则使用 canonical Workspace Folder root。

## 工具能力

### Folder Project

Folder-wide file tools：

- `project_summary`
- `list_files`
- `read_file`
- `search_code`

Nested Git tools：

- `list_git_repositories`
- `repository_summary`
- `git_status`
- `recent_commits`
- `get_diff`

后四个 Git query 必须携带 `repository` 参数，且值必须精确匹配 `list_git_repositories` 返回的 Folder-relative path。

`project_summary` 必须明确：

- `projectKind: folder`；
- Folder root 本身没有 aggregate Git history；
- 可以针对明确选中的 child repository 查询 Git；
- 没有 Local Verification；
- 不得把多个子仓库合成 branch / HEAD / status / commit history / diff。

因此用户问“整个 Folder 最近改了什么”时，必须说明没有统一的 Git history；如果用户明确指向一个已发现的 child repository，则可以读取该 repository 自己的 Git state。

### Git Project

保持现有兼容工具：

- `repository_summary`
- `git_status`
- `recent_commits`
- `get_diff`
- `list_files`
- `read_file`
- `search_code`
- `verification_status`（Local Verification 可用时）
- `read_verification_output`（Local Verification 可用时）

Git Project 的原有返回结构和安全边界尽量保持兼容。`repository_summary` 额外提供 `projectKind: git` 身份语义，但不移除既有 repository 字段。

### Capability-based registration

Folder mode 不注册 Local Verification evidence，也不注册任何 write/mutation/process-runner capability。Nested Git query 是明确注册的只读能力，不是隐藏执行路径。

所有工具都声明：

```json
{
  "readOnlyHint": true,
  "destructiveHint": false,
  "idempotentHint": true,
  "openWorldHint": false
}
```

## Folder Project 文件访问边界

Folder-wide file tools 不依赖 `git ls-files`，使用无子进程的有界文件枚举适配层，并复用现有 `read_file` / `search_code` 的有界文本读取逻辑。

强制规则：

- Project root 在连接时 `realpath` canonicalize；
- 拒绝绝对路径、Windows 盘符、UNC、NUL 和 `..` traversal；
- 拒绝直接 `.git` / VCS metadata 文件读取；
- 文件枚举不跟随 symlink / junction-like link；
- 文件或目录 `realpath` 后必须仍位于 canonical root 内；
- 拒绝目录、二进制和超大文件；
- 文件枚举、访问条目、目录深度、搜索文件数、匹配数和返回字节数均有预算；
- 跳过常见依赖、构建、缓存和 credential-store 目录；
- Folder direct-file tools 额外拒绝明显 credential-like 文件路径，例如真实 `.env`、私钥/证书容器和常见 credentials/secrets 文件；
- `.env.example`、`.env.sample`、`.env.template`、`.env.dist` 仍可作为模板读取。

Folder 的敏感路径规则只是 filename/path denylist，不是 DLP，也不保证识别正文中的秘密。

## Folder Nested Git 边界

Nested Git discovery 有独立预算：最多 64 个 repositories、20,000 filesystem entries、深度 32。

安全要求：

- 跳过 dependency/build/cache/credential-store 目录；
- 不跟随 directory symlink / junction-like entry；
- candidate 必须存在本地非 symlink `.git` file/directory marker；
- `git rev-parse --show-toplevel` 必须解析为 candidate 自身；
- `git rev-parse --absolute-git-dir` 必须解析到授权 Folder root 内；
- selector 必须精确匹配 discovery 返回 path；
- absolute/drive/UNC/`..`/`.git`/root/non-repository/alias selector 拒绝；
- child repositories 的状态、历史和 diff 不能合并。

通过后，nested Git query 复用既有 `McpRepositoryTools` 和 read-only Git runner：参数数组、只读 allowlist、禁用 external diff/textconv、commit ref 验证、bounded diff 和 remote URL 脱敏。

Folder direct-file denylist 不自动过滤 nested Git status/history/diff；这些 Git 结果遵循既有 Git privacy 语义，可能包含 tracked 敏感路径或内容。

## Git Project 兼容边界

Git Project 继续使用既有受控 Git runner：参数数组、只读 allowlist、禁用 external diff/textconv，并拒绝路径越界、直接 `.git`、外部 symlink、二进制和超大读取。

为避免本轮顺手改变已发布连接器语义，Git Project 仍保持当前 0.3.0 的敏感文件名行为：不会仅因为文件叫 `.env`、credentials 或 secrets 就自动拒绝。该差异必须在 README、PRIVACY 和 SECURITY 中公开说明。

## Local Verification

Local Verification 安全模型仍是 Git-repository-bound：approval、HEAD、working tree、changed-test discovery、config/lockfile/runner binding 都依赖直接 Git Project identity。

因此：

- Git Project：保持现有 Local Verification 行为；
- Folder Project：不 discovery、不 run、不暴露 verification evidence tools；
- Folder 下的 discovered child repository 也不会自动 run 或继承 verification approval。

需要验证 child repository 时，必须把它直接作为 Git Project 连接。本轮不设计 Folder Verification，也不拆松现有验证授权模型。

## Workspace Trust 与多根工作区

Workspace 状态语义为：

- `NoWorkspace`
- `Untrusted`
- `Ready`

`Ready` 内再解析 ProjectKind。Restricted Mode 仍禁止启动 MCP。

多根 Workspace 中用户必须选择一个 Workspace Folder。本次连接只绑定解析后的一个 outer Project Root；不实现跨 root Multi Project Registry。

## VS Code 连接体验

主动作：

`Connect Current Project to ChatGPT`

用户不需要预选 Git / Folder。连接成功状态明确显示外层类型，例如：

```text
ai-ui · Git
```

或：

```text
fbs · Folder
```

Folder 内即使存在 child Git repositories，状态仍为 Folder，因为 outer authorization root 没变。

由于这是可见连接流程变更，合并前需要 Windows 人工验收。

## Secure MCP Tunnel

网络和凭据边界保持不变：

- 本地 MCP 只监听 `127.0.0.1` 随机端口；
- 每次启动生成新的高熵本地 Token；
- OpenAI Runtime API Key 只保存到 VS Code SecretStorage；
- Runtime Key / local token 不进入 repository、settings JSON、argv、剪贴板或诊断日志；
- 使用官方 `openai/tunnel-client`；
- 先执行 `doctor --explain`，再启动长期 `run`；
- `/readyz` 和 `/api/status` 同时健康才报告 ready；
- 停止顺序仍为 Tunnel → local MCP；
- 不提供 shell、terminal、任意命令、write、delete、patch、Git mutation 或 AI command execution。

## 自动验证

四平台 CI 必须覆盖 Ubuntu Node 20、Ubuntu Node 22、Windows Node 22、macOS Node 22，并依次完成 frozen install、lint、TypeScript typecheck、tests、legacy browser-extension validation、build、VSIX package、artifact upload、VSIX content validation。

Folder Project 专项至少覆盖：

- Trusted plain folder 可连接；
- 无根 `.git` 不再失败；
- identity / project kind；
- Folder list/read/search；
- nested repository discovery；
- explicit child summary/status/commits/diff；
- selector exact-match、traversal/absolute/drive/UNC/alias/non-repo rejection；
- external git-dir / symlink/junction escape rejection；
- no aggregate child Git state；
- verification tools 不注册、Local Verification 不运行；
- direct Git Project 原工具和 Local Verification 不回归；
- credential-like direct-file policy；
- Restricted Mode；
- multi-root 单 outer root；
- Git / Folder identity 不混淆。

详细测试门禁见 [test-and-verification.md](test-and-verification.md)。

## 合并条件

Folder Project Support 在以下条件全部满足前不得合并：

- Draft PR 的 final head 四平台 CI 全绿；
- lint/typecheck/test/build/VSIX validation 全部通过；
- 完成最终 diff 与安全代码复核；
- 文档与真实工具集一致；
- 无未处理高风险路径越界、凭据泄漏或写操作入口；
- 用户完成 Windows Git Project + Folder Project（含 nested Git）连接/UI 人工验收。

人工验收通过前保持 Draft，不标记已发布。
