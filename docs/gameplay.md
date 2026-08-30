# 玩法说明

## 开始

安装插件后，页面右下角出现 **🍜 AgentNoodle 聊天室** 悬浮窗：

1. **选世界**：默认「暮色酒馆（原型）」；切换世界会加载该世界的世界观/地点/NPC/角色存档。
2. **建角色**：输入名字点「创建」（或从角色下拉选择已有角色）。
3. **行动**：在输入框输入动作或话语（如「走到吧台前，要一杯麦酒」），回车或点「行动」。

## 群像反应

每次行动，AI 会：

- 生成一段整体环境描写（旁白）；
- 挑选 **2-4 个最相关的在场 NPC**，各自做出反应——每条反应独立成一条聊天室消息，带说话人头像（无头像显示名字首字占位圆）；
- 根据行为更新 NPC 对玩家的态度（关系系统）；
- 在玩家位置变化时切换场景。

## 数据

- 存档：`~/.dsh/agentnoodle/worlds/<world>/sessions/characters/*.json`
- 提示词：`~/.dsh/agentnoodle/prompts/environment.txt`（改完即时生效）
- AI 参数：`~/.dsh/agentnoodle/.env`（`AI_TEMPERATURE` / `AI_MAX_TOKENS` / `HISTORY_TAIL`）

## 制作自己的世界

每个世界目录包含：

- `worldview.txt` — 世界观设定
- `locations.json` — `{ regions, locations }`，地点含 `id/name/parent/description/icon`
- `npcs.json` — `{ npcs }`，NPC 含 `id/name/profile/location_id/avatar/active`
- `avatars/` — NPC 头像 PNG（可选）
- `sessions/characters/` — 角色存档（运行时生成）
