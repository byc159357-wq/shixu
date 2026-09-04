# 贡献指南

感谢你帮助改进拾序。当前仓库处于早期开发阶段，提交变更前请先确认问题范围，避免把功能修改、界面重构和依赖升级混在同一个提交中。

## 开始之前

1. 搜索现有 Issue，确认问题尚未被记录。
2. Bug 请提供系统版本、拾序版本、复现步骤、预期结果和实际结果。
3. 新功能请说明使用场景和它解决的具体问题。
4. 安全漏洞不要提交公开 Issue，请阅读 [SECURITY.md](SECURITY.md)。

## 开发流程

```powershell
git clone https://github.com/byc159357-wq/shixu.git
cd shixu
npm install
npm run dev
```

建议从 `main` 创建短生命周期分支：

```powershell
git switch -c feat/short-description
```

提交 Pull Request 前至少运行：

```powershell
npm run typecheck
npm test
npm run build
```

## 代码约定

- 使用 TypeScript，避免没有必要的 `any`。
- 主进程能力必须通过已声明的 IPC 通道暴露，不要在渲染进程直接访问 Node.js API。
- 数据结构变更应提供向前兼容的数据库迁移。
- 文件操作必须保留“引用与原文件分离”的语义，危险操作需要清晰确认。
- UI 修改应覆盖浅色、深色和蓝色主题，并检查窄窗口布局。
- 不要提交 API Key、邮箱密码、数据库、个人文件、构建产物或 `node_modules`。

## Pull Request 要求

- 标题清楚描述用户可感知的变化。
- 说明变更原因、验证方式和可能风险。
- 界面变更附上前后截图。
- 保持改动聚焦；如包含破坏性变化，应在说明中明确标注。

