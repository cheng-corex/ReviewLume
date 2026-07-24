# 发布指南

## 1. 产品与品牌

正式名称：ReviewLume

Marketplace 展示名称：

> ReviewLume – Secure Read-only Repository MCP

Marketplace 简短描述：

> Connect ChatGPT to one VS Code Git repository through the official OpenAI Secure MCP Tunnel and bounded, read-only MCP tools.

Marketplace 页面必须明确：

> ReviewLume is an independent open-source project and is not affiliated with or endorsed by OpenAI, Microsoft, Anthropic, Google, or other service providers.

不要使用第三方服务商 Logo 作为插件图标，也不要使用“官方 ChatGPT 插件”“自动保护所有秘密”“绕过额度”等描述。

完整可复制文案见 [Marketplace Listing](marketplace-listing.md)。

## 2. 当前发布形态

VS Code 扩展是唯一主发布物。P9 主流程为：

```text
VS Code selected Git repository
  → ReviewLume loopback read-only MCP
  → official openai/tunnel-client
  → OpenAI Secure MCP Tunnel
  → user-enabled ChatGPT app / connector
```

旧浏览器填入桥接原型不作为当前产品能力发布或宣传：

- 不注册浏览器桥接命令；
- 不贡献 activation events；
- 不要求用户安装浏览器扩展；
- 不读取网页输入、Cookie、Session 或回答。

P8 Review Pack、历史、导入回答和二次复核继续保留为 Advanced 本地能力。

## 3. Marketplace 身份与版本

当前已创建的 Publisher：

- Publisher name：`ReviewLume`
- Publisher ID：`ReviewLume`
- Extension name：`reviewlume-vscode`
- 完整扩展 ID：`ReviewLume.reviewlume-vscode`
- 首个公开版本：`0.2.0`
- Marketplace channel：Preview
- Pricing：Free

`apps/vscode-extension/package.json` 必须与以上标识完全一致。Publisher ID 创建后不可修改；如果未来迁移 Publisher，只能按 Marketplace 当前规则创建新的发布身份，不能静默改变现有扩展所有权。

## 4. package.json 发布检查

发布前确认：

- `name`、`displayName`、`description` 与当前只读 MCP 定位一致；
- `publisher` 精确等于已创建的 `ReviewLume` Publisher ID；
- `version` 等于 `0.2.0`，并与 VSIX 文件名、Changelog、验收文档一致；
- `preview: true`；
- `pricing: "Free"`；
- `repository` 指向公开仓库；
- `icon` 为 ReviewLume 自有 PNG 资源；
- `engines.vscode` 与实际测试版本兼容；
- manifest 不定义 Runtime API Key、Token 或 Secret 设置；
- manifest 不注册旧浏览器桥接命令或重复 Activity Bar；
- `onStartupFinished` 只初始化状态栏和命令，不主动联网或读取 repository。

## 5. Marketplace 页面必须包含

- 产品定位和只读能力说明；
- 一次连接只绑定一个 Git repository；
- 7 个 MCP 工具列表；
- 不提供 shell、写文件、删除文件、补丁或 Git mutation 的声明；
- OpenAI Secure MCP Tunnel 依赖和首次配置说明；
- [ChatGPT 与 OpenAI Secure MCP Tunnel 配置指南](chatgpt-secure-mcp-setup.md) 链接；
- ChatGPT 账户或工作空间必须实际具备自定义 MCP 应用/连接器入口的说明；
- OpenAI 套餐、Developer mode、Apps/Connectors 界面和灰度权限可能变化，ReviewLume 不绕过这些限制；
- ChatGPT 中每个新对话需要启用 ReviewLume 应用/连接器的已知限制；
- ChatGPT 批准工具后可能使用冻结快照，工具更新需要刷新、重新扫描或重新创建应用；
- 数据流图和“何时数据离开本机”的说明；
- Runtime API Key 只保存在 VS Code SecretStorage 的说明；
- 无 telemetry 声明；
- [PRIVACY.md](../PRIVACY.md) 链接；
- [SECURITY.md](../SECURITY.md) 链接；
- 第三方服务免责声明；
- 支持平台、已知限制和排障方式；
- 至少一张不包含真实密钥、Token、私有路径、账户信息或不可公开源码的截图。

### 必须直接公开的 P9 隐私限制

Marketplace 页面不得只写“隐私优先”而省略实际可读范围。必须清楚说明：

- P9 MCP 不自动运行 SecretScanner；
- `.env`、credentials、secrets、私钥文本、生产配置和 tracked 敏感文件不会因名称自动被阻止；
- `read_file` 可以读取 repository 内明确指定的普通文本文件，包括已忽略文件；
- diff、文件摘录、提交标题和搜索结果可能包含 API Key、Token、密码、连接串、个人数据或内部地址；
- `.gitignore` 不是完整保密边界；
- 用户必须在连接前移除、轮换或脱敏真实秘密；
- P8 Advanced Review Pack 的 SecretScanner 是独立流程，不自动保护 P9 MCP。

不得声称：

- “所有敏感文件都会自动拦截”；
- “代码永远不会离开本机”；
- “SecretScanner 会过滤所有 ChatGPT 工具结果”；
- “连接任意私有 repository 都是安全的”。

## 6. 首次配置文档最低要求

配置指南必须覆盖：

1. 在 OpenAI Platform 创建 Tunnel；
2. 创建最小权限 Runtime API Key，明确禁止 Admin Key；
3. 从 `openai/tunnel-client` 官方 Release 下载对应客户端；
4. 在 ReviewLume 中选择客户端、填写 Tunnel ID 和 Runtime Key；
5. 在 ChatGPT 创建自定义应用/连接器，选择 Tunnel 并填写 Tunnel ID；
6. 扫描并核对 7 个只读工具；
7. 在 Business/Enterprise/Edu 工作空间中启用 Developer mode、测试和发布应用的当前官方流程；
8. 账户无自定义应用入口、工具快照过期、Tunnel 失败和代理问题的排障；
9. 停止连接、撤销 Runtime Key、删除 Tunnel 和删除 ChatGPT 应用的撤销流程。

所有 OpenAI 界面步骤应注明“以 OpenAI 当前页面和官方文档为准”，避免把 beta UI 写成永久稳定承诺。

## 7. 发布前自动检查

```bash
pnpm install --frozen-lockfile
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm package:vscode
```

GitHub Actions 必须在以下矩阵全部通过：

- Windows Node 22；
- Ubuntu Node 20；
- Ubuntu Node 22；
- macOS Node 22。

每个平台必须通过：依赖安装、lint、TypeScript、测试、遗留浏览器扩展静态校验、构建、VSIX 打包和 artifact 上传。

文档变更也必须跑完整矩阵，因为 Marketplace README、LICENSE、NLS、manifest 和文档会进入 VSIX 或发布页面检查。

## 8. VSIX 内容检查

发布候选 VSIX 必须确认：

- 文件名为 `reviewlume-vscode-0.2.0.vsix`；
- 内部 `extension/package.json` 的 publisher、name、version、preview 和 pricing 正确；
- 不包含 `.env`、测试密钥、Runtime API Key、本地 MCP Token 或 Authorization Header；
- 不包含本地缓存、`.reviewlume/` 历史或用户 repository 内容；
- 不包含测试 fixture、源映射、TypeScript 源码和私有文档；
- 只包含运行时需要的 `dist`、NLS、图标、Marketplace README、LICENSE、package manifest 和必要依赖；
- 不包含可执行的第三方 `tunnel-client`，客户端必须由用户从官方 release 单独下载并明确选择；
- Marketplace README 与 PRIVACY.md 中的实际 P9 读取边界一致；
- SHA-256 已记录在 PR、GitHub prerelease 和最终发布记录中。

## 9. 人工验收

涉及 VS Code UI、浏览器启动和真实 ChatGPT 的发布候选必须在 Windows 完成：

1. 全新安装或覆盖安装候选 VSIX；
2. 完全退出并正常启动 VS Code；
3. 确认底部状态栏自动出现且左侧无重复入口；
4. 确认代理自动发现/保存后可以普通方式启动 VS Code；
5. 确认浏览器选择、持久化和 ChatGPT 新对话入口正确；
6. System default browser 不再出现 VS Code Open/Cancel 外部网站提示；
7. Extension Host reload 或取消选择时不出现红色 `Canceled` 通知；
8. Tunnel Diagnostics 中 control plane 和 main channel 健康；
9. 在 ChatGPT 新对话启用 ReviewLume，完成一次真实只读项目检查；
10. ChatGPT 中性报告当前连接项目名，不把 ReviewLume 连接器名当作 repository 名；
11. 连续工具调用不出现 HTTP 500；
12. 停止后旧本地 endpoint/Token 不可用且无残留 tunnel-client 进程；
13. 使用假数据 fixture 验证 `.env` 等敏感命名文本文件不会被 P9 自动拦截，并确认 UI/文档警告准确；
14. 使用 P8 Advanced Review Pack 验证其 SecretScanner 仍独立工作。

## 10. 截图要求

截图应使用专门的公开测试 repository，并满足：

- 不显示 Runtime API Key、本地 MCP Token、Tunnel ID、Authorization Header；
- 不显示 Microsoft/OpenAI/GitHub 账号邮箱或浏览器个人资料；
- 不显示真实私有路径、客户名称、生产地址或不可公开源码；
- 工具调用和结果使用合成数据；
- PNG，建议 1280×720 或更高；
- 上传前再次人工检查原图，而不是只检查缩略图。

建议截图列表见 [Marketplace Listing](marketplace-listing.md)。

## 11. 合并与发布门禁

只有全部满足后才能合并和发布：

- PR 不再是 Draft；
- 最新 head 的四平台 CI 全绿；
- 完成 MCP、凭据、路径、Git、子进程、代理、浏览器和生命周期代码复核；
- 没有未处理的高风险问题；
- 用户完成真实 Windows + ChatGPT 人工验收；
- README、Marketplace README、Changelog、P9 计划、验收清单、隐私政策、安全政策、配置指南和发布指南与代码一致；
- Marketplace Publisher ID、版本号和 release notes 已确认；
- 公开页面没有“自动拦截所有秘密”等虚假承诺；
- 发布候选明确标注 OpenAI 和 ChatGPT 是第三方服务；
- GitHub prerelease 与 Marketplace 使用同一字节级 VSIX。

## 12. 版本策略

当前首个公开候选为 `0.2.0` Preview，表示连接器、ChatGPT 权限和外部 Tunnel 依赖仍可能变化。

建议：

- `0.2.x`：只读 MCP、Secure Tunnel、稳定性、连接管理和跨平台体验增强；
- `0.3.x`：根据公开预览反馈收口安装、诊断和大型仓库性能；
- `1.0.0`：协议、隐私政策、安全边界、安装流程和兼容性达到稳定承诺。

每次版本升级必须同步：

- `apps/vscode-extension/package.json`；
- VSIX 输出文件名；
- manifest 测试；
- Changelog；
- P9 人工验收基线；
- PR/release artifact SHA-256。

## 13. GitHub Prerelease 与 Marketplace 上传

先在 GitHub 创建 `v0.2.0` prerelease，并附上最终 VSIX 与 SHA-256。人工确认后，在 Publisher 管理页面选择：

```text
ReviewLume
  → New extension
  → Visual Studio Code
  → Upload reviewlume-vscode-0.2.0.vsix
```

上传后检查 Marketplace 解析出的：

- Publisher：`ReviewLume`；
- Extension ID：`ReviewLume.reviewlume-vscode`；
- Version：`0.2.0`；
- Preview 标识；
- Free 标识；
- 图标、README、隐私链接和安全链接；
- Supported VS Code version；
- repository、issues 和 license 链接。

在 Marketplace 完成扫描并公开后，再从一个未安装本地 VSIX 的 VS Code 环境搜索并安装商店版本，完成最终安装验证。
