# 任务清单

## P0：工程基础

- [ ] 初始化 pnpm workspace。
- [ ] 创建 `apps/vscode-extension`。
- [ ] 创建核心 packages。
- [ ] 配置 TypeScript project references。
- [ ] 配置 ESLint、Prettier、Vitest。
- [ ] 配置 GitHub Actions 或其他 CI。
- [ ] 添加 MIT License、SECURITY.md、CHANGELOG.md。

## P1：扩展入口

- [ ] 注册 `ReviewLume: Create Review Pack`。
- [ ] 注册 `ReviewLume: Open Review History`。
- [ ] 注册 `ReviewLume: Import Review Response`。
- [ ] 支持 Workspace Trust。
- [ ] 添加 Activity Bar 图标和 View Container。
- [ ] 增加日志 OutputChannel。

## P2：Git 上下文

- [ ] 检测 Git 可用性。
- [ ] 获取 repository root。
- [ ] 获取 staged/unstaged/untracked 状态。
- [ ] 支持 commit range。
- [ ] 使用参数数组调用 Git。
- [ ] 增加超时、取消和错误提示。
- [ ] 覆盖路径包含空格和中文的测试。

## P3：文件选择

- [ ] 展示变更文件树。
- [ ] 支持勾选/取消。
- [ ] 支持手动添加关联文件。
- [ ] 支持测试文件推荐。
- [ ] 限制在工作区内。
- [ ] 遵守 `.gitignore`。
- [ ] 支持 `.reviewlumeignore`。
- [ ] 拒绝符号链接逃逸工作区。

## P4：敏感扫描

- [ ] 实现文件名规则。
- [ ] 实现私钥检测。
- [ ] 实现常见 Token 检测。
- [ ] 实现连接串检测。
- [ ] 实现脱敏预览。
- [ ] 支持 BLOCK/WARN/INFO。
- [ ] 允许用户排除命中内容。
- [ ] 不允许静默绕过 BLOCK。

## P5：Review Pack

- [ ] 定义 schema v1。
- [ ] 生成元数据。
- [ ] 生成审核说明。
- [ ] 嵌入需求和实施报告。
- [ ] 嵌入 diff。
- [ ] 嵌入所选文件。
- [ ] 记录排除和截断。
- [ ] 实现大小预算。
- [ ] 导出 Markdown。
- [ ] 可选导出 ZIP。

## P6：审核面板

- [ ] 创建 Webview。
- [ ] 文件树和扫描结果可视化。
- [ ] 显示字符数和估算大小。
- [ ] 显示完整发送预览。
- [ ] 复制提示。
- [ ] 保存审核包。
- [ ] 所有 Webview 消息使用 Zod 校验。
- [ ] 配置严格 CSP。

## P7：报告历史

- [ ] 定义 reviewId。
- [ ] 保存 request、response、report、resolution。
- [ ] 导入文本回答。
- [ ] 基础标题解析。
- [ ] 允许人工编辑问题清单。
- [ ] 删除单次历史。
- [ ] 清空全部历史。
- [ ] 支持导出脱敏诊断信息。

## P8：二次复核

- [ ] 问题唯一 ID。
- [ ] 状态：open/fixed/rejected/needs-review。
- [ ] 生成实施提示。
- [ ] 导入修复摘要。
- [ ] 生成复核包。
- [ ] 展示首次和复核差异。

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
