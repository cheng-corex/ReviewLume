# 任务清单

## P0：工程基础（已完成）

- [x] 初始化 pnpm workspace。
- [x] 创建 VS Code 扩展和核心 packages。
- [x] 配置 TypeScript project references、ESLint、Vitest。
- [x] 配置 Windows、Ubuntu Node 20/22、macOS GitHub Actions。
- [x] 添加 MIT License、SECURITY.md、PRIVACY.md、CHANGELOG.md。

## P1–P7.5：P8 Advanced Review Pack 基础（已完成）

- [x] Trusted Workspace 与单 repository 绑定。
- [x] staged、unstaged、untracked 和 commit range。
- [x] 多根工作区显式选择一个 repository。
- [x] 变更文件树、关联文件和测试推荐。
- [x] `.gitignore`、`.reviewlumeignore`、realpath 和 symlink 边界。
- [x] HARD_BLOCK/BLOCK/WARN/INFO SecretScanner。
- [x] Review Pack Markdown、ZIP 和 combined 导出。
- [x] `workspaceId`、不可变 `reviewId` 和冲突重试。
- [x] `.reviewlume/exports/` 和 `.reviewlume/history/`。
- [x] 回答导入和原始 `response.md` 保存。
- [x] 仅变更、智能上下文和完整 repository 模式。
- [x] 完整 repository 超限时明确阻止，不静默截断。
- [x] P8 Advanced F5 人工验收。

## P8：二次复核闭环（已完成）

- [x] `report.json` schema v1。
- [x] JSON、Markdown、编号列表、表格和 unstructured 保守解析。
- [x] 稳定 issue ID。
- [x] open/fixed/rejected/needs-review 状态机。
- [x] 原子写入、hash 校验、损坏和过期状态识别。
- [x] 重新解析保留稳定问题状态。
- [x] 报告详情、汇总、筛选、搜索和排序。
- [x] 问题级状态操作。
- [x] 实施提示生成。
- [x] 修复摘要导入。
- [x] 二次复核请求和复核回答导入。
- [x] 首次审核与复核结果对比。
- [x] 同一闭环保持 `reviewId` 不变。
- [x] 四平台 CI、构建、VSIX 和集中 F5 验收。

> P8 SecretScanner 和导出门禁只保护 Advanced Review Pack，不自动应用于 P9 MCP。

## P9：ChatGPT 只读项目 MCP（已完成）

### 本地 MCP

- [x] `onStartupFinished` 激活和状态栏单一入口。
- [x] 一次连接只绑定一个 Trusted Workspace Git repository。
- [x] loopback 随机端口和每次启动新 Token。
- [x] Streamable HTTP MCP：initialize、ping、tools/list、tools/call。
- [x] Bearer 和 `X-ReviewLume-Token` 鉴权。
- [x] Origin、Content-Type、请求大小和速率限制。
- [x] Protected Resource Metadata。

### 7 个只读工具

- [x] `repository_summary`。
- [x] `git_status`。
- [x] `recent_commits`。
- [x] `get_diff`。
- [x] `list_files`。
- [x] `read_file`。
- [x] `search_code`。
- [x] read-only、non-destructive、idempotent、closed-world annotations。

### Repository 与 Git 边界

- [x] 只读 Git allowlist 和参数数组。
- [x] 禁用 external diff 和 textconv。
- [x] commit ref 规范化。
- [x] remote URL 用户名和密码清理。
- [x] 拒绝绝对路径、父目录逃逸、`.git` 和 NUL。
- [x] realpath 和 symlink repository 边界。
- [x] 拒绝目录、二进制和超大文件。
- [x] 文件、结果、匹配数、并发和速率预算。

### OpenAI Secure MCP Tunnel

- [x] Tunnel ID 格式校验。
- [x] 官方 `tunnel-client --help` 身份校验。
- [x] Runtime API Key 只存 VS Code SecretStorage。
- [x] Tunnel ID、客户端路径、代理和浏览器偏好存 globalState。
- [x] 受控环境变量和 ambient 配置清理。
- [x] `doctor --explain` 与诊断脱敏。
- [x] `/readyz` 和 `/api/status` 健康校验。
- [x] loopback-only diagnostics UI。
- [x] Tunnel → local MCP 停止顺序。
- [x] 异常退出状态和残留进程清理。

### 浏览器和 ChatGPT

- [x] 系统默认浏览器、Edge 和 Chrome 选择与持久化。
- [x] Windows/macOS/Linux 原生 URL 启动，`shell: false`。
- [x] 系统默认浏览器不再显示 VS Code Open/Cancel 确认。
- [x] 正常连接只打开 ChatGPT 新对话。
- [x] Apps/Connectors 设置只作为 Advanced 显式动作。
- [x] ReviewLume 连接器名与当前 repository 名分离。
- [x] Windows + ChatGPT 真实只读工具调用联调。

### P9 隐私边界

- [x] 公开说明 P9 不自动运行 SecretScanner。
- [x] 公开说明 `.env`、credentials、secrets、私钥和生产配置不按名称自动阻止。
- [x] 公开说明 tracked 敏感文件可被枚举。
- [x] 公开说明明确路径的 ignored 文本文件可由 `read_file` 读取。
- [x] 公开说明 diff、文件、搜索结果和提交标题可能包含秘密或个人数据。
- [x] 公开说明 `.gitignore` 不是完整保密边界。
- [x] 公开说明 P8 SecretScanner 不自动覆盖 P9。

### P9 验证

- [x] lint、TypeScript、测试、构建和 VSIX。
- [x] Windows Node 22、Ubuntu Node 20/22、macOS Node 22 全绿。
- [x] VSIX 内容校验。
- [x] Runtime Key、本地 Token 和文件内容不进入日志。
- [x] 用户取消和 Extension Host reload 不显示误导错误。
- [x] tools/call 不因 OutputChannel 生命周期变成 HTTP 500。

## P10：受控写入实验（已停止，不合并）

- [x] 技术实验和四平台 CI。
- [x] Windows VSIX 安装验证。
- [x] 确认与当前产品成本、套餐和只读定位不匹配。
- [x] PR #22 关闭且不合并。
- [x] 公开主线保持只读。
- [x] 停止 P10 CI 监控。

## 当前公开预览版收口

### 文档与隐私

- [x] README 与当前 P9 主流程一致。
- [x] PRIVACY.md 与实际 P9 可读范围一致。
- [x] SECURITY.md 区分 P9 MCP 与 P8 SecretScanner。
- [x] 安全与合规、架构、P9 计划和验收清单同步。
- [x] 编写 OpenAI Tunnel、Runtime Key、tunnel-client 和 ChatGPT Apps 完整配置指南。
- [x] 说明 ChatGPT 套餐、工作空间和灰度权限由 OpenAI 控制。
- [x] 说明工具定义更新需要刷新、重新扫描或重新创建应用。

### 发布准备

- [ ] 确认实际可用的 VS Code Marketplace Publisher ID。
- [ ] 决定首个公开版本号并同步 package、Changelog 和 VSIX 文件名。
- [ ] 准备不含密钥、Token、私有路径或源码的截图。
- [ ] 准备 Marketplace 描述、隐私链接、安全报告链接和第三方免责声明。
- [ ] 对最终发布候选运行四平台 CI。
- [ ] 检查最终 VSIX 内容并记录 SHA-256。
- [ ] 在 Windows 覆盖安装最终候选并完成连接、工具调用和停止验收。
- [ ] 创建 GitHub prerelease。
- [ ] 使用同一字节级 VSIX 发布 Marketplace Preview。

## 当前明确不做

- [x] 不读取 Cookie、Session、浏览器密码或 ChatGPT 回答。
- [x] 不调用第三方 AI 内部接口。
- [x] 不绕过 ChatGPT、Codex 或 API 额度。
- [x] 不自动执行 AI 回复。
- [x] 不自动修改或删除项目文件。
- [x] 不自动应用补丁。
- [x] 不提供 Git mutation。
- [x] 不跨 repository 聚合连接。
- [x] 不运营 ReviewLume repository 中转云服务。