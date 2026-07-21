# 发布指南

## 1. 产品与品牌

正式名称：ReviewLume

推荐 Marketplace 名称：

> ReviewLume – Read-only ChatGPT Repository Connector

推荐描述：

> Connect one VS Code Git repository to ChatGPT through a privacy-aware, read-only MCP server and the official OpenAI Secure MCP Tunnel.

Marketplace 页面必须明确：

> ReviewLume is an independent open-source project and is not affiliated with or endorsed by OpenAI, Microsoft, Anthropic, Google, or other service providers.

不要使用第三方服务商 Logo 作为插件图标，也不要使用“官方 ChatGPT 插件”“绕过额度”等描述。

## 2. 当前发布形态

VS Code 扩展是唯一主发布物。P9 主流程为：

```text
VS Code selected Git repository
  → ReviewLume loopback read-only MCP
  → official openai/tunnel-client
  → OpenAI Secure MCP Tunnel
  → user-enabled ChatGPT connector
```

旧浏览器填入桥接原型不作为当前产品能力发布或宣传：

- 不注册浏览器桥接命令；
- 不贡献 activation events；
- 不要求用户安装浏览器扩展；
- 不读取网页输入、Cookie、Session 或回答。

P8 Review Pack、历史、导入回答和二次复核继续保留为 Advanced 本地能力。

## 3. package.json 发布检查

发布前确认：

- `name`、`displayName`、`description` 与当前只读 MCP 定位一致；
- `publisher` 对应实际拥有的 VS Code Marketplace Publisher ID；
- `version` 与 VSIX 文件名、Changelog、验收文档一致；
- `repository` 指向公开仓库；
- `icon` 为 ReviewLume 自有资源；
- `engines.vscode` 与实际测试版本兼容；
- manifest 不定义 Runtime API Key、Token 或 Secret 设置；
- manifest 不注册旧浏览器桥接命令或重复 Activity Bar；
- `onStartupFinished` 只初始化状态栏和命令，不主动联网或读取 repository。

当前 `publisher: reviewlume` 只有在维护者已创建并有权使用该 Publisher ID 时才能用于 Marketplace 发布。否则必须先改成实际 Publisher ID，并重新打包、测试和生成最终 VSIX。

## 4. Marketplace 页面必须包含

- 产品定位和只读能力说明；
- 一次连接只绑定一个 Git repository；
- 7 个 MCP 工具列表；
- 不提供 shell、写文件、补丁或 Git mutation 的声明；
- OpenAI Secure MCP Tunnel 依赖和首次配置说明；
- ChatGPT 中每个新对话需要启用 ReviewLume 连接器的已知限制；
- 数据流图和“何时数据离开本机”的说明；
- Runtime API Key 只保存在 VS Code SecretStorage 的说明；
- 敏感路径、SecretScanner 和“不能保证发现所有秘密”的限制；
- 无 telemetry 声明；
- [PRIVACY.md](../PRIVACY.md) 链接；
- [SECURITY.md](../SECURITY.md) 链接；
- 第三方服务免责声明；
- 支持平台、已知限制和排障方式；
- 至少一张不包含真实密钥、Token、私有路径或源码的截图。

## 5. 发布前自动检查

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

## 6. VSIX 内容检查

发布候选 VSIX 必须确认：

- 内部 `extension/package.json` 版本正确；
- 不包含 `.env`、测试密钥、Runtime API Key、本地 MCP Token 或 Authorization Header；
- 不包含本地缓存、`.reviewlume/` 历史或用户 repository 内容；
- 不包含测试 fixture、源映射、TypeScript 源码和私有文档；
- 只包含运行时需要的 `dist`、NLS、图标、README、LICENSE、package manifest 和必要依赖；
- 不包含可执行的第三方 `tunnel-client`，客户端必须由用户从官方 release 单独下载并明确选择；
- SHA-256 已记录在 PR 或 release notes 中。

## 7. 人工验收

涉及 VS Code UI、浏览器启动和真实 ChatGPT 的发布候选必须在 Windows 完成：

1. 全新安装或覆盖安装候选 VSIX；
2. 完全退出并正常启动 VS Code；
3. 确认底部状态栏自动出现且左侧无重复入口；
4. 确认代理自动发现/保存后可以普通方式启动 VS Code；
5. 确认浏览器选择、持久化和 ChatGPT 新对话入口正确；
6. Extension Host reload 或取消选择时不出现红色 `Canceled` 通知；
7. Tunnel Diagnostics 中 control plane 和 main channel 健康；
8. 在 ChatGPT 新对话启用 ReviewLume，完成一次真实只读项目检查；
9. 连续工具调用不出现 HTTP 500；
10. 停止后旧本地 endpoint/Token 不可用且无残留 tunnel-client 进程。

## 8. 合并与发布门禁

只有全部满足后才能合并和发布：

- PR 不再是 Draft；
- 最新 head 的四平台 CI 全绿；
- 完成 MCP、凭据、路径、Git、子进程、代理、浏览器和生命周期代码复核；
- 没有未处理的高风险问题；
- 用户完成真实 Windows + ChatGPT 人工验收；
- README、Changelog、P9 计划、验收清单、隐私政策、安全政策和发布指南与代码一致；
- Marketplace Publisher ID、版本号和 release notes 已确认。

## 9. 版本策略

当前 P9 首个公开候选可继续使用 `0.1.x` 预发布版本，表示接口和外部 Tunnel 依赖仍可能变化。

建议：

- `0.1.x`：只读 MCP 与 Secure Tunnel 公开预览；
- `0.2.x`：稳定性、连接管理和跨平台体验增强；
- `1.0.0`：协议、隐私政策、安全边界、安装流程和兼容性达到稳定承诺。

每次版本升级必须同步：

- `apps/vscode-extension/package.json`；
- VSIX 输出文件名；
- manifest 测试；
- Changelog；
- P9 人工验收基线；
- PR/release artifact SHA-256。

## 10. GitHub Release 与 Marketplace

可以先发布 GitHub prerelease 供人工验证，再在同一字节级 VSIX 通过 Marketplace 发布。不得在人工验收前把未经验证的 VSIX 标记为稳定版本。

Release notes 至少包含：

- 当前版本和 commit SHA；
- 支持的 VS Code/操作系统范围；
- OpenAI Tunnel 与 ChatGPT 连接器前置条件；
- 主要只读安全边界；
- 已知限制；
- VSIX SHA-256；
- 隐私政策和安全报告链接。
