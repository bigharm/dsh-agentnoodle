# Changelog

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
