# 🍜 dsh-agentnoodle

AI 驱动的**群像反应叙事游戏**插件（DeepSeek Harness）。

输入一个行动/一句话，场景中多个 NPC 会**各自**做出反应——每条反应独立成一条聊天室消息，带自己的头像插图（无头像自动用名字首字占位圆）。叙事、场景切换、NPC 关系变化全由 AI 实时驱动，对话历史持久化到本地 JSON。

> 源自 [LazyNoodle](https://github.com/bigharm/LazyNoodle) 项目的 DSH 插件化改造。

## 特性

- 🎭 **群像反应**：一次行动 → AI 挑选 2-4 个在场 NPC 各自回应，每条独立渲染
- 🖼️ **头像插图**：每条消息显示说话人头像；无头像显示名字首字占位圆
- 🌍 **多世界**：每个世界独立的世界观 / 地点 / NPC / 角色存档
- 💬 **对话建世界**：无需写代码，直接在对话里创建世界、生成地点与 NPC
- 🎴 **角色卡导入**：兼容 SillyTavern 角色卡（V1/V2/V3 JSON 或 PNG 内嵌卡片）
- 📦 **世界导入**：直接迁移 LazyNoodle 风格世界目录
- 🗃️ **本地持久化**：JSON 文件存档，AI 解锁的新地点自动注册进地点库
- 🪟 **悬浮窗面板**：可拖动、可最小化，不打扰主界面
- 🤖 **模型无关**：复用 DeepSeek Harness 的默认模型路由，无需额外 API Key

## 安装

```sh
dsh plugin --profile web add dsh-agentnoodle
```

或打开 **Settings → Plugin Market** 搜索 `dsh-agentnoodle` 一键安装。安装后重启 `dsh web`，页面右下角出现 **🍜 AgentNoodle 聊天室** 悬浮窗。

## 快速开始

**① 从零建一个新世界（全在对话里完成）**

1. **世界观**：粘贴你的世界观文本，或让 agent 起草 → 对话里几轮修改、确认；
2. **生成地点**：`agentnoodle_generate_content(worldId, stage=locations)` → AI 生成区域与场景；
3. **生成 NPC**：`agentnoodle_generate_content(worldId, stage=npcs)` → AI 生成 NPC（自动校验地点归属）；
4. **开玩**：面板刷新 → 选世界 → 建角色 → 输入行动。

**② 直接玩默认世界**

「暮色酒馆」世界内置在 seed 中，首次启动自动播种，含默认角色「无名旅人」——打开即可开始。

## 对话工具总表

以下工具注册为模型工具，agent 在对话里直接调用：

| 工具 | 作用 |
|---|---|
| `agentnoodle_create_world` | 创建新世界（worldId + name + 可选世界观），建骨架并切换为当前世界 |
| `agentnoodle_update_worldview` | 更新世界观文本（世界观迭代阶段） |
| `agentnoodle_generate_content` | 按世界观用 AI 生成地点（stage=locations）/ NPC（stage=npcs）/ 两者（stage=all） |
| `agentnoodle_list_worlds` | 世界概览；传 `worldId` 查看详情（地点+NPC 名单） |
| `agentnoodle_add_location` | 手工添加地点 |
| `agentnoodle_add_npc` | 手工添加 NPC（校验地点归属） |
| `agentnoodle_import_card` | 导入 SillyTavern 角色卡为 NPC |
| `agentnoodle_import_world` | 导入 LazyNoodle 风格世界目录 |

示例：「帮我建一个『青云门』的修仙世界，掌门叫青云真人」→ agent 依次调用 `create_world` → `add_location` / `generate_content` → `add_npc`，全程不用碰代码。

## 角色卡 / 世界导入

- **SillyTavern 角色卡**（`agentnoodle_import_card`）：
  - 粘贴 JSON（`cardText`）或本地 PNG/JSON 卡路径（`filePath`，PNG 从 tEXt `chara` 块自动解析）；
  - 字段映射：`name`→NPC 名、`description`→描述、`personality`→性格标签、`scenario`+`personality`→背景、`first_mes`→存档备用；
  - `locationId` 指定所在位置（默认第一个地点）。
- **LazyNoodle 世界**（`agentnoodle_import_world`）：导入一个世界目录（需 `worldview.txt`，可选 `locations.json` / `npcs.json` / `avatars/`），注册进索引并切换为当前世界。

## 面板玩法

- **世界下拉**：切换世界（加载各自的世界观/地点/NPC/角色存档）
- **角色**：创建/选择角色；角色位于某场景，场景决定在场的 NPC
- **行动输入**：动作或话语 → AI 生成旁白 + 多个 NPC 群像反应
- **日志**：每条消息带头像（无头像用名字首字占位圆）；旁白为场景描写样式
- **悬浮窗**：可拖动、最小化成右下角 🍜 按钮

## 数据与配置

- 默认数据目录：`~/.dsh/agentnoodle`（首次启动自动从包内 `seed/` 播种）
- 覆盖方式：在 profile 的 `cordis.patch.yml` 里给该行配置 `dataDir`，或在 Settings → Plugins → 插件配置中修改
- 提示词：`<dataDir>/prompts/`（`environment.txt` 游戏叙事、`generate_locations.txt` 生成地点、`generate_npcs.txt` 生成 NPC），改完即时生效
- AI 参数：`<dataDir>/.env`（`AI_TEMPERATURE` / `AI_MAX_TOKENS` / `HISTORY_TAIL`）

### 世界数据格式

世界就是普通文件（`<dataDir>/worlds/<id>/`），任何能写这些文件的入口都能建世界：

```
<worldId>/
├── worldview.txt          # 世界观设定
├── locations.json         # { regions: [{id,name,description,icon}], locations: [{id,name,parent,description,icon}] }
├── npcs.json              # { npcs: [{id,name,gender,profile,location_id,avatar,active,dead}] }
├── avatars/               # NPC 头像 PNG（可选）
└── sessions/characters/   # 角色存档（运行时生成）
```

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
