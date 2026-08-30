// agentnoodle · Host 插件入口
// 标准 cordis 插件：HTTP API 路由（/anod/api/*）+ 头像静态路由（/anod/avatar/*）
// 数据目录默认 ~/.dsh/agentnoodle，首次启动从包内 seed/ 播种
import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync, cpSync } from 'node:fs'
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
    callAI,
    log: (m) => console.log('[agentnoodle]', m),
  })

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
