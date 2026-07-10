# ReviewLume

> 面向 VS Code 的隐私优先、只读优先、多网页 AI 兼容的代码最终审核助手。

ReviewLume 用于把 Git 改动、关联源码、测试和验收要求整理成结构化审核包，再交给用户选择的浏览器 AI 助手进行最终代码审核。项目默认不读取浏览器 Cookie、不使用会话令牌、不调用网页内部接口，也不让网页模型直接操作本地终端或任意文件。

## 产品定位

ReviewLume 不是通用编码 Agent，也不是某一家 AI 服务的非官方 API 客户端。它专注于四件事：

1. 精确收集本次代码改动及必要上下文。
2. 在发送前扫描密钥、凭据和敏感文件。
3. 生成可复用、可审计的最终审核任务。
4. 将 AI 审核结果整理成结构化报告并追踪闭环。

## 推荐工作流

```text
实施模型完成开发
    ↓
日常审核模型检查 diff
    ↓
ReviewLume 生成最终审核包
    ↓
用户手动提交给浏览器 AI
    ↓
ReviewLume 导入并整理审核结果
    ↓
实施模型修复问题
    ↓
ReviewLume 生成二次复核任务
```

## 第一版范围

第一版只实现“保守模式”：

- 读取当前 Git 工作区和提交范围。
- 选择需要纳入审核的文件。
- 生成 Markdown 审核包。
- 扫描敏感文件和疑似密钥。
- 生成中文或英文审核提示。
- 打开指定 AI 网页并复制提示。
- 手动粘贴 AI 回答并导入。
- 保存结构化审核报告与历史记录。

第一版明确不实现：

- 自动登录 AI 网站。
- 获取 Cookie、Session Token 或访问令牌。
- 调用网页内部 Backend API。
- 自动连续发送网页请求。
- 自动执行 AI 返回的终端命令。
- 让浏览器扩展读取任意本地文件。
- 未经确认直接修改项目代码。

## 文档阅读顺序

1. [产品方案](docs/product-overview.md)
2. [系统架构](docs/architecture.md)
3. [安全与合规边界](docs/security-and-compliance.md)
4. [审核包格式](docs/review-pack-format.md)
5. [实施计划](docs/implementation-plan.md)
6. [任务清单](docs/task-plan.md)
7. [测试与验收](docs/test-and-verification.md)
8. [发布指南](docs/publishing-guide.md)
9. [用户指南](docs/user-guide.md)

## 推荐技术栈

- TypeScript
- VS Code Extension API
- pnpm workspace
- esbuild 或 Vite
- Zod
- simple-git 或受控的 Git 子进程封装
- Vitest
- Playwright（第二阶段浏览器桥接）

## 许可建议

公共开源版本建议使用 MIT License。发布前应补充隐私政策、第三方服务免责声明和安全报告渠道。
