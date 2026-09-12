# 发布指南

## 1. 产品与品牌

正式名称：ReviewLume

Marketplace 建议标题：

> ReviewLume – Secure Read-only Project MCP

ReviewLume 是独立开源项目，与 OpenAI、Microsoft、Anthropic、Google 或其他服务商没有隶属或背书关系。不得使用第三方服务商 Logo 作为插件图标，也不得使用“官方 ChatGPT 插件”“自动保护所有秘密”“绕过额度”等描述。

## 2. 当前发布边界

当前仍属于 **P8 二次复核闭环**。0.3.3 发布内容包括：

- direct Git Project；
- Folder Project；
- Git / Folder 共用稳定 11-tool 只读 MCP contract；
- direct Git Project 的用户授权 Local Verification；
- 0.3.1 已有的 nested package runner / schema-2 approval 修复；
- P8 Advanced Review Pack / history / response import / issue state / re-review。

**不包括**可选浏览器桥接；不得把它描述成当前发布能力。

主连接链路：

```text
VS Code selected Project Root
  → ReviewLume loopback read-only MCP
  → official openai/tunnel-client
  → OpenAI Secure MCP Tunnel
  → user-enabled ChatGPT app / connector
```

Local Verification 仅限 direct Git Project：

```text
Trusted direct Git Project
  → user-approved fixed rule
  → bounded package-root discovery
  → no-shell local process execution
  → bounded sanitized evidence in extension storage
  → read-only MCP evidence tools
```

ChatGPT 不能启动、重试、修改或拼接 Local Verification 命令。

## 3. Marketplace 身份与版本

- Publisher：`ReviewLume`
- Extension name：`reviewlume-vscode`
- Extension ID：`ReviewLume.reviewlume-vscode`
- 当前发布候选版本：`0.3.3`
- Channel：Preview
- Pricing：Free

`apps/vscode-extension/package.json`、VSIX 文件名、manifest 测试、release note 和最终发布记录必须全部一致为 0.3.3。

## 4. 稳定 MCP 工具契约

Git Project 与 Folder Project 必须都声明同样 11 个工具：

```text
project_summary
list_git_repositories
repository_summary
git_status
recent_commits
get_diff
list_files
read_file
search_code
verification_status
read_verification_output
```

Git mode：Git query 直接针对当前 Git root，`repository` selector 省略；verification evidence 只读已完成结果。

Folder mode：`list_git_repositories` 有界发现授权 Folder root 下的真实 child repositories；四个 Git query 必须选一个 discovery 结果。verification 两个工具名仍存在，但调用返回 unavailable，不启动进程、不返回 child evidence。

正常 Git ↔ Folder 切换不得改变公开工具 schema；仅当未来版本真的改变稳定 public contract 时才需要 ChatGPT Refresh / Scan Tools。

## 5. Local Verification 发布检查

0.3.3 必须包含 0.3.1 的 nested-runner 安全边界：

- `PLAN_SCHEMA_VERSION = 2`；
- package rule 有 repository-relative `workingDirectory`；
- 最多 2,500 个目录、深度 5、最多 64 个 package roots；
- 跳过 `.git`、`node_modules`、build/dist/coverage/cache/target/vendor 等目录；
- 不遍历目录 symlink/junction-like entries；
- 支持 package-local 或 repository-hoisted Vitest/Jest/Mocha/TypeScript runner；
- Node test 仅在 package 配置明确引用时启用；
- changed tests 过滤到对应 package 并以 package-relative argv 传入；
- `spawn(executable, argv)` / `shell: false`；
- 不运行 package script、`npx`、下载 runner、AI 回复、项目文档、测试输出或任意命令；
- syntax-only 与 test/typecheck approval warning 准确；
- 不出现重复显式英文 Cancel action。

## 6. 发布前自动检查

最终 head 必须运行并通过：

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

GitHub Actions 矩阵必须全绿：

- Windows / Node 22；
- Ubuntu / Node 20；
- Ubuntu / Node 22；
- macOS / Node 22。

每个平台必须通过 install、lint、typecheck、tests、browser-extension validation、build、VSIX package、artifact upload、VSIX content validation。

## 7. VSIX 内容审计

最终候选必须确认：

- 文件名 `reviewlume-vscode-0.3.3.vsix`；
- manifest 是 `ReviewLume.reviewlume-vscode` / `0.3.3` / Preview / Free；
- 不包含 `.env`、Runtime API Key、本地 MCP token、Authorization header 或用户项目内容；
- 不包含 TypeScript 源码、测试、source map、声明文件或旧 browser bridge runtime；
- 包含 MCP Folder/Git runtime 和 Local Verification schema-2/nested-runner runtime；
- Marketplace README、PRIVACY、SECURITY 与真实 runtime 一致；
- 记录 VSIX size 和 SHA-256。

## 8. Windows 人工验收

最终合并/正式发布门禁要求安装**最终 0.3.3 VSIX**并至少完成：

1. 覆盖安装后完全重启 VS Code；
2. direct Git Project 连接正常；
3. nested package runner 能被发现，cwd/argv 正确；
4. repository-hoisted runner 场景正常；
5. 其他 package 的 test 不会混入当前 runner；
6. schema-1 旧 approval 会失效；
7. syntax-only / test-typecheck warning 与 Cancel UI 正确；
8. stable 11 tools 正常；
9. Folder verification evidence calls 返回 unavailable 且不启动进程；
10. 同一个 ChatGPT app 在 Folder ↔ Git 切换后仍保持同一 11-tool contract；
11. 停止连接后 local endpoint / tunnel 不再可用。

完整记录见 [Local Verification Acceptance](local-verification-acceptance.md)。未执行项目必须如实标注，不能伪造已验收。

## 9. 0.3.2 已发布说明

0.3.2 已上传 Marketplace，但该包来自独立的 Folder Project 开发线，在发布时未包含此前 0.3.1 的 nested Local Verification runner 修复。

因此：

- 0.3.2 不作为后续源码基线；
- 0.3.3 必须同时包含 0.3.1 nested-runner fixes 与 0.3.2 Folder/stable-tool 功能；
- 0.3.3 最终包完成 CI、内容审计和 Windows smoke acceptance 后，用 0.3.3 覆盖发布。

## 10. 合并与发布门禁

正式收口要求：

- PR 不再是 Draft；
- final head 四平台 CI 全绿；
- 完成代码复核，无未处理高风险问题；
- VS Code UI / Local Verification 的最终 0.3.3 人工验收完成；
- 文档、manifest、Marketplace 文案和 runtime 一致；
- 最终 VSIX size/SHA-256 已记录；
- 版本号高于 Marketplace 当前版本；
- 合并 main 后从最终确认的发布 head/字节级一致 artifact 发布，不用旧 0.3.2 包重新上传。

不得因为发布压力删除安全限制或把未验证内容写成已验证。
