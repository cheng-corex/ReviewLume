# P10：ChatGPT 逐批确认写入 MCP 计划

> 状态：实施中  
> 阶段边界：在 P9 单仓库 MCP 上增加可选、受控的文本文件写入；不开放 shell、任意文件系统、删除或 Git 修改。

## 1. 目标

用户在 ChatGPT 中完成只读检查后，可以继续发出“修复这个问题”“补充测试”等明确指令。ChatGPT 通过 ReviewLume 读取需要编辑的完整文件，提交拟写入内容；ReviewLume 在 VS Code 中逐批请求用户确认，确认后才写入当前绑定仓库。

P10 不把 ReviewLume 变成拥有电脑完全控制权的通用 Agent。默认连接仍为只读，写入权限必须由用户显式启用。

## 2. 权限模式

配置项：`reviewlume.mcp.writeAccess`

| 值 | 行为 |
| --- | --- |
| `disabled` | 默认值，仅暴露 P9 只读工具 |
| `confirmEachRequest` | 额外暴露 `read_file_for_edit`、`write_files`，每批有效修改都要求 VS Code 模态确认 |

配置作用域为 VS Code window。切换后需要停止并重新连接 MCP；新连接会根据当前配置重新生成工具列表和 server instructions。

## 3. 新工具

### 3.1 `read_file_for_edit`

输入：

- `path`：仓库相对路径。

输出：

- 完整 UTF-8 文本内容；
- 字节数；
- SHA-256 并发令牌。

约束：

- 文件必须位于当前绑定仓库；
- 只允许普通文本文件；
- 拒绝 `.git`、绝对路径、父目录逃逸和符号链接；
- 单文件不超过 512 KiB。

### 3.2 `write_files`

输入：

- 可选 `reason`；
- 1–20 个 change；
- 每个 change 包含 `path`、`expectedSha256`、完整 `content`。

语义：

- 创建新文件时 `expectedSha256` 必须为 `null`；
- 替换现有文件时必须使用最近一次 `read_file_for_edit` 返回的 SHA-256；
- 相同内容视为 no-op，不弹确认、不写磁盘；
- 有效修改在写入前显示创建/替换类型和字节变化；
- 用户拒绝时返回 declined，不修改磁盘；
- 用户确认后再次校验路径、存在性和 SHA，防止确认期间发生变化；
- 写入后保留普通 working-tree changes，不自动 add、commit 或 push。

## 4. 强制安全边界

P10 必须保持：

- 一次连接只绑定一个 Trusted Workspace Git repository；
- 本地 MCP 仍只监听 `127.0.0.1` 随机端口并使用短时 token；
- 默认不暴露写入工具；
- 每批实际写入必须由 VS Code 用户确认；
- 目标文件存在未保存 VS Code 编辑内容时 fail-closed；
- 替换现有文件采用 SHA-256 乐观并发控制；
- 单文件最大 512 KiB；单批新内容最大 768 KiB；单批最多 20 个文件；
- 拒绝绝对路径、`..`、`.git`、符号链接、二进制和 NUL 内容；
- 不提供删除、重命名、shell、终端、包安装或进程启动；
- 不提供 Git add、commit、checkout、reset、clean、merge、rebase、fetch 或 push；
- 不执行仓库文件或 AI 回复中包含的命令；
- 不记录文件内容、写入内容、搜索内容或凭据。

## 5. 并发和故障处理

### 5.1 乐观并发

现有文件读取时生成 SHA-256。写入准备和用户确认完成后均重新检查磁盘内容。任何不匹配都拒绝写入并要求重新读取。

### 5.2 未保存编辑器

VS Code 中目标文件存在 dirty TextDocument 时拒绝确认，避免磁盘写入与编辑器缓冲区互相覆盖。人工验收还需验证确认窗口打开期间产生 dirty 内容时也不会被覆盖。

### 5.3 批次失败

批次逐文件写入。如果中途失败，ReviewLume 尽力把已替换文件恢复为原字节，并删除本批刚创建且已写入的文件。错误必须明确返回；不得声称已完整成功。

Git working tree 是最终可见的恢复和审计边界。P10 不自动创建 commit。

## 6. MCP 声明

只读模式：

- server name/title/description 明确 read-only；
- 所有工具 `readOnlyHint=true`。

逐批确认写入模式：

- server name/title/description 明确 confirmed-write；
- `read_file_for_edit` 仍为只读；
- `write_files` 声明 `readOnlyHint=false`、`destructiveHint=true`、`idempotentHint=false`、`openWorldHint=false`；
- instructions 明确先读完整文件和 SHA，再写入；明确不存在删除、命令或 Git 修改能力。

## 7. 自动测试范围

- 默认模式不暴露写入工具；
- 写入模式工具和 annotations 正确；
- 完整读取返回 SHA-256；
- 创建和替换只在确认后发生；
- 用户拒绝不修改磁盘；
- stale SHA fail-closed；
- 确认期间文件变化 fail-closed；
- no-op 不确认；
- 重复路径、绝对路径、父目录逃逸、`.git`、符号链接、二进制和超限输入被拒绝；
- Windows junction 与路径大小写；
- VSIX 包含写入运行时代码但不包含测试源码；
- 四平台 lint、TypeScript、测试、构建和 VSIX 内容门禁通过。

## 8. 人工联调边界

P10 涉及 VS Code 设置、模态确认和真实 ChatGPT MCP 调用，合并前需要 Windows F5 人工验收。验收清单见 [p10-confirmed-write-mcp-verification.md](p10-confirmed-write-mcp-verification.md)。

## 9. 本阶段明确不做

- 无确认自动写入；
- 删除或重命名文件；
- 自动应用任意 unified diff；
- shell/PowerShell/cmd/bash；
- 自动运行 lint、测试、构建或安装依赖；
- Git 写操作；
- 浏览器 Cookie、Session 或凭据读取；
- 多仓库同时连接。
