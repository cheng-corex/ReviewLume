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

### 3.3 FileSelectionService

- 展示变更文件。
- 推荐关联测试。
- 允许用户手动添加文件。
- 校验文件必须位于受信任工作区内。
- 遵守 `.gitignore`、`.reviewlumeignore` 和内置排除规则。

### 3.4 SecretScanner

扫描两类风险：

1. 文件级风险：`.env`、证书、数据库、密钥文件。
2. 内容级风险：API Key、Bearer Token、私钥、数据库连接串等。

扫描结果分为：

- BLOCK：默认禁止加入。
- WARN：需要用户确认。
- INFO：提示可能包含内部信息。

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

## 4. 数据目录

默认保存在用户全局存储区，不污染仓库：

```text
<globalStorage>/reviews/<workspace-id>/<review-id>/
  request.md
  manifest.json
  response.md
  review-report.md
  resolution.md
```

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
