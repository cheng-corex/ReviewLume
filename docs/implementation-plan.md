# 实施计划

## 当前阶段结论

ReviewLume 的产品路线已经完成以下阶段：

- P0–P7.5：工程基础、Git 上下文、文件选择、P8 Advanced Review Pack 基础、历史和上下文模式；
- P8：结构化报告、问题状态、实施提示、修复摘要、二次复核和结果对比；
- P9：ChatGPT 只读项目 MCP + OpenAI Secure MCP Tunnel；
- P10 受控写入实验：已停止，PR #22 关闭且不合并，公开主线保持只读。

当前工作不是开启新的产品阶段，而是完成公开预览版的文档、隐私、发布和 Marketplace 收口。

## P0：工程初始化（已完成）

目标：建立可构建、可测试、可发布的 TypeScript Monorepo。

交付：

- pnpm workspace；
- VS Code 扩展骨架；
- 核心 packages；
- ESLint、TypeScript、Vitest；
- 四平台 GitHub Actions；
- README、LICENSE、SECURITY.md 和 CHANGELOG.md。

## P1–P7.5：P8 Advanced Review Pack 基础（已完成）

目标：在不依赖浏览器连接器的情况下，生成可预览、可扫描、可导出和可追踪的审核包。

已实现：

- Trusted Workspace 和单 repository 绑定；
- staged、unstaged、commit range；
- 变更文件、相关文件和测试推荐；
- `.gitignore`、`.reviewlumeignore`、realpath 和 symlink 边界；
- HARD_BLOCK/BLOCK/WARN/INFO SecretScanner；
- Review Pack Markdown/ZIP；
- `.reviewlume/exports/` 和 `.reviewlume/history/`；
- `workspaceId` 和不可变 `reviewId`；
- 仅变更、智能上下文和完整 repository 模式；
- 回答导入和历史管理。

这些能力当前标记为 **Advanced**，不再是默认主流程。

## P8：二次复核闭环（已完成）

目标：把 AI 回答转为本地、可追踪、可复核的问题闭环。

已实现：

- `report.json` schema 和保守解析；
- 稳定 issue ID；
- open/fixed/rejected/needs-review 状态；
- 重新解析时保留问题状态；
- 报告汇总、筛选、搜索和排序；
- 问题级状态操作；
- 实施提示；
- 修复摘要导入；
- 二次复核包和回答导入；
- 首次与复核结果对比；
- 同一闭环保持 `reviewId` 不变。

P8 的 SecretScanner 和导出门禁只保护 P8 Advanced Review Pack，不自动应用于 P9 MCP 工具调用。

## P9：ChatGPT 只读项目 MCP（已完成）

目标：用户直接在 ChatGPT 中提出项目检查指令，让模型按需调用只读工具选择合理范围。

架构：

```text
Trusted VS Code Git repository
  → ReviewLume loopback read-only MCP
  → official openai/tunnel-client
  → OpenAI Secure MCP Tunnel
  → ChatGPT custom app / connector
```

已实现：

- 状态栏单一主入口；
- 一次连接只绑定一个 repository；
- `127.0.0.1` 随机端口和每次启动新 Token；
- Streamable HTTP MCP；
- 7 个只读工具；
- 只读 Git allowlist；
- 路径、`.git`、realpath、symlink、二进制和大小边界；
- OpenAI Runtime API Key 存入 VS Code SecretStorage；
- 官方 `tunnel-client` 身份校验、doctor、启动和健康检查；
- 代理发现与受控环境变量；
- 系统默认浏览器、Edge 和 Chrome 原生启动；
- 当前项目身份和 ReviewLume 连接器名称分离；
- Extension Host reload 和用户取消不显示误导错误；
- 停止时 Tunnel → local MCP 的生命周期清理；
- Windows + ChatGPT 真实读取联调；
- 四平台 CI、构建和 VSIX 内容校验。

### P9 实际隐私边界

P9 MCP 不自动运行 SecretScanner，也不自动按 `.env`、credentials、secrets、证书、私钥或生产配置文件名阻止读取。

P9 强制：

- repository root 和 realpath 边界；
- 拒绝绝对路径、父目录逃逸、`.git` 和外部 symlink；
- 拒绝目录、二进制和超大文件；
- 限制结果、文件数、行数、并发和速率；
- 不记录文件正文、diff、搜索词和搜索结果；
- 不提供 Shell、终端、写入、删除、补丁或 Git mutation。

P9 不保证识别或移除文件、diff、提交标题和搜索结果中的秘密。用户必须在连接前移除、轮换或脱敏真实凭据。

## P10：受控写入实验（已停止）

曾实现并验证：

- opt-in 写入模式；
- 每批 VS Code 模态确认；
- SHA-256 并发保护；
- 未保存编辑器拦截；
- 路径和 symlink 边界；
- 部分失败回滚；
- 四平台 CI。

最终处理：

- PR #22 关闭且不合并；
- 公开主线不包含写入工具；
- 不继续维护 P10；
- 不通过 ReviewLume 绕过 ChatGPT 套餐或 MCP 权限；
- 产品定位保持只读项目审核连接器。

## 当前发布收口

目标：发布可公开安装的 0.1.x Preview。

必须完成：

1. README、PRIVACY、SECURITY、架构、P9 计划、验收清单、用户指南和 Marketplace 文案与代码一致；
2. 提供 OpenAI Tunnel、Runtime API Key、官方 tunnel-client 和 ChatGPT 应用的完整配置指南；
3. 明确 P9 不自动秘密扫描，P8 SecretScanner 是独立 Advanced 流程；
4. 确认 Marketplace Publisher ID；
5. 确认版本号、图标、截图和第三方免责声明；
6. 最新发布候选四平台 CI 全绿；
7. VSIX 内容不包含源码、测试、凭据、用户数据或 `tunnel-client`；
8. Windows 实机完成安装、浏览器、Tunnel、ChatGPT 工具调用和停止清理验收；
9. 记录最终 commit、VSIX SHA-256 和 release notes；
10. 先发布 GitHub prerelease，再发布同一字节级 VSIX 到 Marketplace。

## 明确不进入当前路线

- 浏览器 Cookie、Session、密码或网页回答读取；
- AI 网站内部 API；
- 自动发送网页提示；
- 自动执行 AI 命令；
- 自动写入项目；
- 自动应用补丁；
- Git mutation；
- 跨 repository 聚合连接；
- 云端 ReviewLume 中转服务；
- 绕过 ChatGPT、Codex 或 API 额度。