// agentnoodle · 自测：用假 fs + 假 AI 跑通 世界→建角色→行动→存档 闭环（不依赖 harness 运行时）
import { mkdtempSync, readFileSync, writeFileSync, readdirSync, mkdirSync, cpSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createGame } from '../lib/game.js'

// 用 seed 初始化一个临时数据目录
const root = mkdtempSync(join(tmpdir(), 'anod-self-'))
cpSync(fileURLToPath(new URL('../seed', import.meta.url)), root, { recursive: true })

const deps = {
  dataDir: root,
  readText: (p) => { try { return readFileSync(p, 'utf8') } catch { return null } },
  writeText: (p, c) => { mkdirSync(join(p, '..'), { recursive: true }); writeFileSync(p, c, 'utf8') },
  listDirNames: (d) => { try { return readdirSync(d) } catch { return [] } },
  log: (m) => console.log('[test]', m),
}

// 假 AI：返回固定的群像反应
deps.callAI = async () => JSON.stringify({
  description: '你推门走进酒馆，嘈杂声渐次低了下去。',
  reactions: [
    { npc: '老汤姆', content: '老汤姆抬眼打量了你一番，瓮声瓮气地说："麦酒？先说说你从哪来。"', emotion: '审视' },
    { npc: '莉莉', content: '莉莉倒是热情，凑过来笑道："别理他，要喝点什么？"', emotion: '热情' },
  ],
  is_dead: false,
  new_location: null,
  relationship_update: { 老汤姆: '态度缓和' },
})

const game = createGame(deps)

// 1. worlds
const w = game.worlds()
console.log('worlds:', JSON.stringify(w))
if (!w.worlds.length || w.currentWorld !== 'tavern') throw new Error('worlds 失败')

// 2. createCharacter
const c = game.createCharacter({ worldId: 'tavern', profile: { name: '测试侠客' } })
console.log('createCharacter:', JSON.stringify(c))
if (!c.characterId) throw new Error('createCharacter 失败')

// 3. act（群像反应）
const a = await game.act({ worldId: 'tavern', characterId: c.characterId, userInput: '走进酒馆要一杯麦酒' })
console.log('act entries:', a.entries.map((e) => e.speaker + (e.avatar ? '(' + e.avatar + ')' : '')).join(', '))
if (a.entries.length !== 3) throw new Error('应生成 3 条（旁白+2 NPC），实际 ' + a.entries.length)
if (a.entries[1].avatar !== 'npc_lao_tangmu.png') throw new Error('老汤姆头像缺失')
if (a.relationships['老汤姆'] !== '态度缓和') throw new Error('relationship 未更新')

// 4. state（历史带头像）
const s = game.state({ worldId: 'tavern', characterId: c.characterId })
console.log('state historyTail:', s.historyTail.length, '条')
if (!s.historyTail.some((m) => m.avatar)) throw new Error('历史条目缺头像')

// 5. 持久化
const saved = JSON.parse(readFileSync(join(root, 'worlds', 'tavern', 'sessions', 'characters', c.characterId + '.json'), 'utf8'))
console.log('存档条目数:', saved.conversation_history.length)
if (saved.conversation_history.length !== 3) throw new Error('存档未写入 3 条')
if (saved.conversation_history[1].speaker !== '老汤姆' || saved.conversation_history[1].avatar !== 'npc_lao_tangmu.png') throw new Error('存档 NPC 条目异常')

console.log('✅ agentnoodle 自测全部通过')
