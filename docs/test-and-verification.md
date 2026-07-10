# 测试与验收

## 1. 测试层级

### 单元测试

覆盖：

- Git 参数构造。
- 路径归一化。
- repository 选择与边界判断。
- ignore 规则。
- secret scanner 分级与处置。
- `workspaceId` 确定性生成。
- `reviewId` 唯一性、格式和冲突重试。
- Review Pack 序列化。
- 导出文件与内部快照命名。
- 报告解析。
- schema 校验。

### 集成测试

覆盖：

- 临时 Git 仓库。
- staged/unstaged/commit range。
- 多根工作区包含一个、多个和零个 Git repositories。
- 多 repository 场景要求用户明确选择。
- 拒绝跨 repository 的 diff、commit range 和关联文件。
- 中文路径和空格路径。
- 大文件截断。
- 符号链接逃逸。
- Restricted Mode。
- Webview 消息交互。
- 历史目录 `<workspaceId>/<reviewId>` 创建和冲突处理。

### 端到端测试

使用 `@vscode/test-electron`：

- 启动扩展。
- 在单 repository 工作区创建 Review Pack。
- 在多根工作区选择一个 repository 后创建 Review Pack。
- 触发 HARD_BLOCK 并确认没有任何绕过入口。
- 触发 BLOCK，完成脱敏前禁止导出。
- 触发 WARN，逐项确认后允许导出。
- 导入回答。
- 查看历史。
- 验证导出主文件为 `REVIEW_REQUEST.md`，内部历史快照为 `request.md`。

第二阶段使用 Playwright 测试浏览器扩展，但不要依赖真实 AI 站点；使用本地模拟页面验证适配器行为。

## 2. 安全测试

必须覆盖：

- `../` 路径穿越。
- 绝对路径和设备路径输入。
- 符号链接指向 repository 外。
- 多根工作区中选择另一个 repository 的文件。
- Webview 伪造消息。
- 超大输入。
- 二进制伪装成文本。
- 恶意 Markdown 和 HTML。
- AI 回复包含 Shell 命令。
- AI 回复包含伪造本地路径。
- 本地桥接错误 Origin。
- 过期令牌和重放请求。
- 关闭 secret scanner 后 HARD_BLOCK 仍然生效。
- `blockOnHighRisk` 配置不能让 BLOCK 或 HARD_BLOCK 直接导出。
- 日志、诊断包和 manifest 不包含原始秘密、绝对路径或带凭据 remote URL。

## 3. ID 与历史测试

### workspaceId

- 同一规范化 remote URL 在不同本地路径下得到相同 ID。
- remote URL 的等价写法经过规范化后得到相同 ID。
- 无 remote 时，同一解析后 repository root 得到相同 ID。
- ID 固定为 16 个小写十六进制字符。
- 目录名中不出现 remote URL、用户名或绝对路径。

### reviewId

- 格式符合 `yyyyMMdd'T'HHmmss'Z'-[0-9a-f]{12}`。
- 使用 UTC 时间。
- 随机部分来自密码学安全随机源。
- 模拟冲突时能够重新生成。
- 标题、状态和复核轮次变化不会改变 ID。

### schema 与命名

- schema v1 可稳定序列化和反序列化。
- 未知高版本 schema 给出明确错误，不静默覆盖。
- 导出包使用 `REVIEW_REQUEST.md`。
- 本地历史使用 `request.md`。
- 首次导出包默认不包含 `response.md`、`review-report.md` 和 `resolution.md`。

## 4. MVP 验收标准

### 功能

- 用户可选择 staged、unstaged 或 commit range。
- 多根工作区中用户必须选择一个 repository。
- 一次审核任务不会混入其他 repository 的内容。
- 用户能准确看到将发送的全部内容。
- 用户能排除任意普通文件。
- HARD_BLOCK 内容永远不能导出。
- BLOCK 内容在排除或脱敏并重新扫描前不能导出。
- WARN 内容必须逐项确认。
- 生成的 Markdown 在常见编辑器中可读。
- 用户可导入回答并形成历史记录。
- 导出与内部历史文件命名不会混淆。

### 安全

- 不读取当前 repository 外文件。
- 不读取浏览器凭据。
- 不调用网页内部 API。
- 不自动执行命令。
- Restricted Mode 下禁用危险能力。
- manifest、日志和诊断信息不泄露绝对路径、带凭据 remote URL 或原始秘密。

### 稳定性

- 无 Git 仓库时有明确提示。
- 多个 Git repositories 时有明确选择界面。
- Git 命令失败不会导致扩展崩溃。
- 大仓库操作可取消。
- 失败不会留下半写入历史。
- ID 冲突不会覆盖既有历史。

### 发布质量

- `pnpm lint` 通过。
- `pnpm typecheck` 通过。
- `pnpm test` 通过。
- VSIX 可安装和卸载。
- 包内不包含源码映射中的本地绝对路径、测试数据密钥或无关文件。

## 5. 人工验证清单

- [ ] Windows 路径。
- [ ] macOS/Linux 路径。
- [ ] 多根工作区只含一个 Git repository。
- [ ] 多根工作区包含多个 Git repositories，能选择且不会跨仓库收集。
- [ ] 非 Git 工作区。
- [ ] 大 diff。
- [ ] 仅新增文件。
- [ ] 删除文件。
- [ ] 重命名文件。
- [ ] 二进制文件。
- [ ] `.reviewlumeignore`。
- [ ] HARD_BLOCK 无法绕过。
- [ ] BLOCK 脱敏后重新扫描。
- [ ] WARN 逐项确认。
- [ ] 中英文界面。
- [ ] 历史删除。
- [ ] ID 冲突重试。
- [ ] 导出文件和内部快照命名。
- [ ] 完全离线使用。
