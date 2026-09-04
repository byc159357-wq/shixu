<div align="center">
  <img src="src/renderer/public/shixu-logo.png" width="92" alt="拾序 Logo" />
  <h1>拾序 · Shixu</h1>
  <p><strong>把散落的文件、日程、任务与 AI，收进一个本地工作台。</strong></p>

  <p>
    <a href="https://github.com/byc159357-wq/shixu/releases/latest"><img alt="Release" src="https://img.shields.io/github/v/release/byc159357-wq/shixu?style=flat-square" /></a>
    <img alt="Windows" src="https://img.shields.io/badge/Windows-10%20%7C%2011-2563EB?style=flat-square&logo=windows11&logoColor=white" />
    <img alt="Electron" src="https://img.shields.io/badge/Electron-43-47848F?style=flat-square&logo=electron&logoColor=white" />
    <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-7-3178C6?style=flat-square&logo=typescript&logoColor=white" />
    <img alt="License" src="https://img.shields.io/badge/license-proprietary-111111?style=flat-square" />
  </p>
</div>

## 关于拾序

拾序是一款面向 Windows 的本地优先个人工作台。它不会强迫你重新整理所有资料，而是在现有文件夹之上建立索引，把项目、文件、任务、笔记、日历和 AI 助手连接起来。

当前版本为 **v0.1.0**，处于早期可用阶段。

## 主要能力

- **自由工作台**：可拖拽、缩放和组合时钟、今日任务、倒计时、天气、AI 助手等卡片。
- **项目管理**：集中管理项目文件、任务、笔记、状态和排期，文件引用不会擅自移动原文件。
- **文件资料库**：监控指定文件夹、保留真实目录层级、生成预览并支持搜索、筛选与项目关联。
- **日历与倒计时**：按日期创建事件，支持月/周/议程视图以及 ICS 导入导出。
- **AI 工作流**：接入 Hermes Gateway / ACP，也支持 OpenAI 兼容接口，可切换模型、管理会话并执行经确认的工具操作。
- **消息与产物**：集中查看 AI 会话、定时任务与生成产物。
- **本地数据**：核心数据保存在本机 SQLite 数据库，支持自动备份和手动快照。

## 下载与安装

从 [Releases](https://github.com/byc159357-wq/shixu/releases/latest) 下载最新版 Windows 安装包：

**[下载拾序 v0.1.0](https://github.com/byc159357-wq/shixu/releases/download/v0.1.0/Shixu-Setup-0.1.0.exe)**

运行安装程序后，可选择安装目录并创建桌面和开始菜单快捷方式。目前仅提供 Windows x64 构建。

> 仓库当前为私有仓库，下载源码或 Release 时需要登录具有访问权限的 GitHub 账号。

## 开始使用

1. 在「设置 → 数据」中添加需要管理的文件夹。
2. 在「项目」中创建项目，并关联文件、任务与笔记。
3. 点击日历中的日期创建事件，或在倒计时面板设置重要日期。
4. 如需使用 AI，在「设置 → AI」中连接 Hermes 或填写兼容服务的地址、模型与 API Key。
5. 在「设置 → 数据」中定期创建手动备份。

## 本地开发

### 环境要求

- Windows 10/11 x64
- Node.js 22 或更高版本
- npm 10 或更高版本
- Git

### 安装与运行

```powershell
git clone https://github.com/byc159357-wq/shixu.git
cd shixu
npm install
npm run dev
```

### 常用命令

| 命令 | 用途 |
| --- | --- |
| `npm run dev` | 启动 Electron 开发环境 |
| `npm run typecheck` | 检查主进程与渲染进程类型 |
| `npm test` | 运行 Vitest 测试 |
| `npm run build` | 构建主进程、预加载与渲染界面 |
| `npm run smoke` | 构建并运行桌面端冒烟检查 |
| `npm run pack` | 生成 Windows x64 安装包 |

## 项目结构

```text
src/
├─ main/                 Electron 主进程、数据库与系统服务
│  ├─ ipc/               安全的 IPC 通道与注册逻辑
│  └─ services/          项目、文件、日历、AI、备份等服务
├─ preload/              渲染进程安全桥接
├─ renderer/             React 界面、页面、组件与样式
└─ shared/               跨进程类型与模型配置
build/                   应用图标与打包资源
scripts/                 集成与冒烟检查脚本
```

## 数据与隐私

拾序采用本地优先设计：

- 主数据库：`%APPDATA%\workdeck\workdeck.db`
- 自动备份：`%APPDATA%\workdeck\workdeck-backups`
- 被监控的文件仍保留在原位置，资料库主要保存索引与引用。
- API Key 使用 Electron `safeStorage` 加密后写入本地设置。
- 只有在使用天气、邮件、AI 或更新检查等网络功能时，相关请求才会发送到对应服务。

删除或重装前，请先备份数据库以及被引用的原始文件夹。GitHub 源码仓库不包含个人数据库和原始素材。

## 参与项目

提交问题或改进前，请先阅读 [贡献指南](CONTRIBUTING.md)。安全问题请按照 [安全政策](SECURITY.md) 私下报告。

## 版本与计划

- 当前版本：[v0.1.0](https://github.com/byc159357-wq/shixu/releases/tag/v0.1.0)
- 版本记录：[CHANGELOG.md](CHANGELOG.md)
- 集成路线图：[workdeck-integration-roadmap](workdeck-integration-roadmap/workdeck-integration-roadmap.html)

## 许可

本项目目前未开放源代码许可，保留所有权利。详见 [LICENSE](LICENSE)。

