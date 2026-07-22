# 测试与验收

## 1. 测试分层

### 1.1 单元测试

P9 重点覆盖：

- MCP initialize、tools/list 和 tools/call；
- 7 个工具的 schema 和只读 annotations；
- repository 身份与 ReviewLume 连接器名称区分；
- Git 参数构造、allowlist、commit ref 和 remote URL 脱敏；
- 绝对路径、盘符、UNC、`..`、`.git` 和 NUL 拒绝；
- realpath、symlink、目录、二进制和文件大小边界；
- diff、文件读取和搜索预算；
- Bearer 与 `X-ReviewLume-Token` 鉴权；
- Origin、Content-Type、请求体和速率限制；
- Tunnel ID、官方客户端帮助文本和受控环境变量；
- doctor 输出脱敏和 health URL 校验；
- 浏览器偏好与 Windows/macOS/Linux 原生启动命令；
- 用户取消与 operational error 区分；
- OutputChannel 失败不影响 tools/call。

P8 Advanced 重点覆盖：

- Git 范围与 repository 选择；
- 文件选择、ignore、realpath 和 symlink；
- SecretScanner HARD_BLOCK/BLOCK/WARN/INFO；
- Review Pack 序列化、预算和导出；
- `workspaceId`、`reviewId` 和冲突重试；
- 历史、回答导入、报告解析和原子写入；
- issue 状态机、筛选、实施提示、修复摘要和二次复核。

### 1.2 集成测试

使用临时 Git repository 覆盖：

- staged、unstaged、untracked 和 commit range；
- 单根和多根工作区；
- repository root discovery；
- 中文、空格和特殊路径；
- symlink 逃逸；
- tracked 与 non-ignored untracked 枚举；
- ignored 文件不会被普通枚举，但明确路径的普通文本文件可由 `read_file` 读取；
- `.env`、credentials、secrets 等敏感命名文本文件不会被 P9 自动拒绝；
- P8 Advanced SecretScanner 仍对 Review Pack 流程执行原有门禁；
- MCP server 启停后旧端口和 Token 失效；
- tunnel-client 环境不继承不允许的 Admin Key、raw logging 或远程 UI 配置。

所有隐私边界测试只能使用假密钥和虚构数据，不得提交真实凭据。

### 1.3 VSIX 内容测试

直接把生成的 VSIX 作为 ZIP 检查：

- manifest 版本、publisher、activation events 和命令；
- README、LICENSE、图标和 NLS；
- 必需 `dist` 与依赖；
- 不包含 TypeScript 源码、编译测试、source map 或 `*.tsbuildinfo`；
- 不包含 `.env`、测试密钥、Runtime API Key、本地 MCP Token、Authorization Header；
- 不包含 `.reviewlume/` 历史、用户 repository 内容或本地绝对路径；
- 不捆绑 `tunnel-client`；
- 不包含已停用浏览器桥接运行时；
- 记录 SHA-256。

## 2. P9 安全测试

### 2.1 MCP 网络与鉴权

必须覆盖：

- 仅绑定 `127.0.0.1`；
- 随机端口和每次启动新 Token；
- 无凭据 GET `/mcp` 返回 405，不泄露工具和 repository；
- 无凭据或错误 Token 的 POST/DELETE 返回 401；
- 错误 Origin、Content-Type、协议版本和超大请求被拒绝；
- rate limit 生效；
- Protected Resource Metadata 只暴露 loopback resource；
- 停止后旧 endpoint 不可用。

### 2.2 Repository、路径和 Git

必须覆盖：

- 一次连接一个 repository；
- Restricted Mode 拒绝启动；
- 多根工作区明确选择；
- 绝对路径、盘符、UNC、`..`、`.git` 和 NUL；
- 外部 symlink；
- 目录、二进制和超大文件；
- 非法 commit ref；
- external diff/textconv 禁用；
- Git mutation 命令不存在；
- remote URL 用户名和密码不会返回。

### 2.3 实际隐私边界

使用假数据验证并记录：

- P9 不运行 SecretScanner；
- `.env`、credentials、secrets、私钥或生产配置式文件名不会仅因名称被拒绝；
- tracked 敏感命名文件可进入 `list_files` 和 `search_code` 候选；
- ignored 文件不进入普通枚举；
- 调用方知道路径时，ignored 普通文本文件仍可由 `read_file` 读取；
- diff、文件摘录、提交标题和搜索结果中的假秘密不会被宣传为自动脱敏；
- 结果大小和行数预算仍生效；
- ReviewLume 日志不记录查询词、文件正文、diff 或搜索结果；
- README、PRIVACY、SECURITY 和 Marketplace 文案准确说明这些限制。

### 2.4 Tunnel 和凭据

必须覆盖：

- 只接受符合官方帮助文本的 `tunnel-client`；
- Tunnel ID 格式；
- Runtime API Key 只存 SecretStorage；
- Key 和 Token 不进入 argv、settings JSON、repository、剪贴板或日志；
- ambient Tunnel profile、MCP command、Admin Key、Cloudflared、Harpoon、远程 UI、日志文件和 raw HTTP logging 被清除；
- 只传入允许的控制面代理；
- doctor 失败不启动长期进程；
- `/readyz` 与 `/api/status` 同时健康才报告 ready；
- Tunnel ID 不匹配、metadata error 或 main channel 不健康时失败；
- diagnostics UI 只监听 loopback。

## 3. P8 Advanced 安全测试

P8 Advanced 仍必须覆盖：

- HARD_BLOCK 永远不能导出；
- BLOCK 必须排除或脱敏后重新扫描；
- WARN 逐项确认；
- 关闭可选扫描设置不能绕过 HARD_BLOCK；
- `blockOnHighRisk` 不能放行 BLOCK/HARD_BLOCK；
- 范围或内容改变后旧扫描失效；
- Review Pack 预览与最终导出一致；
- 历史写入和删除只在管理目录内；
- AI 回答中的命令、路径和补丁不被执行；
- P8 SecretScanner 不被错误复用于或宣传为 P9 MCP 保护层。

## 4. 四平台 CI

每个发布候选必须在以下矩阵通过：

- Ubuntu Node 20；
- Ubuntu Node 22；
- Windows Node 22；
- macOS Node 22。

每个平台步骤：

1. checkout；
2. pnpm setup；
3. Node setup；
4. frozen-lockfile install；
5. lint；
6. typecheck；
7. test；
8. 遗留浏览器扩展静态校验；
9. build；
10. VSIX package；
11. artifact upload；
12. VSIX contents validation。

失败时必须读取具体 job log，区分代码、测试、环境、外部服务和权限原因。

## 5. Windows + ChatGPT 人工验收

### 5.1 安装和启动

- [ ] 覆盖安装最终候选 VSIX。
- [ ] 完全退出并重新启动 VS Code。
- [ ] 状态栏出现 `ReviewLume MCP`，左侧无重复主入口。
- [ ] 启动阶段不自动联网、不打开网页、不读取 repository。

### 5.2 首次配置

- [ ] 使用 OpenAI Platform Tunnel。
- [ ] 使用最小权限 Runtime API Key，而非 Admin Key。
- [ ] 选择官方 `tunnel-client`。
- [ ] Runtime Key 不出现在 settings、repository、命令行或日志。
- [ ] 代理发现和持久化正常。

### 5.3 浏览器和 Tunnel

- [ ] 系统默认浏览器直接打开 ChatGPT，不出现 Open/Cancel。
- [ ] Edge/Chrome 不改变操作系统默认浏览器。
- [ ] `/readyz` 和 `/api/status` 健康后才显示 ready。
- [ ] Apps/Connectors 设置只由 Advanced 动作显式打开。
- [ ] Extension Host reload 或取消不显示误导性的 `Canceled` 错误。

### 5.4 ChatGPT 工具

- [ ] 创建或启用 ReviewLume 自定义应用/连接器。
- [ ] 扫描到 7 个只读工具。
- [ ] 不存在 write、delete、shell、terminal、patch 或 Git mutation。
- [ ] ChatGPT 中性报告当前项目名，不把 ReviewLume 当作 repository 名。
- [ ] 最近提交、Git 状态、diff、源码和测试检查可完成。
- [ ] 连续 tools/call 不出现 HTTP 500。
- [ ] 工具定义变化后可通过刷新、重新扫描或重建应用更新。

### 5.5 隐私和停止

- [ ] 使用假 `.env` fixture 验证 P9 不自动拦截，公开警告准确。
- [ ] 使用 P8 Advanced fixture 验证 SecretScanner 仍独立生效。
- [ ] 停止连接后旧 endpoint/Token 失效。
- [ ] 无残留 `tunnel-client` 进程。
- [ ] 可在 OpenAI Platform 撤销 Runtime Key 或删除 Tunnel。
- [ ] 可在 ChatGPT 禁用或删除 ReviewLume 应用。

## 6. 发布门禁

只有全部满足后才能发布：

- 最新发布候选的四平台 CI 全绿；
- VSIX 内容检查全绿；
- Windows + ChatGPT 人工验收完成；
- README、PRIVACY、SECURITY、配置指南、P9 计划、验收清单和发布指南与代码一致；
- P9 不自动秘密扫描的限制已公开；
- Marketplace Publisher ID 和版本号已确认；
- 没有未处理的高风险问题；
- GitHub prerelease 与 Marketplace 使用同一字节级 VSIX；
- release notes 记录 commit、版本、支持范围、已知限制和 SHA-256。