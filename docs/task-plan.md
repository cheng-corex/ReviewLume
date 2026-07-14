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

## P7：报告历史（已完成）

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
- [x] 完成 F5 人工验收：三种导出、历史浏览、复制、回复导入和删除均正常。

## P7.5：审核上下文模式（已完成）

- [x] 在审核面板提供“仅变更 / 智能上下文 / 完整仓库”三种范围。
- [x] 新审核会话默认使用智能上下文。
- [x] 智能上下文加入一层本地依赖、直接调用方、相关测试、类型文件和项目配置。
- [x] 智能上下文设置文件数与字节预算，防止依赖图无限扩展。
- [x] 完整仓库只枚举 Git 未忽略且 `.reviewlumeignore` 未排除的 UTF-8 文本文件。
- [x] 排除 `.git/`、`.reviewlume/`、依赖目录、构建产物、数据库和二进制文件。
- [x] 完整仓库超过安全文件数或大小时明确阻止，不静默截断。
- [x] 三种模式继续经过敏感扫描、内容指纹与导出门控。
- [x] 范围切换使用严格 Zod Webview 消息，中文环境显示中文，其他语言显示英文。
- [x] 完成 F5 人工验收：范围切换、智能推荐、完整仓库确认、超限提示与导出结果。

## P8：二次复核闭环（进行中）

### P8A：数据基础与结构化问题解析（已完成）

- [x] 定义 `report.json` schema v1（ReviewReport + ReviewIssue）。
- [x] 稳定唯一的问题 ID 生成（ISSUE-16位hex，基于规范化字段的 SHA-256）。
- [x] 问题状态定义与校验：open/fixed/rejected/needs-review。
- [x] 状态转换纯函数校验（开放所有合法转换，拒绝非法转换）。
- [x] AI 回答保守解析器：JSON、Markdown 标题、编号列表、表格和 unstructured 回退。
- [x] 解析状态：parsed/partial/unstructured。
- [x] 原始 `response.md` 完整保留，不因解析失败而丢失。
- [x] `report.json` 原子写入（临时文件 + rename + 备份恢复）。
- [x] 读取时校验 sourceResponseHash，识别过期/损坏/版本不兼容。
- [x] 导入回答时自动解析生成 `report.json`（解析失败不回滚已保存的 response.md）。
- [x] 历史详情展示解析状态、问题数量、严重度和位置。
- [x] 支持查看原始回复和重新解析。
- [x] 兼容 P7 历史，无 response 不解析，有 response 无 report 显示“尚未解析”。
- [x] 损坏 report.json 不影响查看 request.md 和 response.md。
- [x] 所有路径操作复用 HistoryService 安全边界。
- [x] 解析器纯函数，不访问文件系统、VS Code API 或网络。
- [x] 完成 F5 人工验收。

### P8B：问题状态处理基础（已完成）

- [x] 实现单问题状态转换入口。
- [x] 非法状态转换被拒绝。
- [x] 状态更新继续校验 reviewId 和 sourceResponseHash。
- [x] 状态写入串行执行并原子落盘。
- [x] 中文和英文状态操作界面。

### P8C：重新解析保留状态（已完成）

- [x] 重新解析时基于稳定问题标识保留既有状态。
- [x] 新增问题使用默认待处理状态。
- [x] 已移除问题不伪造保留。
- [x] 状态保留逻辑具有回归测试。

### P8D：历史报告详情状态处理（已完成）

- [x] 从历史报告详情直接选择问题并修改状态。
- [x] 只展示当前问题允许的合法目标状态。
- [x] 修改后重新读取报告并刷新汇总。
- [x] 取消操作不写盘。
- [x] 完成 F5 人工验收。

### P8E：报告汇总与筛选（代码完成，等待最终收口）

- [x] 汇总总问题数、未处理数、严重和高等级数量。
- [x] 支持全部、未处理、待处理、待复核、严重和高等级筛选。
- [x] 支持 QuickPick 文本搜索和稳定排序。
- [x] 筛选条件与问题列表使用原生分隔区，并显示当前结果数量。
- [x] 空筛选结果显示明确提示，且仍可切换筛选。
- [x] 状态修改后汇总与筛选结果立即刷新。
- [x] 完成筛选区、问题区和状态展示的 F5 人工验收。
- [x] 增加裸 JSON 与中文严重级别兼容入口及回归测试。
- [ ] 最新 CI 全绿并完成最终代码复核。

### P8 后续事项

- [ ] 生成实施提示。
- [ ] 导入修复摘要。
- [ ] 批量修改问题状态的完整 UI。
- [ ] 生成二次复核 Review Pack。
- [ ] 首次审核与二次复核结果对比。
- [ ] 同一闭环保持 `reviewId` 不变，使用轮次或子记录区分复核。

## P9：浏览器桥接（未开始，需用户明确批准）

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
- [ ] 支持导出脱敏诊断信息。
- [ ] 生成和本地安装 VSIX。
- [ ] 检查包内文件。
- [ ] 发布预览版。
- [ ] 收集反馈后再发布 1.0。
