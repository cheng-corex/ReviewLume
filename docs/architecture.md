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
- 用户明确选择的变更文件和关联文件继续遵守原有 `.gitignore`、`.reviewlumeignore` 与 realpath 边界，不因为 P7.5 自动上下文排除目录而被静默移除。
- 自动上下文额外排除 `.git/`、`.reviewlume/`、依赖目录、构建产物、数据库与二进制文件。
- 内置排除 `.reviewlume/exports/**` 与 `.reviewlume/history/**`，避免生成物递归进入后续审核。
- 自动上下文使用可逆覆盖层；切回“仅变更”时移除自动文件，但保留用户显式选择。

### 3.4 ReviewScopeService

提供三种审核范围：

- **仅变更**：变更文件与用户明确添加的关联文件。
- **智能上下文**：默认模式，在仅变更基础上补充一层本地依赖、直接调用方、相关测试、类型伴随文件和项目配置。
- **完整仓库**：包含当前 repository 中符合规则的全部 UTF-8 文本文件。

约束：

- 智能上下文不会递归遍历无限依赖图；自动文件数、读取文件数和总字节数均有硬上限。
- 本地依赖只解析静态相对路径的 `import`、`export from`、`require` 和动态 `import()`；第一阶段不推断 TypeScript path alias。
- 完整仓库先统计合规文件数与源文件字节数，再一次性应用选择；超限时保留原范围并明确阻止。
- 完整仓库必须生成未截断 Review Pack。构建器报告任何 truncation 时禁止导出，不能把部分项目伪装成完整项目。
- 范围切换会使旧扫描、旧预览和旧导出许可失效，用户必须重新扫描。

### 3.5 SecretScanner

扫描两类风险：

1. 文件级风险：`.env`、证书、数据库、密钥文件。
2. 内容级风险：API Key、Bearer Token、私钥、数据库连接串等。

扫描结果分为：

- HARD_BLOCK：确定的私钥正文、会话凭据、Cookie、Authorization 凭据和其他不可安全导出的秘密。第一版永远禁止加入审核包，不提供“仍然导出”选项。
- BLOCK：高风险文件或确定性较高的密钥、Token、连接串。用户必须排除命中内容或完成脱敏后重新扫描，不能静默绕过。
- WARN：疑似秘密、高熵字符串或可能包含内部数据的内容，需要逐项确认后才能加入。
- INFO：仅用于提示范围、内部标识或普通隐私风险，不阻止导出。

`reviewlume.secretScan.blockOnHighRisk` 只能控制 WARN 是否升级为阻止状态，不能关闭 HARD_BLOCK，也不能让 BLOCK 未经处理直接导出。

### 3.6 ReviewPackBuilder

把元数据、需求、diff、文件内容和测试信息写入标准 Markdown。必须支持大小预算和截断说明。

P7.5 中：

- Git diff 始终是审核重点，只针对选中的真实变更路径生成。
- 自动上下文文件以完整文件内容加入，并在 manifest 中标记来源。
- 智能上下文仍遵守普通 Review Pack 大小预算并显示截断信息。
- 完整仓库不接受任何静默截断。

### 3.7 ReviewPanel

使用 Webview 展示：

- 审核范围及自动上下文数量。
- 文件清单与文件来源。
- 敏感扫描结果。
- Token/字符估算。
- 最终提示预览。
- 导出和复制操作。

Webview 内容不能直接执行 Node.js API；所有消息必须经过 schema 验证。范围选择只接受固定的 `changes`、`smart`、`full` 值，文件系统枚举与路径推导全部由 Extension Host 完成。

### 3.8 HistoryService

- 在成功导出之后保存同一份已校验 Review Pack 的历史快照。
- 使用严格 Zod schema 校验 `metadata.json`。
- 使用 realpath、普通文件检查和符号链接检查保证路径仍位于当前 repository。
- 原子写入 `metadata.json` 与 `request.md`，避免出现半条成功历史。
- 识别完整、部分缺失和损坏历史，不静默隐藏坏记录。
- 支持复制原始请求、打开受管导出、恢复精确 Markdown 和确认删除。
- 无法从历史数据可靠还原原 ZIP 时不生成伪造或不完整 ZIP。

### 3.9 ReportService（后续阶段）

- 导入 Markdown 或纯文本回答。
- 识别结论和问题分组。
- 允许用户手动调整严重度和状态。
- 生成 `review-report.md` 与 `resolution.md`。

P7 只保存用户主动导入的原始 `response.md`；结构化报告和处理状态属于 P8。

## 4. 数据目录与标识

当前版本使用 repository-local 目录，便于导出、浏览、删除和后续自动化按一次审核一个目录处理：

```text
<repository>/.reviewlume/
├─ exports/
│  └─ <reviewId>/
│     ├─ REVIEW_REQUEST.md                         # 按所选格式存在
│     └─ reviewlume-pack-<reviewId>.zip            # 按所选格式存在
└─ history/
   └─ <reviewId>/
      ├─ metadata.json
      ├─ request.md
      └─ response.md                               # 用户导入回答后才存在
```

规则：

- 对外 Markdown 主文件固定为 `REVIEW_REQUEST.md`。
- 内部历史请求快照固定为 `request.md`，内容与当次已校验 Markdown 完全一致。
- `metadata.json` 和 `request.md` 在导出成功后写入临时目录，再原子重命名为最终历史目录。
- `.reviewlume/history/` 必须加入 repository root 的 `.gitignore`；写入失败时不保存历史。
- `.reviewlume/exports/` 的自动忽略仍由导出设置控制。
- `askEveryTime` 可以把交付文件保存到用户选择的位置，但内部历史仍只保存在当前 repository 的 `.reviewlume/history/`。
- 历史 metadata 不保存绝对路径、带凭据 remote URL、环境变量或原始扫描秘密。
- `review-report.md` 与 `resolution.md` 属于 P8，本阶段不创建。

### 4.1 workspaceId

`workspaceId` 用于稳定标识同一 repository，并保存在 Review Pack 与历史 metadata 中：

1. 优先取规范化后的 Git `remote.origin.url` 作为 repository identity。
2. 没有 remote 时，使用解析符号链接后的 repository root 绝对路径。
3. 对 identity 计算 SHA-256，取前 16 个小写十六进制字符作为 `workspaceId`。
4. 原始 remote URL 和绝对路径不得写入历史目录名或 metadata。
5. 当前历史目录直接以 `reviewId` 分组；`workspaceId` 用于完整性校验和未来迁移，不重复嵌入 repository-local 路径。
6. remote 变更或无 remote 仓库移动后可能生成新的 `workspaceId`。第一版不自动合并历史。

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
- 所有历史读写、复制、导入和删除操作都先按固定格式校验 `reviewId`，再由扩展端推导路径。

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

审核范围当前是活动审核会话状态，不写入全局配置；每次新建审核默认回到智能上下文。

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
- 单个自动上下文候选文件最大 2 MB；智能分析单文件读取上限更低。
- 智能上下文最多自动添加 60 个文件、约 768 KB 源文件内容，并限制反向依赖扫描预算。
- 完整仓库第一阶段最多 500 个合规文本文件、约 1.5 MB 原始源文件内容。
- 二进制文件永不内嵌。
- 大 diff 必须摘要并提示用户选择范围。
- 扫描和打包使用取消令牌。
- 不在扩展激活阶段遍历整个代码库；仓库枚举只在创建审核或主动切换范围时发生。
