# ChatGPT 只读项目 MCP 连接器

> 本文记录 ReviewLume 当前只读 MCP 主流程。文件名保留历史命名；本轮 Folder Project Support 不启动浏览器桥接，也不改变路线阶段编号。

## 产品目标

ReviewLume 是“本地项目只读审核连接器”，而不是“必须依赖 Git 的审核连接器”。当前项目模型为：

```text
Project Context
├─ Git Project
└─ Folder Project
```

一次 MCP connection 仍只绑定一个明确选择的 Project Root。多根 VS Code Workspace 可以选择其中一个 Workspace Folder，但不会把多个 root 合并成一个审核上下文。

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
       └─ common file tools only
```

Workspace readiness 只要求：存在 Workspace Folder 且 Workspace Trusted。没有 Git 不再等同于连接失败。连接时 ReviewLume 自动检测项目类型：受控 Git discovery 成功则使用 canonical Git root；否则使用 canonical Workspace Folder root。

## 工具能力

### Folder Project

只注册：

- `project_summary`
- `list_files`
- `read_file`
- `search_code`

`project_summary` 必须明确：

- `projectKind: folder`
- 没有可靠 Git history；
- 没有 staged / unstaged；
- 没有 branch / HEAD / commit range / diff；
- 没有 Local Verification。

因此用户问“最近改了什么”时，Folder Project 必须说明没有可靠历史，不能根据文件时间或内容推断最近修改。

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

Folder 模式根本不把 Git-only / verification tools 放进 `tools/list`。如果客户端绕过 discovery 隐藏调用这些名称，也必须返回不支持错误，不执行 Git 或验证逻辑。

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

Folder Project 不依赖 `git ls-files`，使用无子进程的有界文件枚举适配层，并复用现有 `read_file` / `search_code` 的有界文本读取逻辑。

强制规则：

- Project root 在连接时 `realpath` canonicalize；
- 拒绝绝对路径、Windows 盘符、UNC、NUL 和 `..` traversal；
- 拒绝 `.git` / VCS metadata；
- 枚举不跟随 symlink / junction-like link；
- 文件或目录 `realpath` 后必须仍位于 canonical root 内；
- 拒绝目录、二进制和超大文件；
- 文件枚举、访问条目、目录深度、搜索文件数、匹配数和返回字节数均有预算；
- 跳过常见依赖、构建、缓存和 credential-store 目录；
- Folder Project 额外拒绝明显 credential-like 文件路径，例如真实 `.env`、私钥/证书容器和常见 credentials/secrets 文件；
- `.env.example`、`.env.sample`、`.env.template`、`.env.dist` 仍可作为模板读取。

Folder 的敏感路径规则只是额外的 filename/path denylist，不是 DLP，也不保证识别正文中的秘密。用户仍必须只连接有权提供给 OpenAI 的内容。

## Git Project 兼容边界

Git Project 继续使用既有受控 Git runner：参数数组、只读 allowlist、禁用 external diff/textconv，并拒绝路径越界、`.git`、外部 symlink、二进制和超大读取。

为避免本轮顺手改变已发布连接器语义，Git Project 仍保持当前 0.3.0 的敏感文件名行为：不会仅因为文件叫 `.env`、credentials 或 secrets 就自动拒绝。该差异必须在 README、PRIVACY 和 SECURITY 中公开说明。

## Local Verification

Local Verification 安全模型仍是 Git-repository-bound：approval、HEAD、working tree、changed-test discovery、config/lockfile/runner binding 都依赖 Git repository identity。

因此第一版：

- Git Project：保持现有 Local Verification 行为；
- Folder Project：不 discovery、不 run、不暴露 verification evidence tools。

本轮不设计 Folder Verification，也不为了 Folder 模式拆松现有验证授权模型。

## Workspace Trust 与多根工作区

Workspace 状态语义为：

- `NoWorkspace`
- `Untrusted`
- `Ready`

`Ready` 内再解析 ProjectKind。Restricted Mode 仍禁止启动 MCP。

多根 Workspace 中用户必须选择一个 Workspace Folder。本次连接只绑定解析后的一个 Project Root；不实现 Multi Project Registry，也不允许一次工具调用跨 root 混读。

## VS Code 连接体验

主动作：

`Connect Current Project to ChatGPT`

用户不需要预选 Git / Folder。连接成功状态明确显示类型，例如：

```text
ai-ui · Git
```

或：

```text
temp-demo · Folder
```

由于这是可见连接流程变更，合并前需要 Windows F5 人工验收。

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

四平台 CI 必须覆盖 Ubuntu Node 20、Ubuntu Node 22、Windows Node 22、macOS Node 22，并依次完成：

1. frozen install；
2. lint；
3. TypeScript typecheck；
4. unit/integration tests；
5. legacy browser-extension static validation；
6. build；
7. VSIX package；
8. artifact upload；
9. VSIX content validation。

Folder Project 专项至少覆盖：

- Trusted plain folder 可连接；
- 无 `.git` 不再失败；
- identity / project kind；
- list/read/search；
- Git-only 和 verification tools 不注册且隐藏调用拒绝；
- Git Project 原工具保持；
- Local Verification 不回归；
- traversal / absolute / Windows drive / UNC / `.git`；
- symlink/junction escape；
- credential-like path；
- Restricted Mode；
- multi-root 单 root 选择；
- Git / Folder identity 不混淆。

详细测试门禁见 [test-and-verification.md](test-and-verification.md)。

## 合并条件

Folder Project Support 在以下条件全部满足前不得合并：

- Draft PR 的最终 head 四平台 CI 全绿；
- lint/typecheck/test/build/VSIX validation 全部通过；
- 完成最终 diff 与安全代码复核；
- 文档与真实工具集一致；
- 无未处理高风险路径越界、凭据泄漏或写操作入口；
- 用户完成 Windows F5 的 Git Project + Folder Project 连接/UI 人工验收。

人工验收通过前保持 Draft，不标记已发布。
