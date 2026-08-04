# 发布指南

## 1. 产品与品牌

正式名称：ReviewLume

Marketplace 展示名称：

> ReviewLume – Secure Read-only Repository MCP

Marketplace 简短描述：

> Connect ChatGPT to one VS Code Git repository through bounded, read-only MCP tools, with optional user-approved local verification.

Marketplace 页面必须声明 ReviewLume 是独立开源项目，不隶属于或获得 OpenAI、Microsoft、Anthropic、Google 等服务商背书。不得使用第三方 Logo，不得宣传“官方 ChatGPT 插件”“自动保护所有秘密”或“绕过额度”。

完整文案见 [Marketplace Listing](marketplace-listing.md)。

## 2. 当前发布形态

VS Code 扩展是唯一主发布物。主连接流程：

```text
VS Code selected Git repository
  → ReviewLume loopback read-only MCP
  → official openai/tunnel-client
  → OpenAI Secure MCP Tunnel
  → user-enabled ChatGPT app / connector
```

0.3.1 Preview 的可选本地验证流程：

```text
Trusted VS Code workspace
  → user-approved fixed repository/package rules
  → no-shell local process execution
  → bounded sanitized evidence in extension storage
  → two read-only MCP evidence tools
```

ChatGPT 不能启动、重试、修改或拼接本地验证命令。旧浏览器输入框桥接原型不作为当前产品能力发布或宣传。P8 Review Pack、历史、导入回答和二次复核继续作为 Advanced 本地能力。

## 3. Marketplace 身份与版本

- Publisher name：`ReviewLume`
- Publisher ID：`ReviewLume`
- Extension name：`reviewlume-vscode`
- 完整扩展 ID：`ReviewLume.reviewlume-vscode`
- 当前候选版本：`0.3.1`
- Marketplace channel：Preview
- Pricing：Free

`apps/vscode-extension/package.json` 必须与以上标识一致。

## 4. package.json 发布检查

发布前确认：

- `publisher` 精确等于 `ReviewLume`；
- `version` 等于 `0.3.1`；
- VSIX 文件名为 `reviewlume-vscode-0.3.1.vsix`；
- `preview: true`、`pricing: "Free"`；
- repository、icon、VS Code engine 和 NLS 正确；
- manifest 不定义 Runtime API Key、Token 或 Secret 设置；
- manifest 不注册旧浏览器桥接命令或重复 Activity Bar；
- `onStartupFinished` 不主动启动 tunnel、运行验证或读取 repository；
- Changelog、Marketplace 文案和验收清单使用同一版本。

## 5. Marketplace 页面必须包含

- 一次连接只绑定一个 Git repository；
- 7 个 repository 读取工具和 2 个已完成验证证据工具；
- 9 个工具均为 read-only / non-destructive / idempotent / closed-world；
- `verification_status` 与 `read_verification_output` 明确 `mcpCanStartProcesses: false`；
- 不提供 MCP shell、process-start、写文件、删除、补丁或 Git mutation；
- OpenAI Secure MCP Tunnel 依赖和首次配置说明；
- ChatGPT 自定义应用/连接器资格由 OpenAI 当前账户和工作空间控制；
- Runtime API Key 只保存在 VS Code SecretStorage；
- 无 telemetry；
- 隐私政策、安全政策、第三方免责声明、支持平台和已知限制；
- 不含真实密钥、Token、私有路径、账户信息或不可公开源码的截图。

### MCP 隐私限制

必须公开：

- MCP 不自动运行 SecretScanner；
- `.env`、credentials、secrets、私钥文本、生产配置和 tracked 敏感文件不会仅因名称被阻止；
- `read_file` 可以读取 repository 内明确指定的普通文本文件，包括已忽略文件；
- diff、文件摘录、提交标题、搜索结果、测试目标和验证输出可能包含敏感信息；
- `.gitignore` 不是完整保密边界；
- P8 SecretScanner 不自动保护 MCP 工具调用或验证输出；
- 验证输出脱敏是 best-effort。

### 本地验证安全限制

必须说明：

- 仅 Trusted Workspace 可配置和运行；
- 用户批准固定 executable、argv、repository-relative working directory、目标模式和 timeout；
- 支持 bounded nested package roots，如 `server/`、`client/`、`packages/*`；
- 支持 repository-local 或依赖提升但仍位于 repository 内的 Vitest、Jest、Mocha、Node test 和 TypeScript runner；
- changed tests 只传给所属 package runner，并转换为 package-relative argv；
- 不运行任意 package script、`npx`、下载 runner、AI 回复、repository 文档或测试输出中的命令；
- 使用 `spawn(executable, argv)` 与 `shell: false`；
- approval 绑定 canonical repository、package cwd、配置、lockfile 和 runner 内容；
- 0.3.0 的 schema-1 approval 在 0.3.1 中必须失效并重新批准；
- 测试代码是不可信可执行输入，本地验证不是 sandbox；
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

最终候选必须确认：

- 文件名 `reviewlume-vscode-0.3.1.vsix`；
- manifest 的 publisher、name、version、preview 和 pricing 正确；
- 不含 `.env`、测试密钥、Runtime API Key、本地 MCP Token 或 Authorization Header；
- 不含用户 repository 内容、测试 fixture、TypeScript 源码、测试、source map 或声明文件；
- 包含本地验证所需编译后 runtime，包括 approval、discovery、workspace、execution、core 和 service 模块；
- 不包含第三方 `tunnel-client` 可执行文件；
- `shell:false`、工作目录边界、包根目录扫描限制和旧 approval schema 失效逻辑进入最终包；
- SHA-256 记录在 PR 和发布记录；
- GitHub prerelease 与 Marketplace 使用同一字节级 VSIX。

## 8. Windows 人工验收

完整清单见 [Local Verification Acceptance](local-verification-acceptance.md)。0.3.1 必须重点验证：

1. 0.3.0 approval 升级后失效；
2. `server/client/packages/*` runner 被发现；
3. picker 显示 package cwd；
4. nested tests 使用 package-relative argv，且不混入其他 package 测试；
5. package-local 与 repository-hoisted runner 均正确；
6. syntax-only 警告不声称执行测试代码；
7. tests/typecheck 警告明确代码执行风险；
8. 弹窗只有一个本地化取消按钮；
9. 新增测试自动纳入；
10. 配置、lockfile、runner 或 cwd 变化使 approval 失效；
11. 失败、zero-test、取消、timeout、stale、清除授权行为正确；
12. ChatGPT 看到 9 个只读工具且不能启动进程。

未执行的人工项目必须如实记录，不得伪造为通过。

## 9. 合并与发布门禁

- PR 非 Draft；
- 最新 head 四平台 CI 全绿；
- 完成路径、Git、子进程、配置指纹、package discovery、MCP 和生命周期复核；
- 无未处理高风险问题；
- 文档、manifest、Marketplace 文案和代码一致；
- Windows 人工验收完成并记录；
- 版本、release notes、Publisher ID 和最终 VSIX SHA-256 已确认；
- Marketplace 与其他发布渠道使用相同 VSIX。

不得因为发布压力删除安全限制、隐瞒未执行验收或声称未验证内容已完成。

## 10. 版本策略

- `0.2.x`：初始只读 MCP 与 Secure Tunnel Preview；
- `0.3.x`：用户授权本地验证、monorepo 兼容、连接诊断和 Preview 反馈收口；
- `1.0.0`：协议、隐私政策、安全边界、安装流程和兼容性达到稳定承诺。

## 11. GitHub Prerelease 与 Marketplace 上传

为 0.3.1 创建 `v0.3.1` prerelease，并上传最终 VSIX 与 SHA-256。然后使用 ReviewLume Publisher 更新现有扩展：

```text
ReviewLume
  → ReviewLume extension
  → Update
  → Upload reviewlume-vscode-0.3.1.vsix
```

上传后核对 Publisher、Extension ID、Version `0.3.1`、Preview、Free、README、隐私、安全、repository、issues、license，以及 nested local verification 的准确说明。Marketplace 完成扫描后，再从商店安装版本完成 smoke test。
