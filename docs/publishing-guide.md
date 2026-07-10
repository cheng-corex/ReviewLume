# 发布指南

## 1. 品牌

正式名称：ReviewLume

推荐 Marketplace 名称：

> ReviewLume – AI Code Review Pack

描述中可以准确提到兼容 ChatGPT、Claude、Gemini 等服务，但必须明确：

> ReviewLume is an independent open-source project and is not affiliated with or endorsed by OpenAI, Anthropic, Google, or other AI service providers.

不要使用服务商 Logo 作为插件图标。

## 2. package.json 建议

```json
{
  "name": "reviewlume",
  "displayName": "ReviewLume – AI Code Review Pack",
  "description": "Build focused, privacy-aware code review packs for browser-based AI reviewers.",
  "publisher": "your-publisher-id",
  "engines": {
    "vscode": "^1.100.0"
  },
  "categories": ["Other", "Visualization"],
  "keywords": [
    "code review",
    "git diff",
    "ai review",
    "review pack",
    "privacy"
  ]
}
```

正式开发时应根据目标用户调整最低 VS Code 版本。

## 3. Marketplace 页面必须包含

- 产品定位。
- 截图或短视频。
- 明确权限说明。
- 数据流说明。
- 敏感信息扫描说明。
- 本地历史位置。
- 第三方 AI 服务免责声明。
- 隐私政策链接。
- 安全问题报告链接。
- 已知限制。

## 4. 发布前检查

```bash
pnpm install --frozen-lockfile
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm package:vscode
```

检查 VSIX：

- 不包含 `.env`。
- 不包含测试密钥。
- 不包含大型 fixture。
- 不包含本地缓存和审核历史。
- 不包含多余源码和私有文档。

## 5. 版本策略

- `0.1.x`：核心 Review Pack MVP。
- `0.2.x`：报告闭环。
- `0.3.x`：实验性 Web Bridge。
- `1.0.0`：核心格式稳定、隐私政策和安全边界成熟。

实验性网页桥接应使用 feature flag，并在 Marketplace 页面明确标记。

## 6. 浏览器扩展发布

Web Bridge 应单独发布，不能假设安装 VS Code 插件后自动安装浏览器扩展。

要求：

- Manifest V3。
- 单一明确用途。
- 最小权限。
- 可访问站点由用户主动授权。
- 单独隐私说明。
- 不读取 Cookie。
- 不自动发送消息。
- 不宣传规避费用或额度。
