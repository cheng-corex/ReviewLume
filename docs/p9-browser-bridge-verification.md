# P9 浏览器填入桥接验收（已取消）

该验收清单对应已停止作为主方案的浏览器填入原型，不再要求执行。

ReviewLume 的 P9 已调整为 **ChatGPT 只读项目 MCP 连接器**：用户在 ChatGPT 中发指令，ChatGPT 通过 ReviewLume 的只读工具自行选择 Git 范围、diff、文件和测试。

当前有效的架构、自动验证、人工验收和合并条件见：

- [P9 ChatGPT 只读项目 MCP 计划](p9-readonly-mcp-plan.md)
- [P9 浏览器填入桥接原型说明](p9-browser-bridge-plan.md)

旧浏览器扩展代码暂时保留在 Draft PR 分支，只用于提取或对照安全设计；扩展主清单不再注册旧配对和填入命令。MCP 主流程稳定后再单独决定遗留代码清理范围。
