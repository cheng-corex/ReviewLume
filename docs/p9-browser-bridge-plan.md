# P9 浏览器填入桥接原型（已停止作为主方案）

## 状态

本文件记录 P9 早期“浏览器输入框填入”原型。该方案已经被 **ChatGPT 只读项目 MCP + OpenAI Secure MCP Tunnel** 取代，不再是 ReviewLume 的默认主流程，也不再作为 P9 合并验收目标。

当前正式方案见：

- [P9 ChatGPT 只读项目 MCP 连接器](p9-readonly-mcp-plan.md)
- [P9 Secure MCP Tunnel 人工验收清单](p9-readonly-mcp-verification.md)

## 为什么停止

浏览器扩展只能把 ReviewLume 预先生成的提示填入 ChatGPT、Claude 或 Gemini 的公开输入框。模型开始回答后，无法反向按需读取当前 Git 状态、选择提交范围、查看新的 diff、搜索相关实现或补充测试上下文。

用户真正需要的是：

> 在 ChatGPT 中直接发出项目审核指令，由 ChatGPT 通过受控只读工具自行决定合理的检查范围。

因此浏览器输入框适配不再继续扩展。

## 原型已实现的内容

- 严格 Zod 协议、request hash、nonce、expiry、重放保护、reviewId 绑定和大小限制；
- 仅监听 `127.0.0.1` 随机端口的本地桥接服务；
- 一次性配对码、短时会话和显式撤销；
- fragment-only 浏览器交接；
- Manifest V3 最小权限和按站点 optional host permissions；
- ChatGPT、Claude、Gemini 公开输入页面适配器；
- 只填入提示、不自动发送、不读取网页回答；
- 不读取 Cookie、Session、Token、浏览器密码或历史记录；
- 四平台构建、测试和浏览器扩展专项校验。

## 处理方式

- 浏览器配对、站点选择和提示填入命令已从扩展 manifest、activation events 和主命令注册中移除；
- 原型代码暂时保留在 Draft PR #21 分支，方便复用 loopback、会话和安全测试经验；
- P9 MCP 主流程完成真实验收后，可在独立清理提交中删除不再使用的浏览器原型代码和构建校验；
- 在清理前，原型代码不得重新进入默认用户流程。

## 仍然有效的安全结论

- 不读取浏览器凭据；
- 不调用第三方 AI 内部接口；
- 不绕过额度、权限或产品限制；
- 不自动发送消息；
- 不采集网页回答；
- 不执行 AI 返回的命令或补丁；
- 一次连接只绑定一个 Git repository；
- 项目文件和模型输出始终视为不可信输入。
