# Shixu v0.4 Design Direction

## Direction

拾序是个人工作操作系统，不再以“工具集合”作为第一印象。界面采用 Apple 的留白与层次、Linear 的信息密度、Raycast 的键盘优先和快速入口。

模式：Operate。Today 先回答“我现在在做什么”，Project Space 提供项目上下文，Scene 负责启动工作模式，Hermes 作为全局助手随时介入。

## Layout

- 固定左侧导航栏，分为 Today / Workspace / Planning / Intelligence / System。
- 顶部保留原生窗口控制区域；主工作区使用单一滚动平面。
- Today 使用 12 列响应式网格，重要内容占更宽列，避免等宽卡片墙。
- Project Space 以项目标题、摘要指标、上下文标签和内容页签形成连续阅读路径。
- Hermes 是全局侧边面板，不作为默认导航页面。

## Visual language

- 背景和卡片使用低对比度表面，不使用装饰性渐变。
- 卡片边框 1px，圆角中等，阴影仅用于层级，不用于制造漂浮感。
- 标题使用较重字重和紧凑字距；辅助信息使用低对比度但保持可读性。
- 所有图标来自 Phosphor Icons，不使用 emoji 代替图标。
- 动效只表达页面切换、面板进入和状态反馈，并尊重 prefers-reduced-motion。

## Theme behavior

- dark：黑色画布、深灰表面、白色正文，绿色表示状态成功。
- light：白色画布、浅灰表面、黑色正文，边框与阴影保持轻量。
- hermes：蓝色画布、白色表面、蓝色强调，正文在白色表面使用深色，在画布上使用白色。

## Component grammar

- Card：`card` / `today-panel`，统一边框、圆角、表面和 hover 反馈。
- Button：`btn`，统一最小高度、圆角、主次层级和 focus-visible。
- Sidebar：`sidebar-nav`，固定分组、明确当前项、可键盘访问。
- Workspace：`.workspace`，统一最大宽度、内边距和滚动行为。
- Timeline：`.today-timeline`，使用垂直轨迹表达最近工作活动。
- AI Panel：`.hermes-assistant`，始终可从导航或上下文按钮打开，关闭后不改变当前页面。

## Quality bar

- 375 / 768 / 1024 / 1440 宽度下不出现横向溢出。
- 正文和辅助文字保持足够对比度，所有交互元素有可见 focus 状态。
- 列表和网格优先使用 transform / opacity 动画，避免布局抖动。
- 现有 Electron、React、TypeScript、Zustand、SQLite 和 IPC 数据结构保持兼容。
