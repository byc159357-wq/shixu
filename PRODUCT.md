# Product

<!-- impeccable:product-schema 1 -->

## Platform

adaptive

## Users

个人创作者和高频电脑用户，在 Windows 桌面上同时处理项目、文件、任务、日历和工具。

## Product Purpose

拾序（Shixu）是一个本地优先的个人工作操作系统：把项目、文件、计划、场景和 Hermes AI 放进同一个可持续使用的工作空间，帮助用户快速知道今天该做什么，并继续上一次的工作。

## Positioning

通过文件索引、项目空间、可复用场景和本地行为记录，把“找到工具”升级为“启动工作模式”；数据保存在本机，工作台可以在不改变原文件的情况下持续整理上下文。

## Operating Context

用户在 Windows 桌面上打开软件，通常从 Today 开始，进入当前项目或场景，处理文件和任务，并在需要时调用 Hermes 获取建议或执行受控操作。

## Capabilities and Constraints

- 保持 Electron + React + TypeScript + Zustand + SQLite 架构。
- 现有文件库、项目、任务、日历、场景、邮箱、AI 和更新逻辑必须兼容。
- 文件库只保存文件引用和索引，不移动或复制原文件。
- 软件更新不得删除本地数据库和用户数据。
- Hermes AI 需要用户配置可用服务和模型，敏感操作保留确认。

## Brand Commitments

- 产品名称：拾序（Shixu）。
- 视觉方向：Apple + Linear + Raycast，克制、高级、低噪音、大留白。
- 支持深色、浅色和 Hermes 蓝色主题。

## Product Principles

1. 先告诉用户今天的工作状态，再提供管理入口。
2. 场景是启动工作的入口，不把一次性随手操作误认为稳定习惯。
3. 上下文持续存在，但所有自动化都可解释、可撤销、可控。
4. 本地优先，升级和整理不破坏用户已有资料。
