// agentnoodle · Host 插件入口
// 标准 cordis 插件：HTTP API 路由（/anod/api/*）+ 头像静态路由（/anod/avatar/*）
// 数据目录默认 ~/.dsh/agentnoodle，首次启动从包内 seed/ 播种
import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync, cpSync, copyFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { homedir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { createGame } from './game.js'

export const name = 'agentnoodle'

function expandHome(path) {
  return String(path).replace(/^~(?=$|[\\/])/, homedir())
}

// ---------- 文件依赖（node:fs） ----------
function readText(path) {
  try { return readFileSync(path, 'utf8') } catch (e) { return null }
}
function writeText(path, content) {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, content, 'utf8')
}
function listDirNames(dir) {
  try { return readdirSync(dir) } catch (e) { return [] }
}
function readBinary(path) {
  try { return readFileSync(path) } catch (e) { return null }
}
function copyFile(from, to) {
  mkdirSync(dirname(to), { recursive: true })
  copyFileSync(from, to)
}

// ---------- 路由辅助 ----------
function sendJson(res, status, obj) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' })
  res.end(JSON.stringify(obj))
}
function readBody(req) {
  return new Promise((resolveBody, reject) => {
    const chunks = []
    let total = 0
    req.on('data', (chunk) => {
      total += chunk.length
      if (total > 2 * 1024 * 1024) { reject(new Error('body too large')); req.destroy(); return }
      chunks.push(chunk)
    })
    req.on('end', () => {
      try {
        const text = chunks.length ? Buffer.concat(chunks).toString('utf8') : ''
        resolveBody(text ? JSON.parse(text) : {})
      } catch (e) { reject(e) }
    })
    req.on('error', reject)
  })
}

export function apply(ctx, config = {}) {
  // ---------- 数据目录 + 首次播种 ----------
  const pkgRoot = dirname(dirname(fileURLToPath(import.meta.url)))
  const seedDir = join(pkgRoot, 'seed')
  const dataDir = resolve(expandHome(config.dataDir || join(homedir(), '.dsh', 'agentnoodle')))
  try {
    if (!existsSync(join(dataDir, 'worlds', 'worlds_index.json'))) {
      mkdirSync(dataDir, { recursive: true })
      cpSync(seedDir, dataDir, { recursive: true })
      console.log('[agentnoodle] 已从 seed 初始化数据目录:', dataDir)
    }
  } catch (e) {
    console.error('[agentnoodle] 数据目录初始化失败:', String(e))
  }

  // ---------- LLM 调用（走 harness llm 服务 + 默认模型路由） ----------
  async function callAI(prompt, cfg) {
    const llm = ctx.get('llm')
    if (!llm) throw new Error('llm service unavailable')
    let provider; let model
    const adm = ctx.get('agentDefaultModel')
    if (adm) {
      try {
        const sel = adm.currentSelection()
        if (sel && sel.provider && sel.model) { provider = sel.provider; model = sel.model }
      } catch (e) { /* 忽略，走发现兜底 */ }
    }
    if (!provider) {
      const providers = llm.listProviders()
      if (!providers || providers.length === 0) throw new Error('no llm provider registered')
      provider = providers[0].id
      try {
        const models = await llm.listModels(provider)
        if (models && models.length) model = models[0].id
      } catch (e) { /* 模型发现失败则交给 stream 报错 */ }
    }
    console.log('[agentnoodle] llm route:', provider, '|', model)
    const message = {
      id: 'anod-' + Date.now() + '-' + Math.floor(Math.random() * 1e6),
      role: 'user',
      content: [{ type: 'text', text: prompt }],
      source: { kind: 'user' },
    }
    let text = ''
    let failed = false
    try {
      for await (const chunk of llm.stream({
        provider, model,
        messages: [message],
        temperature: cfg.temperature,
        maxTokens: cfg.maxTokens,
      })) {
        if (chunk.type === 'text-delta') text += chunk.text
        else if (chunk.type === 'finish' && (chunk.reason.kind === 'error' || chunk.reason.kind === 'aborted')) failed = true
      }
    } catch (e) {
      throw e
    }
    if (failed || !text.trim()) throw new Error('AI 调用失败（流终止于 error/aborted）')
    return text.trim()
  }

  const game = createGame({
    dataDir,
    readText,
    writeText,
    listDirNames,
    readBinary,
    copyFile,
    callAI,
    log: (m) => console.log('[agentnoodle]', m),
  })

  // ---------- 模型工具：在对话里创建/管理世界 ----------
  const toolsService = ctx.get('tools')
  if (toolsService) {
    function makeTool(toolName, description, parameters, handler) {
      return {
        name: toolName,
        description,
        parameters,
        output: {
          schema: { type: 'object', properties: {}, additionalProperties: true },
          render(args, value) { return [{ type: 'text', text: JSON.stringify(value, null, 2) }] },
        },
        async execute(args) { return handler(args || {}) },
      }
    }
    ctx.effect(() => {
      const disposers = []
      disposers.push(toolsService.register(makeTool(
        'agentnoodle_create_world',
        '在 agentnoodle 中创建一个新世界：写入世界观/空地点/NPC 骨架，更新世界索引并切换为当前世界。',
        {
          worldId: { type: 'string', required: true, description: '世界 ID，如 qingyun（仅小写字母/数字/下划线）' },
          name: { type: 'string', required: true, description: '世界名，如「青云门」' },
          worldview: { type: 'string', description: '世界观设定文本（可选）' },
          description: { type: 'string', description: '一句话简介（可选）' },
        },
        (a) => game.createWorld(a),
      )))
      disposers.push(toolsService.register(makeTool(
        'agentnoodle_list_worlds',
        '列出 agentnoodle 的全部世界概览（ID/名称/地点数/NPC 数/角色数/当前世界）；传入 worldId 则查看该世界详情：全部地点（含各自 NPC 名单）、全部 NPC（含身份/地点/头像）、角色与世界观摘要。',
        {
          worldId: { type: 'string', description: '要查看详情的世界 ID（可选；不传则返回全部世界概览）' },
        },
        (a) => game.listWorlds(a),
      )))
      disposers.push(toolsService.register(makeTool(
        'agentnoodle_add_npc',
        '向指定世界添加一个 NPC。worldId 用 agentnoodle_list_worlds 查；locationId 是地点 ID（如 tavern_hall），参考世界文件或面板。',
        {
          worldId: { type: 'string', required: true, description: '世界 ID' },
          name: { type: 'string', required: true, description: 'NPC 名字' },
          locationId: { type: 'string', required: true, description: 'NPC 所在位置的地点 ID' },
          identity: { type: 'string', description: '身份，如「酒馆老板」' },
          description: { type: 'string', description: '外貌/特征描述' },
          gender: { type: 'string', description: '性别' },
          personalityTraits: { type: 'array', items: { type: 'string' }, description: '性格标签数组' },
          background: { type: 'string', description: '背景故事' },
          avatar: { type: 'string', description: '头像文件名（需已存在于世界 avatars/ 目录）' },
        },
        (a) => game.addNpc(a),
      )))
      disposers.push(toolsService.register(makeTool(
        'agentnoodle_add_location',
        '向指定世界添加一个地点。新世界为空地点骨架，先加地点再加 NPC。',
        {
          worldId: { type: 'string', required: true, description: '世界 ID' },
          name: { type: 'string', required: true, description: '地点名，如「青云大殿」' },
          locationId: { type: 'string', description: '地点 ID（默认自动生成 loc_xxx）' },
          parent: { type: 'string', description: '所属区域 ID（可选）' },
          description: { type: 'string', description: '地点描述' },
          icon: { type: 'string', description: '图标 emoji' },
        },
        (a) => game.addLocation(a),
      )))
      disposers.push(toolsService.register(makeTool(
        'agentnoodle_update_worldview',
        '更新指定世界的世界观文本（worldId + worldview）。用于从零建世界的世界观迭代阶段：玩家确认或修改几轮后，把最终版写入。',
        {
          worldId: { type: 'string', required: true, description: '世界 ID' },
          worldview: { type: 'string', required: true, description: '世界观设定全文' },
        },
        (a) => game.updateWorldview(a),
      )))
      disposers.push(toolsService.register(makeTool(
        'agentnoodle_update_rules',
        '覆盖指定世界的规则文本（worldId + rulesText，每行一条规则，# 开头为注释）。规则是玩家设定的硬性约束，注入游戏提示词并优先于世界观；内容生成（地点/NPC）也会遵守。传入空文本可清空规则。',
        {
          worldId: { type: 'string', required: true, description: '世界 ID' },
          rulesText: { type: 'string', description: '完整规则文本（每行一条；留空则清空规则）' },
        },
        (a) => game.updateRules(a),
      )))
      disposers.push(toolsService.register(makeTool(
        'agentnoodle_generate_content',
        '根据世界世界观用 AI 生成世界内容：stage=locations 生成地点库（regions+locations），stage=npcs 生成 NPC（自动校验 location_id 必须来自地点库），stage=all 依次生成两者。生成前需先有世界观。',
        {
          worldId: { type: 'string', required: true, description: '世界 ID' },
          stage: { type: 'string', description: 'locations | npcs | all（默认 all）' },
        },
        (a) => game.generateContent(a),
      )))
      disposers.push(toolsService.register(makeTool(
        'agentnoodle_import_card',
        '导入 SillyTavern 角色卡为 NPC：可传 cardText（粘贴卡片 JSON，支持 V1/V2/V3）或 filePath（本地 PNG/JSON 卡路径；PNG 从 tEXt chara 块解析）。',
        {
          worldId: { type: 'string', required: true, description: '世界 ID' },
          cardText: { type: 'string', description: '粘贴的卡片 JSON（与 filePath 二选一）' },
          filePath: { type: 'string', description: '本地卡片文件路径，PNG 或 JSON（与 cardText 二选一）' },
          locationId: { type: 'string', description: 'NPC 所在位置的地点 ID（默认第一个地点）' },
          name: { type: 'string', description: '覆盖卡片名字（可选）' },
        },
        (a) => game.importCard(a),
      )))
      disposers.push(toolsService.register(makeTool(
        'agentnoodle_import_world',
        '从 LazyNoodle 风格世界目录导入世界（需含 worldview.txt，可选 locations.json / npcs.json / avatars/），注册进索引并切换为当前世界。',
        {
          worldId: { type: 'string', required: true, description: '新世界 ID' },
          sourceDir: { type: 'string', required: true, description: '源世界目录绝对路径' },
          name: { type: 'string', description: '世界名（默认 worldId）' },
          description: { type: 'string', description: '简介（可选）' },
        },
        (a) => game.importWorld(a),
      )))
      return () => { for (const d of disposers) d() }
    }, 'agentnoodle: model tools')
    console.log('[agentnoodle] 模型工具已注册: create_world / list_worlds / add_npc / add_location / update_worldview / generate_content / import_card / import_world')
  }

  // ---------- HTTP 路由 ----------
  ctx.inject(['webServer'], (hostCtx) => {
    hostCtx.effect(() => {
      const disposers = []

      // 游戏 API：/anod/api/<worlds|boot|createCharacter|state|act|diag>
      disposers.push(hostCtx.webServer.register({
        kind: 'prefix',
        path: '/anod/api',
        handler: async (req, res) => {
          try {
            const raw = String((req.url || '').split('?')[0])
            const idx = raw.indexOf('/anod/api')
            const rest = (idx >= 0 ? raw.slice(idx + '/anod/api'.length) : raw).replace(/^\//, '').split('/')[0]
            const args = req.method === 'POST' ? await readBody(req) : {}
            switch (rest) {
              case 'worlds': return sendJson(res, 200, game.worlds(args))
              case 'boot': return sendJson(res, 200, game.boot(args))
              case 'createCharacter': return sendJson(res, 200, game.createCharacter(args))
              case 'state': return sendJson(res, 200, game.state(args))
              case 'act': return sendJson(res, 200, await game.act(args))
              case 'diag': return sendJson(res, 200, game.diag())
              default: return sendJson(res, 404, { error: 'unknown api: ' + rest })
            }
          } catch (e) {
            return sendJson(res, 500, { error: String(e) })
          }
        },
      }))

      // 头像静态服务：/anod/avatar/{worldId}/{file}
      disposers.push(hostCtx.webServer.register({
        kind: 'prefix',
        path: '/anod/avatar',
        handler: (req, res) => {
          try {
            const raw = decodeURIComponent(String((req.url || '').split('?')[0]))
            const idx = raw.indexOf('/anod/avatar')
            const rest = (idx >= 0 ? raw.slice(idx + '/anod/avatar'.length) : raw).replace(/^\//, '')
            const slash = rest.indexOf('/')
            const worldId = String(slash === -1 ? '' : rest.slice(0, slash)).replace(/[^a-zA-Z0-9_-]/g, '')
            const file = String(slash === -1 ? rest : rest.slice(slash + 1)).replace(/[^a-zA-Z0-9_.-]/g, '')
            if (!worldId || !file) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); res.end('not found'); return }
            const path = join(dataDir, 'worlds', worldId, 'avatars', file)
            if (!existsSync(path)) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); res.end('not found'); return }
            const bytes = readFileSync(path)
            res.writeHead(200, {
              'Content-Type': file.endsWith('.png') ? 'image/png' : 'application/octet-stream',
              'Cache-Control': 'public, max-age=3600',
            })
            res.end(bytes)
          } catch (e) {
            try { res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' }); res.end(String(e)) } catch (e2) { /* 连接已断开 */ }
          }
        },
      }))

      console.log('[agentnoodle] HTTP 路由已挂载: /anod/api, /anod/avatar (dataDir=' + dataDir + ')')
      return () => { for (const d of disposers) d() }
    }, 'agentnoodle: http routes')
  })
}
