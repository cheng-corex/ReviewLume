# P8 二次复核闭环

P8 将一次审核后的问题选择、实施提示、修复摘要、二次复核和结果对比串成同一条只读优先闭环。所有状态均保存在原审核历史目录中，并继续沿用原始 `reviewId`。

## 范围

### P8F：实施提示与修复摘要

- 从有效结构化报告中选择 `open` 或 `needs-review` 问题。
- 生成边界明确的实施提示并复制到剪贴板，同时保存为 `implementation-request.md`。
- 从文件或剪贴板导入修复摘要并保存为 `implementation-response.md`。
- 导入修复摘要不会自动修改源码，也不会自动改变问题状态。

### P8G：二次复核轮次

- 基于同一 `reviewId`、选中问题和已导入的修复摘要生成二次复核提示。
- 每次生成都会追加一个顺序递增的轮次，最多 20 轮。
- 二次复核请求、原始回复和结构化报告分别按轮次保存。
- 只允许向当前待完成轮次导入复核回复，避免跨轮次串写。

### P8H：首次结果与复核结果对比

- 使用稳定 `sourceFingerprint`，缺失时回退到 `issueId`。
- 对选中的基线问题输出：
  - `persistent`：复核后仍存在；
  - `resolved`：复核后未再出现；
  - `new`：修复直接引入的新问题。
- 不会把未选中的既有问题误判为新增问题。
- 导入复核结果后显示 resolved、persistent、new 和严重级别变化汇总。

### P8I：状态、边界与兼容

- 状态文件：`review-loop.json`，当前 `schemaVersion` 为 1。
- 所有写入使用临时文件加原子替换。
- 审核目录、reviewId、内容大小、哈希和轮次顺序均经过校验。
- 不跟随符号链接写入，不接受损坏或 ID 不匹配的状态。
- 不执行 AI 回复中的命令，不自动应用补丁，不读取浏览器凭据，不调用第三方 AI 内部接口。
- P8 不包含 P9 浏览器桥接。

## 主要命令

1. `ReviewLume: Generate Implementation Prompt`
2. `ReviewLume: Import Implementation Summary`
3. `ReviewLume: Generate Re-review Prompt`
4. `ReviewLume: Import Re-review Response`

## 生成文件

位于对应审核历史目录：

- `review-loop.json`
- `implementation-request.md`
- `implementation-response.md`
- `re-review-request-<round>.md`
- `re-review-response-<round>.md`
- `re-review-report-<round>.json`

## 集中 F5 验收清单

1. 选择一条带有效结构化报告的审核历史。
2. 生成实施提示，确认只能选择未解决问题，剪贴板和文件内容一致。
3. 导入修复摘要，确认空内容、超大文件和非法文件会被拒绝。
4. 生成第一轮二次复核提示，确认 reviewId 未变化且轮次为 1。
5. 再次生成前确认存在待完成轮次时不会产生并行冲突。
6. 导入二次复核回复，确认保存原始回复和结构化报告。
7. 检查汇总中的 resolved、persistent、new 与实际报告一致。
8. 生成下一轮复核，确认轮次严格递增并继续关联同一 reviewId。
9. 重启 Extension Development Host，确认闭环状态仍可继续读取。
10. 确认全过程没有自动修改项目代码、自动执行命令或更改问题状态。

## 自动化验证

CI 在 Node.js 20/22 的 Ubuntu、Windows 和 macOS 上执行：

- lint
- type check
- unit tests
- build
- VSIX package

集中 F5 验收完成前，PR 保持 Draft。