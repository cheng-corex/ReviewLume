# P9 浏览器桥接实施计划

## 目标

在不读取浏览器凭据、不调用第三方 AI 内部接口、不自动发送消息、不扩大本地审核范围的前提下，为 ReviewLume 增加显式、可撤销的浏览器辅助桥接：用户主动选择目标站点后，由 VS Code 一键启动本地桥接并打开安全交接页；首次仅保留浏览器站点权限确认，之后自动配对并打开目标站点。回答仍由用户主动导入。

## 当前状态

| 阶段 | 状态 | 说明 |
|---|---|---|
| P9A 协议与安全模型 | 完成 | 严格 schema、摘要、nonce、expiry、重放和大小限制已实现并测试 |
| P9B 本地桥接服务 | 完成 | loopback 随机端口、配对、安全交接页、认证轮询、撤销和 CORS 限制已实现 |
| P9C VS Code 接入 | 完成 | 显式启动、按站点一键连接、撤销和提示队列命令已接入 |
| P9D Manifest V3 扩展 | 完成 | 最小权限、optional host permissions、片段交接、自动配对和轮询已实现 |
| P9E 页面适配器 | 首版完成 | ChatGPT、Claude、Gemini 适配器已实现，只填入不发送 |
| P9F 收口与验收 | 进行中 | 自动校验、README、CHANGELOG 和人工验收清单已完成；真实浏览器验收待执行 |

## 强制边界

- 不申请或读取 Cookie、Session、Token、浏览器密码、历史记录。
- 不调用第三方 AI 的内部接口，不绕过额度、权限或产品限制。
- 不自动点击发送，不自动采集回答，不在 AI 页面后台注入脚本。
- 所有桥接请求必须绑定已存在的 `reviewId`，浏览器端不得改变 repository、文件选择、diff、上下文范围或扫描结果。
- 本地服务仅监听 loopback 随机端口，不监听局域网地址。
- 配对码一次性、短时有效；会话令牌短时有效、可撤销，并绑定浏览器扩展实例。
- 一键交接只使用 `http://127.0.0.1:<随机端口>/connect`；配对码和目标站点放在 URL fragment 中，不进入 HTTP 请求、服务端日志或查询参数，扩展接收后立即清除 fragment。
- 待交接配对信息只保存在 `chrome.storage.session`，不跨浏览器会话持久化。
- optional host permissions 按站点单独请求，默认无任何 AI 站点访问权限；首次连接仍由用户确认浏览器权限。
- 页面适配器只定位公开可见的输入控件并填入文本；页面结构不匹配时安全失败。

## 分阶段实施

### P9A：协议与安全模型

- 建立 `packages/bridge-protocol`，定义严格 Zod schema。
- 定义 pairing、session、prompt-fill、health、revoke 消息。
- 定义 `reviewId`、request hash、nonce、expiry 和 replay protection。
- 增加协议解析、过期、重放、跨 reviewId 和大小限制测试。

### P9B：本地桥接服务

- 创建 `apps/web-bridge`，仅监听 `127.0.0.1` 随机端口。
- 使用系统 CSPRNG 生成一次性配对码和临时会话令牌。
- 采用最小 HTTP 接口；拒绝非 loopback Host 和非扩展跨源请求。
- 提供无脚本、禁止缓存、严格 CSP 的 `/connect` 交接页；交接密钥不得出现在服务端收到的 URL 中。
- 内存保存临时会话，不持久化令牌和页面内容。
- 同一浏览器扩展实例重新配对时使旧会话失效，并支持显式关闭与全部会话撤销。

### P9C：VS Code 扩展接入

- 新增启动/停止桥接、按站点一键连接、撤销和发送当前提示到已配对浏览器的命令。
- 状态栏直接提供 `Connect & Open ChatGPT`、`Connect & Open Claude`、`Connect & Open Gemini`。
- 一键连接自动启动桥接、生成一次性配对码并打开 fragment-only 本地交接 URL；不再复制配对码或要求手动输入端口。
- 只允许从现有历史或当前已生成 Review Pack 读取提示。
- 每次发送前显示 reviewId、目标站点和字符数确认；不包含绝对路径与凭据。
- 不改变现有手动复制、导出和回答导入流程。

### P9D：Manifest V3 浏览器扩展

- 创建独立浏览器扩展目录，使用 Manifest V3。
- 默认权限仅限 storage/activeTab/scripting/alarms；AI 站点权限全部 optional。
- 仅在 loopback `/connect` 页面加载交接 content script；不在 AI 页面常驻注入。
- content script 校验来源、读取 URL fragment、立即清除 fragment，并把数据交给 background service worker。
- background 将待交接信息保存在 `chrome.storage.session`，打开扩展自身的权限确认页。
- 首次由用户点击权限确认按钮；已有站点权限时自动完成配对并打开目标站点。
- 浏览器弹窗保留手动恢复配对入口，但不再作为推荐主流程。

### P9E：页面适配器

- 定义站点无关适配器接口：`detect`、`locateComposer`、`fillPrompt`。
- 首批仅实现显式批准的公开页面适配器。
- 只写入输入框并触发必要的标准 input/change 事件；绝不触发提交。
- 页面版本不支持、多个候选输入框或编辑器不可确认时停止并提示用户。

### P9F：收口与验收

- 四平台运行 lint、类型检查、测试、构建和 VSIX 打包。
- 浏览器扩展执行 manifest、引用文件、JavaScript 语法、禁止自动发送和禁止凭据读取校验。
- 人工验收：一键配对、首次权限请求、已有权限自动重连、填入但不发送、撤销、过期、错误站点、重启恢复边界。
- 同步架构、安全、任务清单、README、CHANGELOG 和隐私说明。

真实浏览器步骤见 [P9 浏览器桥接人工验收清单](p9-browser-bridge-verification.md)。

## 验收标准

1. 未配对时浏览器与本地桥接均无法读取提示。
2. 配对码只能使用一次，过期或重放均被拒绝。
3. 服务只监听 loopback 随机端口，外部主机无法连接。
4. 配对码只存在于短时 fragment 和浏览器 session storage，不进入服务端 URL、日志或持久化存储。
5. 每个消息均绑定现有 reviewId，并校验请求摘要与大小。
6. 站点权限按需请求，manifest 不包含 Cookie 权限或宽泛永久 AI host 权限。
7. 首次连接只需确认一次目标站点权限；已有权限时无需再次手动输入地址、配对码或站点。
8. 提示只被填入编辑器，不发生自动发送。
9. 浏览器扩展不读取、上传或持久化回答正文与凭据。
10. 关闭桥接或撤销后，现有令牌立即失效。
11. 原有 ReviewLume 手动流程保持兼容。
