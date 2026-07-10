# Review Pack 格式

## 1. 设计目标

Review Pack 必须：

- 可由人直接阅读。
- 不依赖特定 AI 平台。
- 清晰标注来源和范围。
- 支持截断与省略说明。
- 能够复现审核输入。

## 2. 推荐目录

```text
reviewlume-pack-<review-id>/
├─ REVIEW_REQUEST.md
├─ manifest.json
└─ attachments/          # 可选，大文件拆分时使用
```

第一版可只生成单个 `REVIEW_REQUEST.md`。

## 3. REVIEW_REQUEST.md 结构

```markdown
# Final Code Review Request

## Review metadata
- Review ID
- Generated at
- Workspace
- Git base
- Git target
- Review mode

## Reviewer instructions
只读审核规则和输出格式。

## Requirement and acceptance criteria
用户输入或选中的需求文档。

## Implementation summary
实施模型报告或用户补充信息。

## Git status
变更文件、未跟踪文件和提交信息。

## Diff
本次 Git diff。

## Included files
每个文件使用独立标题和代码围栏。

## Tests
相关测试、运行命令和已知结果。

## Exclusions and truncations
未包含文件、敏感扫描结果和截断说明。
```

## 4. manifest.json

```json
{
  "schemaVersion": 1,
  "reviewId": "20260710-abc123",
  "createdAt": "2026-07-10T00:00:00Z",
  "mode": "standard",
  "git": {
    "base": "HEAD~1",
    "target": "HEAD"
  },
  "files": [
    {
      "path": "src/example.ts",
      "role": "changed",
      "sha256": "...",
      "truncated": false
    }
  ],
  "security": {
    "blocked": 0,
    "warnings": 1
  }
}
```

## 5. 审核模式

### 快速

- diff
- 变更文件列表
- 验收要求

### 标准

- 快速模式全部内容
- 变更文件全文
- 自动推荐的直接测试
- 用户选中的关联文件

### 高风险

- 标准模式全部内容
- 生命周期和资源清理代码
- 数据持久化和兼容路径
- 并发、锁和异常回滚相关代码
- API/Socket/数据库契约

### 自定义

完全由用户勾选。

## 6. 审核提示模板

```text
你是本项目的最终代码审核员。本轮只进行只读审核，不修改文件，不扩大任务范围。

审核要求：
1. 判断需求和验收标准是否完整实现。
2. 检查逻辑错误、兼容性回归、异常路径和测试缺口。
3. 涉及异步、并发、资源生命周期或数据恢复时，重点检查时序、锁释放、回滚和幂等性。
4. 每个确定问题必须给出文件、位置、证据、影响和建议。
5. 缺少证据时标记为“待确认”，不得作为确定缺陷。
6. 不要求无关重构，不评价纯风格偏好。

输出结构：
- 结论：通过 / 有条件通过 / 不通过
- 阻塞问题
- 非阻塞问题
- 测试缺口
- 待人工确认
- 已验证良好的关键点
```

## 7. 大小控制

- 优先保留 diff、变更文件和验收标准。
- 关联文件超过预算时只保留相关符号附近内容。
- 所有截断必须在文档中说明。
- 不允许静默省略。
