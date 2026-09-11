# 安全与合规边界

## 1. 安全目标

ReviewLume 的公开 MCP 能力必须满足：

- 用户明确知道何时建立外部连接、绑定哪个 Project Root、当前是 Git Project 还是 Folder Project；
- 一次 MCP connection 只绑定一个 canonical outer Project Root；
- Workspace 未受信任时禁止启动项目 MCP；
- 默认不提供 shell、terminal、任意命令、写文件、删文件、rename、patch apply 或 Git mutation；
- Project 内容和 AI 回复始终是不可信输入，不能扩大工具能力或授权执行；
- local MCP 只监听 loopback，每次启动生成新的高熵 Token；
- Runtime API Key 不进入项目、VS Code settings JSON、argv、剪贴板或日志；
- project file 工具不能越过 root；
- Folder nested Git 只能查询授权 root 内被有界 discovery 明确允许的真实 child repository；
- 停止连接或 Extension Host 退出后，本地端口和 Token 失效；
- Git Project、Folder direct-file 和 Folder nested Git 的真实隐私边界必须分别说明，不宣传不存在的 DLP 能力。

ReviewLume 的“隐私感知”来自明确数据流、最小工具集、root 边界、最小凭据存储和用户控制，而不是声称能自动识别所有秘密。

## 2. Project Context

```text
Trusted Workspace Folder
        ↓
resolveProjectContext
        ↓
┌────────────────┬─────────────────────────┐
│ Git Project    │ Folder Project          │
│ canonical Git  │ canonical workspace     │
│ top-level      │ root                    │
│                │ └─ optional child Git   │
│                │    repositories         │
└────────────────┴─────────────────────────┘
        ↓
one MCP connection = one outer Project Root
```

检测规则：

1. canonicalize 所选 Workspace Folder；
2. 使用现有只读 Git runner 尝试 `git rev-parse --show-toplevel`；
3. 成功 → Git Project；
4. 无 root repository 或 Git discovery 不可用 → Folder Project；
5. Folder root 内的 child Git repositories 由独立、有界 discovery 发现；
6. child repository 不改变 outer Project Root，也不能越过它。

多 Workspace Folder 时仍必须选择一个 root。不实现跨 root Multi Project Registry，也不跨 root 混读。

## 3. 当前数据流

```text
用户选择一个 Trusted Workspace Folder
  ↓
ReviewLume 自动检测 Git Project / Folder Project
  ↓
启动 127.0.0.1 随机端口的只读 MCP
  ↓
官方 openai/tunnel-client 建立出站 Secure MCP Tunnel
  ↓
用户在 ChatGPT 对话中启用 ReviewLume 并发出指令
  ↓
ChatGPT 只能看到当前 Project Kind 注册的工具
  ↓
Folder 如需 Git：先 bounded discovery，再显式选择一个 child repository
  ↓
ReviewLume 经过 root、selector、路径、类型、大小和速率门禁返回结果
  ↓
结果通过 OpenAI Secure MCP Tunnel 离开本机并由 OpenAI 处理
```

VS Code 启动、扩展激活或仅打开菜单不会发送 Project 内容。ReviewLume 不运营中转云服务。

## 4. Capability-based MCP

### 4.1 Folder Project

Folder-wide：

- `project_summary`
- `list_files`
- `read_file`
- `search_code`

Nested Git：

- `list_git_repositories`
- `repository_summary`
- `git_status`
- `recent_commits`
- `get_diff`

后四个 Git query 必须显式提供 `repository`，且精确匹配 discovery 返回的 Folder-relative path。

Folder Project 不注册：

- `verification_status`
- `read_verification_output`

`project_summary` 必须明确：

- `projectKind = folder`；
- outer Folder root 无 aggregate Git history；
- nested Git 只能逐仓库查询；
- 无 Local Verification；
- 不得把多个 child repositories 合成 branch、HEAD、commit、staged/unstaged 或 diff。

### 4.2 Git Project

保持既有工具：

- `repository_summary`
- `git_status`
- `recent_commits`
- `get_diff`
- `list_files`
- `read_file`
- `search_code`

当前安装版本启用 Local Verification 时，可以额外提供只读 evidence：

- `verification_status`
- `read_verification_output`

所有工具必须保持 read-only、non-destructive、idempotent、closed-world annotations。

## 5. Shared 文件边界

所有 Project Kind 的显式 project file 读取都必须：

- 只接受 project-relative 路径；
- 拒绝 POSIX absolute、Windows drive absolute、UNC、NUL；
- 拒绝 `..`；
- 拒绝任意层级 direct `.git` 读取；
- 对目标执行 `realpath` 并确认仍位于 canonical Project Root；
- 拒绝 root 外 symlink/junction/reparse escape；
- 拒绝目录；
- 拒绝含 NUL 的 binary；
- 拒绝超过文件读取上限的文件；
- 对返回字节、行数、文件数、匹配数执行预算控制。

大结果必须明确截断，不能静默伪装为完整检查。

## 6. Folder Project 文件枚举与敏感路径

没有根 Git index 时，Folder-wide file tools 使用受限 filesystem enumeration，而不是执行 `git ls-files`：

- 仅使用 Node filesystem API；
- file enumeration 本身不启动 Git 或其它进程；
- 最多访问 20,000 entries；
- 最多返回 5,000 candidate files；
- 目录深度有上限；
- 不跟随 symbolic link / junction-like link；
- 每个候选目录、文件 `realpath` 后必须仍在 root；
- 跳过 `.git/.hg/.svn`；
- 跳过 `node_modules`、常见 cache/build/output trees；
- 跳过 `.ssh/.gnupg/.aws/.azure/.kube` 等 credential-store directories。

Folder direct-file tools 还额外拒绝明显 credential-like path，例如：

- `.env` 和非 template 的 `.env.*`；
- `credentials`、`credentials.json`、常见 `secrets.*`；
- `id_rsa`、`id_ed25519`；
- `.npmrc/.pypirc/.netrc`；
- `.key/.pem/.p12/.pfx/.jks/.keystore/.kdbx`。

`.env.example/.sample/.template/.dist` 可作为模板读取。

这只是保守路径策略，不是内容 DLP/SecretScanner。普通源码/配置仍可能包含真实秘密。

## 7. Folder Nested Git 边界

Nested Git discovery 是一个单独、受限的只读 Git 能力，不是 general process runner。

Discovery 限制：

- 最多 64 个 child repositories；
- 最多 20,000 visited entries；
- 最大深度 32；
- 跳过 VCS、dependency/build/cache 和 credential-store 目录；
- 不跟随 directory symlink/junction-like link；
- candidate 必须有本地非 symlink `.git` marker；
- `rev-parse --show-toplevel` 必须解析为 candidate 自身；
- `rev-parse --absolute-git-dir` 必须留在 outer Folder root；
- external Git metadata 拒绝。

Selector 限制：

- 只接受 `list_git_repositories` 实际返回的精确 project-relative path；
- absolute、Windows drive、UNC、`..`、`.`、`.git` component 拒绝；
- 普通非 repository 目录拒绝；
- symlink/junction alias 即使最终指向一个合法 child repo，也不能替代 discovery 返回 path。

执行边界：

- 每次只绑定一个 child repository；
- 复用既有只读 Git allowlist；
- 参数数组，不拼接 shell command；
- external diff/textconv 禁用；
- commit ref 解析后再使用；
- remote URL 返回前移除用户名/密码；
- 禁止 checkout/reset/clean/add/commit/merge/rebase/fetch/push。

Folder direct-file filename denylist **不自动过滤 nested Git status/history/diff**。一旦用户显式选择 child repository，其 Git metadata/diff 按既有 Git read semantics 返回，可能包含 tracked 敏感-looking path/content。用户必须在连接前自行脱敏。

## 8. Git Project 边界

Git Project 继续使用同一受控只读 Git allowlist 和 repository-bound 文件读取规则。

为了不破坏现有 Connector 兼容性，Git Project 不新增按敏感文件名自动阻断的规则：tracked `.env`、credential、secret、key 或 production config 仍可能在既有 Git 边界内被读取。P8 SecretScanner 不自动覆盖 MCP。

## 9. Local Verification

Local Verification 仍然只属于 **直接 Git Project**。

Git Project 的既有安全模型保持：

- Trusted Workspace；
- approval 绑定 canonical Git repository；
- 用户先看到 executable、固定 argv prefix、target mode、timeout 和风险；
- `spawn(executable, argv)` + `shell: false`；
- 不执行 AI 回复、项目文档、测试输出中的命令；
- 不运行任意 package script、不用 `npx` 下载 runner；
- runner/config 改变会使 approval 失效；
- 结果绑定 HEAD + working tree fingerprint；
- output/time 有界并 best-effort redaction；
- evidence tools 只能读取已完成结果。

测试代码本身仍是不可信可执行代码，ReviewLume 不是 sandbox。

Folder Project：

- 不 discovery verification rules；
- 不运行 verification；
- 不注册 verification evidence tools；
- child repositories 不继承、不触发 Local Verification approval。

不得为了 Folder mode 拆掉现有 repository identity / approval / HEAD / working-tree / runner binding 安全模型。

## 10. 威胁模型

### 10.1 Prompt injection / 恶意项目内容

项目中的 README、源码注释、测试、配置或文件名可能要求模型执行命令、读取 root 外文件或扩大权限。

应对：工具集由扩展代码固定；Project 内容不能动态注册工具；路径/selector 门禁独立于内容；无写/通用执行 MCP capability。

### 10.2 Path traversal 与链接逃逸

应对：project-relative validation + canonical root + `realpath` containment。Folder file enumeration 和 nested Git discovery 均不跟随 link entries；nested Git selector 还必须精确匹配 discovery 返回 path。

### 10.3 Malicious Git metadata

子仓库的 `.git` file 可以指向其它 git-dir，或 repository 可能是 worktree。

应对：Folder nested Git discovery 验证 `--show-toplevel` 和 `--absolute-git-dir`，两者都必须满足授权 root containment，top-level 还必须等于 candidate。主 git-dir 指向 root 外时拒绝该 repository。

### 10.4 Sensitive data exposure

Git、Folder direct-file、Folder nested Git 的 filename policy 不同，但三者都不是完整内容 DLP。用户必须在连接前移除、轮换或脱敏真实秘密，并只连接有权提供给 OpenAI 的数据。

### 10.5 Local endpoint abuse

应对：loopback-only、fresh token、Bearer/专用 Tunnel header、Origin/content-type/body/rate limits、停止后失效。

### 10.6 Tunnel credential contamination

应对：Runtime Key 仅 SecretStorage；通过受控 env 传递；不进入 argv；清除 ambient tunnel/MCP/admin/raw-log overrides；doctor 输出脱敏；长期 stdout/stderr 不采集。

### 10.7 Malicious AI response

ReviewLume 不执行 AI 回复、不自动 apply patch、不把自然语言结果转化为额外权限。P8 imported response 也仅是不可信文本记录。

## 11. P8 Advanced 边界

P8 Review Pack、history、issue state、implementation summary、re-review 保持既有 Git-oriented workflow。

P8 SecretScanner/HARD_BLOCK/BLOCK/WARN/export gate 只保护 P8 收集/导出，不自动保护 MCP 或 Verification evidence。

Folder Project Support 不改变 P8 阶段编号，也不把这些 Git diff/history 状态机强行泛化到 Folder Project。

## 12. 可选浏览器桥接

Folder Project Support 不开始、不启用、不扩展可选浏览器桥接：

- 不读取浏览器 Cookie/Session/密码；
- 不读取 ChatGPT 输入框或回答；
- 不注入网页；
- 不调用第三方 AI 内部接口；
- 不绕过额度或产品权限。

## 13. 日志与遥测

- 不收集 telemetry/analytics；
- 日志不得包含 Runtime API Key、本地 Token、Authorization Header、文件正文、diff、搜索词、搜索结果或 raw verification output；
- raw HTTP logging 保持关闭；
- Tunnel Diagnostics 仅 loopback；
- observability 失败不能改变 MCP tool result。

## 14. OpenAI / ChatGPT 产品边界

ReviewLume 不能启用用户账户中不存在的 Apps/Connectors 权限，也不控制 OpenAI 的套餐、保留、训练、驻留、RBAC 或工具快照行为。

MCP tool schema 会随 Project Kind 和 ReviewLume 版本变化；如果 ChatGPT 保存了旧工具快照，用户可能需要刷新、重新扫描或重新创建连接器。

允许描述：

- “通过 OpenAI Secure MCP Tunnel 将一个 Trusted VS Code Git 或 Folder Project 以只读工具连接给 ChatGPT。”
- “Folder Project 可以跨授权 root 读/搜文件，并对明确选中的内部 Git repository 做只读 Git 查询。”
- “Folder root 没有 aggregate Git history，Folder mode 没有 Local Verification。”

禁止描述：

- “官方 ChatGPT 插件”；
- “自动修复代码”；
- “自动执行 AI 命令”；
- “把多个子仓库合成一个 Git history”；
- “Folder Project 自动跑 child repo 测试”；
- “自动阻止所有秘密”；
- “绕过 ChatGPT/API 额度”。

详细 Folder 设计见 [Folder Project Support](folder-project-support.md)，隐私说明见 [../PRIVACY.md](../PRIVACY.md)。
