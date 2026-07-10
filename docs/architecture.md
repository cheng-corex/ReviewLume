# 系统架构

## 1. 总体架构

```text
┌──────────────────────────────────────┐
│ ReviewLume VS Code Extension         │
│                                      │
│ Git Range  File Picker  Secret Scan  │
│ Review Pack  Prompt  Report History  │
└──────────────────┬───────────────────┘
                   │ 可选：localhost 配对
┌──────────────────▼───────────────────┐
│ ReviewLume Web Bridge                │
│                                      │
│ 页面检测  填入提示  用户确认  导入回答 │
└──────────────────┬───────────────────┘
                   │
┌──────────────────▼───────────────────┐
│ Browser-based AI Assistant           │
└──────────────────────────────────────┘
```

## 2. Monorepo 结构

```text
reviewlume/
├─ apps/
│  ├─ vscode-extension/
│  └─ web-bridge/              # 第二阶段
├─ packages/
│  ├─ core/
│  ├─ git-context/
│  ├─ review-pack/
│  ├─ secret-scanner/
│  ├─ prompt-templates/
│  ├─ report-parser/
│  └─ bridge-protocol/         # 第二阶段
├─ docs/
├─ tests/
├─ package.json
├─ pnpm-workspace.yaml
└─ tsconfig.base.json
```

## 3. VS Code 扩展模块

### 3.1 Extension Host

职责：

- 注册命令。
- 管理配置。
- 检查 Workspace Trust。
- 调用 Git 和文件系统服务。
- 打开审核面板。

### 3.2 GitContextService

只开放白名单操作：

- 当前工作区状态。
- staged diff。
- unstaged diff。
- commit range diff。
- changed file list。
- 指定文件在目标提交的内容。

禁止把用户输入直接拼接为 Shell 命令。优先使用参数数组调用 `git`。

多根工作区和多仓库规则：

- 一次审核任务只能绑定一个 Git repository。
- 多根工作区中存在多个 repository 时，用户必须先明确选择本次审核的 repository。
- diff、commit range、关联文件、历史记录和 Review Pack 都限定在已选择的 repository 内。
- 第一版不生成跨 repository 的合并审核包；需要审核多个仓库时，分别创建多个审核任务。
- 非 Git 工作区文件夹不能作为 Git 审核源，但可在明确提示后作为纯文件审核的后续扩展能力，MVP 不实现。

### 3.3 FileSelectionService

- 展示变更文件。
- 推荐关联测试。
- 允许用户手动添加文件。
- 校验文件必须位于当前审核绑定的受信任 repository 内。
- 遵守 `.gitignore`、`.reviewlumeignore` 和内置排除规则。

### 3.4 SecretScanner

扫描两类风险：

1. 文件级风险：`.env`、证书、数据库、密钥文件。
2. 内容级风险：API Key、Bearer Token、私钥、数据库连接串等。

扫描结果分为：

- HARD_BLOCK：确定的私钥正文、会话凭据、Cookie、Authorization 凭据和其他不可安全导出的秘密。第一版永远禁止加入审核包，不提供“仍然导出”选项。
- BLOCK：高风险文件或确定性较高的密钥、Token、连接串。用户必须排除命中内容或完成脱敏后重新扫描，不能静默绕过。
- WARN：疑似秘密、高熵字符串或可能包含内部数据的内容，需要逐项确认后才能加入。
- INFO：仅用于提示范围、内部标识或普通隐私风险，不阻止导出。

`reviewlume.secretScan.blockOnHighRisk` 只能控制 WARN 是否升级为阻止状态，不能关闭 HARD_BLOCK，也不能让 BLOCK 未经处理直接导出。

### 3.5 ReviewPackBuilder

把元数据、需求、diff、文件内容和测试信息写入标准 Markdown。必须支持大小预算和截断说明。

### 3.6 ReviewPanel

使用 Webview 展示：

- 审核范围。
- 文件清单。
- 敏感扫描结果。
- Token/字符估算。
- 最终提示预览。
- 导出和复制操作。

Webview 内容不能直接执行 Node.js API；所有消息必须经过 schema 验证。

### 3.7 ReportService

- 导入 Markdown 或纯文本回答。
- 识别结论和问题分组。
- 允许用户手动调整严重度和状态。
- 生成 `review-report.md` 与 `resolution.md`。

## 4. 数据目录与标识

默认保存在用户全局存储区，不污染仓库：

```text
<globalStorage>/reviews/<workspace-id>/<review-id>/
  request.md
  manifest.json
  response.md
  review-report.md
  resolution.md
```

这里的 `request.md` 是插件内部保存的审核请求快照；对外导出的审核包主文件固定命名为 `REVIEW_REQUEST.md`。两者内容可相同，但用途和生命周期不同，不应混用文件名。

### 4.1 workspaceId

`workspaceId` 用于归类同一 repository 的审核历史：

1. 优先取规范化后的 Git `remote.origin.url` 作为 repository identity。
2. 没有 remote 时，使用解析符号链接后的 repository root 绝对路径。
3. 对 identity 计算 SHA-256，取前 16 个小写十六进制字符作为 `workspaceId`。
4. 原始 remote URL 和绝对路径不得写入目录名；在 UI 展示时使用仓库名称，必要时只在本地 manifest 中保存脱敏后的来源说明。
5. remote 变更或无 remote 仓库移动后可能生成新的 `workspaceId`。第一版不自动合并历史，允许用户手动导入旧历史作为后续能力。

### 4.2 reviewId

`reviewId` 必须全局足够唯一且创建后不可变：

```text
<UTC时间>-<随机值>
例如：20260710T031522Z-a1b2c3d4e5f6
```

规则：

- 时间部分使用 UTC，格式为 `yyyyMMdd'T'HHmmss'Z'`。
- 随机部分使用密码学安全随机数生成 12 个小写十六进制字符。
- 创建目录前检查冲突；发生冲突时重新生成随机部分。
- `reviewId` 不因标题、状态或复核次数变化而修改。
- Review Pack schema 升级时通过 `schemaVersion` 迁移，不通过改变 ID 语义处理。

允许用户选择保存到项目内的 `.reviewlume/`，但必须明确提示并建议加入 `.gitignore`。

## 5. 配置项

建议命名空间：`reviewlume.*`

- `reviewlume.language`
- `reviewlume.defaultReviewMode`
- `reviewlume.maxPackSizeKb`
- `reviewlume.includeUntrackedFiles`
- `reviewlume.respectGitIgnore`
- `reviewlume.customIgnoreFile`
- `reviewlume.secretScan.enabled`
- `reviewlume.secretScan.blockOnHighRisk`
- `reviewlume.history.storage`
- `reviewlume.provider.defaultUrl`

## 6. 浏览器桥接协议（第二阶段）

桥接只允许最小动作：

```ts
export type BridgeMessage =
  | { type: 'PING' }
  | { type: 'GET_ACTIVE_REVIEW' }
  | { type: 'ACTIVE_REVIEW'; payload: ReviewTaskPayload }
  | { type: 'IMPORT_RESPONSE'; payload: { reviewId: string; text: string } };
```

浏览器端不得请求：

- 任意文件读取。
- 任意目录遍历。
- 命令执行。
- 文件修改。
- 补丁应用。

## 7. 扩展激活策略

不要使用 `*` 全局激活。建议在以下时机激活：

- 执行 ReviewLume 命令。
- 打开 ReviewLume View。
- 存在受支持的 Git 工作区。

## 8. 性能边界

- 默认 Review Pack 最大 2 MB。
- 单文件默认最大 300 KB。
- 二进制文件永不内嵌。
- 大 diff 必须摘要并提示用户选择范围。
- 扫描和打包使用取消令牌。
- 不在扩展激活阶段遍历整个代码库。
