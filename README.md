# 🍜 dsh-agentnoodle

AI 驱动的**群像反应叙事游戏**插件（DeepSeek Harness）。

输入一个行动/一句话，场景中多个 NPC 会**各自**做出反应——每条反应独立成一条聊天室消息，带自己的头像插图（无头像自动用名字首字占位圆）。叙事、场景切换、NPC 关系变化全由 AI 实时驱动，对话历史持久化到本地 JSON。

> 源自 LazyNoodle 项目的 DSH 插件化改造原型（路线 C → 可发布形态）。

## 特性

- 🎭 **群像反应**：一次行动 → AI 挑选 2-4 个在场 NPC 各自回应，每条独立渲染
- 🖼️ **头像插图**：每条消息显示说话人头像；无头像显示名字首字占位圆
- 🌍 **多世界**：每个世界独立的世界观 / 地点 / NPC / 角色存档
- 🗃️ **本地持久化**：JSON 文件存档，兼容 LazyNoodle 的数据风格
- 🪟 **悬浮窗面板**：可拖动、可最小化，不打扰主界面
- 🤖 **模型无关**：复用 DeepSeek Harness 的默认模型路由，无需额外 API Key

## 安装

在 DeepSeek Harness 中：

```sh
dsh plugin --profile web add dsh-agentnoodle
```

或打开 **Settings → Plugin Market** 搜索 `dsh-agentnoodle` 一键安装。

安装后重启 `dsh web`，页面右下角会出现 **🍜 AgentNoodle 聊天室** 悬浮窗：
选世界 → 创建/选择角色 → 输入行动 → 看多个 NPC 各自回应。

## 数据与配置

- 默认数据目录：`~/.dsh/agentnoodle`（首次启动自动从包内 `seed/` 播种）
- 覆盖方式：在 profile 的 `cordis.patch.yml` 里给该行配置 `dataDir`，或在 Settings → Plugins → 插件配置中修改
- 提示词：`<dataDir>/prompts/environment.txt`，改完即时生效（无需重启）
- AI 参数：`<dataDir>/.env`（`AI_TEMPERATURE` / `AI_MAX_TOKENS` / `HISTORY_TAIL`）

## 开发

```sh
npm run test:selftest   # 用假 fs/AI 跑通游戏闭环自测（无需 harness 运行时）
```

结构：

```
lib/game.js        # 游戏核心逻辑（纯函数、依赖注入）
lib/index.js       # Host 插件入口：HTTP API + 头像路由 + 数据播种
client/client.js   # 浏览器面板（ModuleLoader bundle）
seed/              # 首次启动的默认世界/提示词
```

## 许可证

MIT
