# 发布指南

## 1. 产品与品牌

正式名称：ReviewLume

Marketplace 展示名称：

> ReviewLume – Secure Read-only Repository MCP

Marketplace 简短描述：

> Connect ChatGPT to one VS Code Git repository through bounded, read-only MCP tools, with optional user-approved local verification.

Marketplace 页面必须明确：

> ReviewLume is an independent open-source project and is not affiliated with or endorsed by OpenAI, Microsoft, Anthropic, Google, or other service providers.

不得使用第三方服务商 Logo 作为插件图标，也不得使用“官方 ChatGPT 插件”“自动保护所有秘密”“绕过额度”等描述。

完整可复制文案见 [Marketplace Listing](marketplace-listing.md)。

## 2. 当前发布形态

VS Code 扩展是唯一主发布物。主连接流程为：

```text
VS Code selected Git repository
  → ReviewLume loopback read-only MCP
  → official openai/tunnel-client
  → OpenAI Secure MCP Tunnel
  → user-enabled ChatGPT app / connector
```

0.3.0 Preview 新增可选本地验证：

```text
Trusted VS Code workspace
  → user-approved fixed repository-local rules
  → no-shell local process execution
  → bounded sanitized evidence in extension storage
  → two read-only MCP evidence tools
```

ChatGPT 不能启动、重试、修改或拼接本地验证命令。旧浏览器输入框桥接原型不作为当前产品能力发布或宣传。

P8 Review Pack、历史、导入回答和二次复核继续保留为 Advanced 本地能力。

## 3. Marketplace 身份与版本

- Publisher name：`ReviewLume`
- Publisher ID：`ReviewLume`
- Extension name：`reviewlume-vscode`
- 完整扩展 ID：`ReviewLume.reviewlume-vscode`
- 当前公开候选版本：`0.3.0`
- Marketplace channel：Preview
- Pricing：Free

`apps/vscode-extension/package.json` 必须与以上标识完全一致。

## 4. package.json 发布检查

发布前确认：

- `name`、`displayName`、`description` 与当前产品定位一致；
- `publisher` 精确等于 `ReviewLume`；
- `version` 等于 `0.3.0`，并与 VSIX 文件名、Changelog 和验收文档一致；
- `preview: true`；
- `pricing: "Free"`；
- `repository` 指向公开仓库；
- `icon` 为 ReviewLume 自有资源；
- `engines.vscode` 与实际测试版本兼容；
- manifest 不定义 Runtime API Key、Token 或 Secret 设置；
- manifest 不注册旧浏览器桥接命令或重复 Activity Bar；
- `onStartupFinished` 不主动启动 tunnel、运行验证或读取 repository；
- 本地验证命令和设置已提供中英文 NLS。

## 5. Marketplace 页面必须包含

- 一次连接只绑定一个 Git repository；
- 7 个 repository 读取工具和 2 个已完成验证证据工具；
- 9 个工具均为 read-only / non-destructive / idempotent / closed-world；
- `verification_status` 与 `read_verification_output` 明确 `mcpCanStartProcesses: false`；
- 不提供 MCP shell、process-start、写文件、删除、补丁或 Git mutation；
- OpenAI Secure MCP Tunnel 依赖和首次配置说明；
- ChatGPT 账户或工作空间必须实际具备自定义 MCP 应用/连接器入口；
- Runtime API Key 只保存在 VS Code SecretStorage；
- 无 telemetry；
- 隐私政策、安全政策、第三方免责声明、支持平台和已知限制；
- 至少一张不包含真实密钥、Token、私有路径、账户信息或不可公开源码的截图。

### MCP 隐私限制

Marketplace 页面必须直接说明：

- MCP 不自动运行 SecretScanner；
- `.env`、credentials、secrets、私钥文本、生产配置和 tracked 敏感文件不会因名称自动阻止；
- `read_file` 可以读取 repository 内明确指定的普通文本文件，包括已忽略文件；
- diff、文件摘录、提交标题、搜索结果、测试目标和验证输出可能包含敏感信息；
- `.gitignore` 不是完整保密边界；
- P8 SecretScanner 不自动保护 MCP 工具调用或验证输出；
- 验证输出脱敏是 best-effort，不保证识别所有秘密或个人信息。

不得声称“所有敏感文件都会自动拦截”“代码永远不会离开本机”或“SecretScanner 会过滤所有 ChatGPT 工具结果”。

### 本地验证安全限制

必须说明：

- 仅 Trusted Workspace 可配置和运行；
- 用户先批准固定 executable、argv、目标模式和 timeout；
- 支持 repository-local Vitest、Jest、Mocha、Node test、TypeScript `tsc --noEmit` 和逐文件 `node --check`；
- 不运行任意 package script、`npx`、下载的 runner、AI 回复、repository 文档或测试输出中的命令；
- 使用 `spawn(executable, argv)` 与 `shell: false`；
- approval 绑定 canonical repository、配置、lockfile 和 repository-local runner 内容；
- 测试代码是可执行的不可信输入，本地验证不是 sandbox；
- 测试可能修改文件、启动子进程、访问网络或本地服务；
- ChatGPT 只能读取已完成证据，不能启动进程。

## 6. 发布前自动检查

```bash
pnpm install --frozen-lockfile
pnpm lint
pnpm typecheck
pnpm test
pnpm validate:browser-extension
pnpm build
pnpm package:vscode
pnpm --filter reviewlume-vscode verify:package-contents
```

GitHub Actions 必须在以下矩阵全部通过：

- Windows Node 22；
- Ubuntu Node 20；
- Ubuntu Node 22；
- macOS Node 22。

每个平台必须通过依赖安装、lint、TypeScript、测试、浏览器扩展静态校验、构建、VSIX 打包、artifact 上传和 VSIX 内容校验。

## 7. VSIX 内容检查

发布候选必须确认：

- 文件名为 `reviewlume-vscode-0.3.0.vsix`；
- 内部 manifest 的 publisher、name、version、preview 和 pricing 正确；
- 不包含 `.env`、测试密钥、Runtime API Key、本地 MCP Token 或 Authorization Header；
- 不包含用户 repository 内容、测试 fixture、TypeScript 源码、测试、源映射或声明文件；
- 包含本地验证所需的编译后 runtime 模块；
- 不包含第三方 `tunnel-client` 可执行文件；
- Marketplace README、PRIVACY.md、SECURITY.md 与实际边界一致；
- SHA-256 已记录在 PR、GitHub prerelease 和最终发布记录；
- GitHub prerelease 与 Marketplace 使用同一字节级 VSIX。

## 8. Windows 人工验收

涉及 VS Code UI、真实本地代码执行和 ChatGPT 的发布候选，正常发布门禁要求在 Windows 验证：

1. 全新安装或覆盖安装最终 VSIX；
2. 完全退出并正常启动 VS Code；
3. 状态栏和菜单正常，无重复入口；
4. Trusted Workspace 中配置固定验证规则并核对批准信息；
5. 新增或修改匹配测试会自动纳入；
6. 真实通过、失败、零测试、取消、timeout、stale 和清除授权行为符合文档；
7. 修改 runner、配置或 lockfile 后旧授权失效；
8. 测试输出限长和脱敏提示准确；
9. ChatGPT 扫描到 9 个只读工具，且不能启动进程；
10. 连接、浏览器启动、Tunnel 健康、连续工具调用和停止清理正常；
11. P8 Advanced Review Pack 的 SecretScanner 仍独立工作。

完整清单见 [Local Verification Acceptance](local-verification-acceptance.md)。未执行的人工项目必须在发布记录中如实标明，不得伪造为已验收。

## 9. 合并与发布门禁

标准门禁：

- PR 不再是 Draft；
- 最新 head 四平台 CI 全绿；
- 完成 MCP、凭据、路径、Git、子进程、代理、浏览器和生命周期代码复核；
- 没有未处理高风险问题；
- 文档、manifest、Marketplace 文案和代码一致；
- 版本、release notes、Publisher ID 和最终 VSIX SHA-256 已确认；
- GitHub prerelease 与 Marketplace 使用相同 VSIX；
- Windows 人工验收结果如实记录。

不得因为发布压力删除安全限制、隐瞒未执行的验收项目或声称未验证内容已经完成。

## 10. 版本策略

- `0.2.x`：初始只读 MCP 与 Secure Tunnel Preview；
- `0.3.x`：用户授权本地验证、连接诊断和 Preview 反馈收口；
- `1.0.0`：协议、隐私政策、安全边界、安装流程和兼容性达到稳定承诺。

每次升级必须同步 package manifest、VSIX 文件名、测试、Changelog、Marketplace 文案、人工验收基线和 release artifact SHA-256。

## 11. GitHub Prerelease 与 Marketplace 上传

为 0.3.0 创建 `v0.3.0` GitHub prerelease，附上最终 VSIX 与 SHA-256。然后使用 ReviewLume Publisher 凭据上传完全相同的文件：

```text
ReviewLume
  → New extension / Update
  → Visual Studio Code
  → Upload reviewlume-vscode-0.3.0.vsix
```

上传后核对：

- Publisher：`ReviewLume`；
- Extension ID：`ReviewLume.reviewlume-vscode`；
- Version：`0.3.0`；
- Preview、Free、图标、README、隐私和安全链接；
- Supported VS Code version、repository、issues 和 license；
- 页面明确说明 9 个只读工具和可选用户授权本地验证；
- 不存在“ChatGPT 可运行命令”或“自动拦截所有秘密”等错误描述。

Marketplace 完成扫描并公开后，再从未安装本地 VSIX 的 VS Code 环境搜索并安装商店版本，完成最终安装验证。
