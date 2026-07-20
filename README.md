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

## 浏览器桥接（P9）

浏览器桥接是可选的本地辅助能力，用于把 ReviewLume 已生成的提示填入受支持网页的输入框。它不会替代原有的复制、粘贴、导出和回答导入流程。

- 本地服务只监听 `127.0.0.1` 的随机端口。
- VS Code 状态栏提供 ChatGPT、Claude 和 Gemini 的一键连接入口：自动启动桥接、生成一次性短时配对码并打开本地安全交接页，不需要手动输入端口或配对码。
- 配对数据只放在短时 URL fragment 中，不进入 HTTP 请求或服务端日志；浏览器扩展接收后立即清除 fragment，并只在会话存储中暂存交接信息。
- 浏览器扩展采用 Manifest V3；AI 站点权限按站点单独请求，默认不持有站点访问权限。首次连接只需确认一次浏览器权限，已有权限时自动配对并打开目标站点。
- 首批页面适配器支持 ChatGPT、Claude 和 Gemini 的公开输入页面。
- 提示到达扩展后仍需用户点击“填入当前页面”；扩展只触发标准输入事件，绝不点击发送。
- 不读取 Cookie、Session、Token、浏览历史或回答正文，不调用第三方 AI 内部接口。
- 撤销会话或关闭 VS Code 扩展后，内存中的桥接会话失效。

开发模式下可运行 `pnpm validate:browser-extension`，对 Manifest 权限、引用文件、JavaScript 语法以及禁止的自动发送和凭据读取原语执行专项校验。真实浏览器验收步骤见 [P9 人工验收清单](docs/p9-browser-bridge-verification.md)。

## 第一版范围

第一版只实现“保守模式”：

- 读取当前 Git 工作区和提交范围。
- 选择需要纳入审核的文件。
- 生成 Markdown 审核包。
- 扫描敏感文件和疑似密钥。
- 生成中文或英文审核提示。
- 打开指定 AI 网页并复制提示。
- 可选地通过显式、一键配对的本地浏览器桥接填入提示，但不自动发送。
- 手动粘贴 AI 回答并导入。
- 保存结构化审核报告与历史记录。

第一版明确不实现：

- 自动登录 AI 网站。
- 获取 Cookie、Session Token 或访问令牌。
- 调用网页内部 Backend API。
- 自动连续发送网页请求。
- 自动点击网页发送按钮。
- 自动采集或导入网页回答。
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
10. [P9 浏览器桥接实施计划](docs/p9-browser-bridge-plan.md)
11. [P9 人工验收清单](docs/p9-browser-bridge-verification.md)

## 推荐技术栈

- TypeScript
- VS Code Extension API
- pnpm workspace
- esbuild 或 Vite
- Zod
- simple-git 或受控的 Git 子进程封装
- Vitest
- Manifest V3 浏览器扩展

## 许可建议

公共开源版本建议使用 MIT License。发布前应补充隐私政策、第三方服务免责声明和安全报告渠道。
