# Contributing

欢迎改进 dsh-agentnoodle！

## 开发

```sh
npm test        # 跑自测（假 fs + 假 AI，无需 harness 运行时）
npm run check   # 语法检查 + 自测
```

## 结构

```
lib/game.js        # 游戏核心逻辑（纯函数、依赖注入，可独立测试）
lib/index.js       # Host 插件入口：HTTP API + 头像路由 + 数据播种
client/client.js   # 浏览器面板（ModuleLoader bundle）
seed/              # 首次启动的默认世界/提示词
```

## 改动指南

- 游戏逻辑改 `lib/game.js`，Host 接线改 `lib/index.js`，面板 UI 改 `client/client.js`。
- 提示词放 `<dataDir>/prompts/environment.txt`（运行时读取，改完即生效）。
- 改完跑 `npm run check`，确保自测通过再提交。
- 发新版本：改 `package.json` 版本号 → 更新 `CHANGELOG.md` → `npm publish`。
