# 实施计划

## 阶段 0：工程初始化

目标：建立可构建、可测试、可发布的 TypeScript Monorepo。

交付：

- pnpm workspace
- VS Code 扩展骨架
- 核心 packages
- ESLint、TypeScript、Vitest
- CI
- 基础 README、LICENSE、SECURITY.md

完成标准：

- 能生成 VSIX。
- 示例命令可在 Extension Development Host 中运行。
- 单元测试和类型检查通过。

## 阶段 1：只读 Review Pack MVP

目标：无需浏览器扩展即可完成单个 Git repository 的审核包创建和结果归档。

功能：

1. 工作区与 Git 状态检测。
2. 多根工作区中显式选择一个 repository；一次审核不跨 repository。
3. staged、unstaged、commit range 选择。
4. 变更文件树。
5. 手动增加当前 repository 内的关联文件。
6. 内置排除规则。
7. HARD_BLOCK/BLOCK/WARN/INFO 敏感信息扫描与明确处置流程。
8. Review Pack 预览。
9. 导出 Markdown。
10. 复制审核提示。
11. 手动导入 AI 回答。
12. 使用稳定 `workspaceId` 和不可变 `reviewId` 保存审核历史。
13. 区分导出文件 `REVIEW_REQUEST.md` 与内部历史快照 `request.md`。

完成标准：

- 可用于真实 TypeScript 项目最终审核。
- 不读取当前 repository 外文件。
- 多根工作区中不会混入其他 repository 的 diff 或文件。
- HARD_BLOCK 永远不能导出，未处理 BLOCK 和未确认 WARN 不能导出。
- 审核 ID 可重复验证、无路径泄露且冲突可重试。
- 未安装任何浏览器扩展时完整可用。

## 阶段 2：报告结构化与复核闭环

目标：把聊天回答变成可追踪的问题清单。

功能：

- 解析结论和问题分组。
- 用户手动调整严重程度。
- 记录处理状态。
- 生成实施任务提示。
- 导入修复报告。
- 生成二次复核请求。
- 对比首次审核与复核结果。
- 保持同一审核闭环中的 `reviewId` 不变，通过子记录或轮次字段区分复核。

完成标准：

- 每个问题都有唯一 ID。
- 问题状态可追踪。
- 原始回答始终保留，不被解析结果覆盖。
- 标题、状态和复核轮次变化不会改变已有 `reviewId`。

## 阶段 3：可选浏览器桥接

目标：减少复制粘贴，但保持人工确认。

功能：

- VS Code 本地桥接服务。
- 浏览器扩展配对。
- 用户主动把提示填入当前网页。
- 当前站点适配器。
- 用户主动导入当前回答。

完成标准：

- 不读取 Cookie 和 Session。
- 不调用内部 API。
- 不自动点击发送。
- 浏览器端不能读写本地文件。
- 任意协议消息都经过 schema 校验。
- 桥接消息必须绑定有效 `reviewId`，且不能改变审核绑定的 repository。

## 阶段 4：公共发布与生态

目标：发布稳定公共版本。

功能：

- 中英文界面。
- Marketplace 文档与演示。
- 隐私政策。
- 错误诊断。
- 导出诊断包，自动脱敏。
- 模板扩展机制。

暂不考虑：

- 云端账户系统。
- 团队同步。
- 自动代码修改。
- AI 代理循环。
- 跨 repository 合并审核包。
