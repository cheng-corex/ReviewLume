# P10：逐批确认写入 Windows F5 验收清单

> 目的：验证真实 VS Code Extension Host、OpenAI Secure MCP Tunnel 和 ChatGPT 连接中的受控写入体验。  
> 合并门禁：自动 CI 全绿后仍需完成本清单中的核心交互项。

## 1. 准备

1. 拉取 PR #22 最新分支并安装依赖。
2. 使用 F5 启动 Extension Development Host，打开一个可丢弃修改的测试 Git repository。
3. 确认工作区处于 Trusted 状态。
4. 确认 Secure MCP Tunnel 原配置仍可用。
5. 记录测试仓库初始 `git status`，保存所有编辑器内容。

## 2. 默认只读回归

1. 保持 `reviewlume.mcp.writeAccess=disabled`。
2. 停止旧连接并重新连接当前仓库。
3. 在 ChatGPT 中要求列出 ReviewLume 工具。
4. 预期：存在 P9 七个只读工具；不存在 `read_file_for_edit` 和 `write_files`。
5. 预期：状态栏和连接说明显示只读模式。
6. 预期：P9 的仓库摘要、状态、提交、diff、文件读取和搜索仍正常。

## 3. 启用逐批确认写入

1. 将当前窗口设置改为 `reviewlume.mcp.writeAccess=confirmEachRequest`。
2. 停止并重新连接 ReviewLume MCP。
3. 预期：ChatGPT 可看到 `read_file_for_edit` 和 `write_files`。
4. 预期：连接说明明确写入必须经过 VS Code 确认，且不能删除、执行命令或操作 Git。
5. 预期：状态栏提示当前为逐批确认写入模式。

## 4. 替换现有文件

1. 让 ChatGPT 对一个小型文本文件做可识别的小修改。
2. 观察 ChatGPT 先调用 `read_file_for_edit`，再调用 `write_files`。
3. 预期：VS Code 弹出模态确认窗口，显示仓库、文件路径、Replace 和字节变化。
4. 点击 **Apply changes**。
5. 预期：磁盘文件发生预期变化；没有其他文件变化。
6. 预期：`git diff` 可看到修改；没有自动 stage、commit 或 push。

## 5. 创建新文件

1. 让 ChatGPT 创建一个小型测试文本文件。
2. 预期：确认窗口显示 Create，旧字节数为 0。
3. 确认后新文件出现；父目录可在需要时创建。
4. 预期：新文件保持 untracked 或普通 working-tree change。

## 6. 用户拒绝

1. 再请求一次有效修改。
2. 在 VS Code 确认窗口中取消或关闭。
3. 预期：ChatGPT 收到 declined；磁盘和 `git diff` 没有该批变化。

## 7. 未保存编辑器保护

1. 在 VS Code 中修改目标文件但不要保存。
2. 让 ChatGPT 修改同一个文件。
3. 预期：ReviewLume 明确阻止写入并提示先保存或还原；不显示可应用的确认结果。
4. 预期：磁盘文件和未保存缓冲区都未被覆盖。
5. 再测试：确认窗口出现后，在另一个编辑器中把目标文件改为 dirty，再点击确认。
6. 预期：仍应 fail-closed；若实际实现未阻止，此项视为高风险问题，不得合并。

## 8. stale SHA 保护

1. 让 ChatGPT 读取一个文件但暂不写入。
2. 在本地修改并保存该文件。
3. 让 ChatGPT 使用旧读取结果写入。
4. 预期：返回“文件已变化，需要重新读取”；不弹有效写入确认；新保存内容保留。

## 9. 路径边界

分别请求：

- `../outside.txt`；
- Windows 绝对路径；
- `.git/config`；
- 指向仓库外的 symlink/junction；
- 二进制/NUL 内容；
- 超过单文件或批次上限的内容；
- 同批重复路径。

每项预期：在写入前拒绝，不修改磁盘，不泄露仓库外内容。

## 10. 无危险能力

确认 ChatGPT 工具列表中不存在：

- shell、PowerShell、cmd、bash；
- 任意命令执行；
- delete、rename；
- package install；
- Git add、commit、checkout、reset、clean、merge、rebase、fetch、push。

仓库文件或 AI 回复中的命令文本不得被自动执行。

## 11. 停止和重连

1. 停止 Secure MCP Connection。
2. 预期：旧 endpoint/token 失效。
3. 将 writeAccess 切回 disabled 并重新连接。
4. 预期：写入工具消失，恢复只读模式。

## 12. 验收记录

记录：

- 测试日期和 Windows/VS Code 版本；
- 使用的 PR head SHA；
- VSIX 版本和 SHA-256；
- 默认只读结果；
- 替换、创建、拒绝、dirty、stale SHA、路径边界结果；
- 是否存在意外文件、stage、commit、push 或命令执行；
- 截图或具体问题。

只有自动 CI 全绿、无高风险代码问题且上述核心交互通过后，PR 才能解除 Draft 并进入合并评估。
