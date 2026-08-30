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

## 在对话里创建世界

插件注册了三个模型工具，harness 的 agent 可以直接调用——**不用写代码、不用重启**：

- `agentnoodle_create_world` — 创建新世界（worldId + name + 可选世界观），自动建地点/NPC 骨架并切换为当前世界
- `agentnoodle_list_worlds` — 列出所有世界（地点数/NPC 数/角色数）
- `agentnoodle_add_npc` — 向世界添加 NPC（worldId + name + locationId）

例如直接对 agent 说：「帮我建一个叫『青云门』的修仙世界，掌门叫青云真人」——agent 会调用工具完成，面板刷新后即可选择游玩。世界就是普通文件（`<dataDir>/worlds/<id>/`），任何能写这些文件的入口都能建世界。

## 开发

```sh
npm test            # 跑自测（假 fs/AI，无需 harness 运行时）
npm run check       # 语法检查 + 自测
```

结构：

```
lib/game.js        # 游戏核心逻辑（纯函数、依赖注入）
lib/index.js       # Host 插件入口：HTTP API + 头像路由 + 数据播种 + 模型工具
client/client.js   # 浏览器面板（ModuleLoader bundle）
seed/              # 首次启动的默认世界/提示词
```

## 许可证

MIT
