# Changelog

## 0.1.12 (2026-08-31)

- 新增：规则系统——每世界 `rules.txt`（每行一条，# 注释），注入游戏提示词醒目位置并优先于世界观；内容生成（地点/NPC）也遵守规则。
- 新增：`agentnoodle_update_rules(worldId, rulesText)` 工具（覆盖整份规则，传空清空）；`list_worlds` 详情含 rules。

## 0.1.11 (2026-08-31)

- 改进：提示词明确规则——玩家明确表示前往某处（如"前往地牢"）时，即使地点库中不存在该场景，也应让玩家成功抵达并返回 `new_location`（系统自动注册进地点库）。

## 0.1.10 (2026-08-30)

- 定位调整：README 与 npm 描述改为「可扩展的 AI 群像聊天游戏框架」——世界/地点/NPC/新功能都可通过对话由 agent 直接添加修改（如接入第三方绘图 API 实现 NPC 动态表情动作）。

## 0.1.9 (2026-08-30)

- 新增：seed 内置「九霄仙域」仙侠世界（10 地点 + 8 NPC + 默认角色），全新安装直接可选。
- 文档：README 增加真实对话示例「在 agentnoodle 里创建一个仙侠世界，地点 10 个，人物若干」。

## 0.1.8 (2026-08-30)

- 文档：README 全面重写——特性、快速开始、对话工具总表、角色卡/世界导入、面板玩法、世界数据格式。

## 0.1.7 (2026-08-30)

- 新增：`agentnoodle_import_card`——导入 SillyTavern 角色卡为 NPC（V1/V2/V3 JSON 或 PNG tEXt chara 块；name/description/personality/scenario/first_mes 映射）。
- 新增：`agentnoodle_import_world`——导入 LazyNoodle 风格世界目录（worldview.txt + locations/npcs/avatars），注册进索引。

## 0.1.6 (2026-08-30)

- 新增：`agentnoodle_update_worldview`——世界观迭代阶段写入最终版。
- 新增：`agentnoodle_generate_content`——按世界观用 AI 生成地点（stage=locations）与 NPC（stage=npcs，`location_id` 强制校验；stage=all 依次生成）。配套 `seed/prompts/generate_locations.txt` / `generate_npcs.txt`。
- 至此形成完整「从零开玩」流程：世界观讨论确认 → AI 生成地点/NPC → 开玩。

## 0.1.5 (2026-08-30)

- 改进：`agentnoodle_list_worlds` 支持传入 `worldId` 查看世界详情——全部地点（含各自 NPC 名单）、NPC 名单（身份/地点/头像）、角色与世界观摘要。

## 0.1.4 (2026-08-30)

- 新增：模型工具 `agentnoodle_add_location`——通过对话添加地点。
- 改进：AI 在游玩中解锁的新地点（`new_location`）自动注册进地点库，保证 NPC 归属与场景查找不断。

## 0.1.3 (2026-08-30)

- 新增：模型工具 `agentnoodle_create_world` / `agentnoodle_list_worlds` / `agentnoodle_add_npc`——可在对话里直接创建和管理世界，无需写文件。

## 0.1.2 (2026-08-30)

- 新增：seed 预置默认角色「无名旅人」，全新安装后打开即可直接游玩（无需先创建角色）。

## 0.1.1 (2026-08-30)

- 修复：HTTP 请求体改为缓冲后一次性 UTF-8 解码，避免中文名跨 chunk 乱码。
- 新增：seed 附带 `.env.example` 配置模板。
- 新增：仓库声明 `screenshots.json`（市场详情页截图）。

## 0.1.0 (2026-08-30)

- 首次发布：AI 驱动的群像反应叙事游戏插件。
- 玩家输入一个行动，场景中多个 NPC 各自做出反应，每条反应独立成一条带头像插图的聊天室消息。
- 场景切换、NPC 关系变化由 AI 实时驱动，对话历史持久化到本地 JSON。
- 复用 DeepSeek Harness 默认模型路由，无需额外 API Key。
- 数据目录默认 `~/.dsh/agentnoodle`，首次启动自动从包内 `seed/` 播种。
