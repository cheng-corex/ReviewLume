# 任务清单

## P0：工程基础

- [x] 初始化 pnpm workspace。
- [x] 创建 `apps/vscode-extension`。
- [x] 创建核心 packages。
- [x] 配置 TypeScript project references。
- [x] 配置 ESLint、Prettier、Vitest。
- [x] 配置 GitHub Actions 或其他 CI。
- [x] 添加 MIT License、SECURITY.md、CHANGELOG.md。

## P1：扩展入口

- [x] 注册 `ReviewLume: Create Review Pack`。
- [x] 注册 `ReviewLume: Open Review History`。
- [x] 注册 `ReviewLume: Import Review Response`。
- [x] 支持 Workspace Trust。
- [x] 添加 Activity Bar 图标和 View Container。
- [x] 增加日志 OutputChannel。

## P2：Git 上下文

- [x] 检测 Git 可用性。
- [x] 获取 repository root。
- [x] 枚举多根工作区中的 Git repositories。
- [x] 多个 repository 存在时要求用户明确选择一个。
- [x] 保证一次审核任务只绑定一个 repository。
- [x] 获取 staged/unstaged/untracked 状态。
- [x] 支持 commit range，且 base/target 必须属于当前 repository。
- [x] 拒绝跨 repository 合并 diff 或文件。
- [x] 使用参数数组调用 Git。
- [x] 增加超时、取消和错误提示。
- [x] 覆盖路径包含空格和中文的测试。

## P3：文件选择

- [x] 展示变更文件树。
- [x] 支持勾选/取消。
- [x] 支持手动添加关联文件。
- [x] 支持测试文件推荐。
- [x] 限制在当前审核绑定的 repository 内。
- [x] 遵守 `.gitignore`。
- [x] 支持 `.reviewlumeignore`。
- [x] 拒绝符号链接逃逸 repository。
- [x] 多根工作区中不能选择其他 repository 的文件。

## P4：敏感扫描

- [x] 实现文件名规则。
- [x] 实现私钥检测。
- [x] 实现常见 Token 检测。
- [x] 实现连接串检测。
- [x] 实现脱敏预览。
- [x] 支持 HARD_BLOCK/BLOCK/WARN/INFO。
- [x] HARD_BLOCK 永远禁止导出且不能通过设置关闭。
- [x] BLOCK 必须排除或脱敏后重新扫描，不能直接确认放行。
- [x] WARN 必须逐项确认并记录确认状态。
- [x] 允许用户通过文件选择树排除命中内容。
- [x] 修改范围、文件内容或 diff 后强制重新扫描。
- [x] 日志和诊断信息不保存原始命中秘密。

## P5：Review Pack

- [x] 定义 schema v1。
- [x] 定义 `workspaceId`：规范化 repository identity 的 SHA-256 前 16 位。
- [x] 定义 `reviewId`：UTC 时间加 12 位密码学安全随机十六进制值。
- [x] 提供创建历史目录前的 ID 冲突检查与重试入口。
- [x] 生成元数据。
- [x] manifest 记录 `workspaceId`、`reviewId`、repository display name 和安全扫描计数。
- [x] manifest 不保存原始绝对路径和带凭据 remote URL。
- [x] 生成审核说明。
- [x] 支持嵌入需求和实施报告。
- [x] 嵌入 diff。
- [x] 嵌入所选文件。
- [x] 记录排除和截断。
- [x] 实现大小预算。
- [x] 导出 Markdown 主文件名固定为 `REVIEW_REQUEST.md`。
- [x] 可选导出 ZIP，目录名为 `reviewlume-pack-<review-id>`。
- [x] HARD_BLOCK、未处理 BLOCK 或未确认 WARN 存在时禁止最终导出。

## P6：审核面板

- [x] 创建 Webview。
- [x] 文件树和扫描结果可视化。
- [x] 分开展示 HARD_BLOCK、BLOCK、WARN、INFO。
- [x] 显示字符数和估算大小。
- [x] 显示完整发送预览。
- [x] 复制提示。
- [x] 保存审核包。
- [x] 所有 Webview 消息使用 Zod 校验。
- [x] 配置严格 CSP。

## P7：报告历史（代码完成，等待人工验收）

- [x] 成功导出后在 `.reviewlume/history/<reviewId>/` 原子保存 `metadata.json` 和 `request.md`。
- [x] 内部请求快照固定使用 `request.md`，内容与当次已校验 Review Pack Markdown 完全一致。
- [x] `metadata.json` 使用严格 Zod schema，并提供旧 P7 元数据的兼容读取入口。
- [x] `reviewId` 创建后保持不可变，历史始终绑定当前 repository。
- [x] 历史目录、条目和文件执行 realpath、普通文件及符号链接安全校验。
- [x] 历史列表按时间倒序，并可按 reviewId、文件路径和导出格式搜索。
- [x] 损坏或部分缺失的历史会明确展示，不会静默丢弃或导致界面崩溃。
- [x] 支持打开已有导出、打开导出目录和复制原始审核提示。
- [x] 支持从 `request.md` 精确恢复缺失的 Markdown；无法可靠重建原 ZIP 时不生成伪 ZIP。
- [x] 支持删除单条历史及对应的受管导出目录，默认要求用户确认。
- [x] 支持从文件或剪贴板导入文本回答，保存为 `response.md`。
- [x] 导入回答时限制大小，日志不记录回答正文或用户控制的标题。
- [x] `.reviewlume/history/` 自动加入 `.gitignore`，并从后续审核文件选择中排除。
- [x] 历史和回复导入界面根据 VS Code 语言自动显示中文或英文。
- [ ] 完成 F5 人工验收：三种导出、历史浏览、复制、回复导入、损坏记录、删除和 Restricted Mode。
- [ ] 支持导出脱敏诊断信息。

## P8：二次复核

- [ ] 问题唯一 ID。
- [ ] 状态：open/fixed/rejected/needs-review。
- [ ] 生成实施提示。
- [ ] 导入修复摘要。
- [ ] 生成复核包。
- [ ] 展示首次和复核差异。
- [ ] 同一闭环保持 `reviewId` 不变，使用轮次或子记录区分复核。

## P9：浏览器桥接

- [ ] 单独创建 `apps/web-bridge`。
- [ ] Manifest V3。
- [ ] optional host permissions。
- [ ] 本地随机端口。
- [ ] 一次性配对码。
- [ ] 临时会话令牌。
- [ ] 页面适配器接口。
- [ ] 填入提示但不发送。
- [ ] 用户主动导入回答。
- [ ] 桥接请求必须绑定现有 `reviewId`。
- [ ] 浏览器端不能改变 repository 或本地文件范围。
- [ ] 不申请 Cookie 权限。
- [ ] 不访问内部 API。

## P10：发布

- [ ] 确认扩展名称和 publisher。
- [ ] 准备图标与截图。
- [ ] 编写 Marketplace README。
- [ ] 编写隐私政策。
- [ ] 编写第三方服务免责声明。
- [ ] 生成和本地安装 VSIX。
- [ ] 检查包内文件。
- [ ] 发布预览版。
- [ ] 收集反馈后再发布 1.0。
