# ReviewLume

> 面向 VS Code 的隐私感知、只读 MCP 优先的 ChatGPT 项目连接器，并为 Git Project 提供可选的用户授权本地验证。

ReviewLume 把当前 VS Code 中选定的一个本地项目以受控的只读 MCP 工具连接给 ChatGPT。项目可以是 Git repository，也可以只是普通 Workspace Folder。Git 是增强能力，不是 MCP 连接前置条件。

ReviewLume 不向 ChatGPT 提供终端、Shell、任意命令、写文件、应用补丁或 Git 修改能力，也不读取浏览器 Cookie、Session、Token、密码或 ChatGPT 回答。

可选的本地验证助手仍由 VS Code 用户控制，并继续绑定 Git repository 的安全模型。Folder Project 不发现、不运行、也不暴露 Local Verification evidence 工具。

> **重要隐私提醒：** Git Project 的既有 MCP 行为不会因为文件名是 `.env`、`credentials`、`secrets` 或内容像密钥就自动阻止读取；Folder Project 采用更保守的明显凭据路径/文件名阻断，但这仍不是内容 SecretScanner。连接前必须移除、轮换或脱敏真实凭据，只连接你有权提供给 OpenAI 的项目内容。详细说明见 [PRIVACY.md](PRIVACY.md)。

详细设计见 [Folder Project Support](docs/folder-project-support.md)、[Stable MCP Tool Contract](docs/stable-mcp-tool-contract.md) 和 [ChatGPT 与 OpenAI Secure MCP Tunnel 配置指南](docs/chatgpt-secure-mcp-setup.md)。
