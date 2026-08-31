// agentnoodle · 自测：用假 fs + 假 AI 跑通 世界→建角色→行动→存档 闭环（不依赖 harness 运行时）
import { mkdtempSync, readFileSync, writeFileSync, readdirSync, mkdirSync, cpSync, copyFileSync, existsSync } from 'node:fs'
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
  readBinary: (p) => { try { return readFileSync(p) } catch { return null } },
  copyFile: (f, t) => { mkdirSync(join(t, '..'), { recursive: true }); copyFileSync(f, t) },
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

// 6. 创建世界
const cw = game.createWorld({ worldId: 'qingyun', name: '青云门', worldview: '修仙门派，剑气纵横。' })
console.log('createWorld:', JSON.stringify(cw))
if (!cw.ok) throw new Error('createWorld 失败')

// 7. 列举世界
const lw = game.listWorlds()
console.log('listWorlds:', JSON.stringify(lw))
if (!lw.worlds.some((w) => w.id === 'qingyun')) throw new Error('listWorlds 缺新世界')

// 8. 加 NPC：无地点应报错
const an1 = game.addNpc({ worldId: 'qingyun', name: '掌门', locationId: 'main_hall' })
console.log('addNpc(无地点):', JSON.stringify(an1))
if (!an1.error) throw new Error('addNpc 应因无地点失败')

// 9. 用 addLocation 工具补地点后加 NPC
const al = game.addLocation({ worldId: 'qingyun', name: '青云大殿', locationId: 'main_hall', description: '门派正殿', icon: '🏯' })
console.log('addLocation:', JSON.stringify(al))
if (!al.ok) throw new Error('addLocation 失败')
const an2 = game.addNpc({ worldId: 'qingyun', name: '青云真人', locationId: 'main_hall', identity: '掌门', description: '白发仙风道骨' })
console.log('addNpc:', JSON.stringify(an2))
if (!an2.ok || an2.locationId !== 'main_hall') throw new Error('addNpc 失败')

// 10. 新世界立即可玩
const lw2 = game.listWorlds()
const qingyun = lw2.worlds.find((w) => w.id === 'qingyun')
console.log('新世界状态:', JSON.stringify(qingyun))
if (qingyun.npcs !== 1) throw new Error('新世界 NPC 数不对')

// 11. AI 解锁新地点 → 自动注册进地点库（用独立 game 实例带自定义 AI）
const travelAI = async () => JSON.stringify({
  description: '你走出大殿，来到一处悬崖边。',
  reactions: [{ npc: '青云真人', content: '青云真人负手而立，望向云海。', emotion: '淡然' }],
  is_dead: false,
  new_location: '观云崖',
  relationship_update: null,
})
const travelGame = createGame({ ...deps, callAI: travelAI })
const c2 = travelGame.createCharacter({ worldId: 'qingyun', profile: { name: '测试弟子' } })
const a3 = await travelGame.act({ worldId: 'qingyun', characterId: c2.characterId, userInput: '走出大殿' })
console.log('act(new_location):', JSON.stringify(a3))
if (a3.newLocation !== '观云崖') throw new Error('场景切换失败')
const qwLocations = JSON.parse(readFileSync(join(root, 'worlds', 'qingyun', 'locations.json'), 'utf8')).locations
console.log('自动注册后的地点:', qwLocations.map((l) => l.name).join(', '))
if (!qwLocations.some((l) => l.name === '观云崖')) throw new Error('AI 解锁的新地点未自动注册')

// 12. 世界详情模式
const detail = game.listWorlds({ worldId: 'qingyun' })
console.log('世界详情:', JSON.stringify({ name: detail.name, locations: detail.locations.map((l) => l.name + '[' + l.npcs.join(',') + ']'), npcs: detail.npcs.map((n) => n.name + '@' + n.locationId) }))
if (detail.locations.length !== 2) throw new Error('详情地点数不对')
if (!detail.locations.some((l) => l.id === 'main_hall' && l.npcs.includes('青云真人'))) throw new Error('详情地点 NPC 名单缺失')
if (!detail.npcs.some((n) => n.name === '青云真人' && n.locationId === 'main_hall')) throw new Error('详情 NPC 名单缺失')

// 13. 从零建世界：updateWorldview → generateContent(all)（AI 返回地点+NPC，含校验）
const genAI = async (prompt) => {
  if (prompt.includes('地点生成器')) {
    return JSON.stringify({
      regions: [{ id: 'qingyun_region', name: '青云山', description: '主峰', icon: '⛰️' }],
      locations: [
        { id: 'main_hall', name: '青云大殿', parent: 'qingyun_region', description: '门派正殿', icon: '🏯' },
        { id: 'sword_peak', name: '剑峰', parent: 'qingyun_region', description: '练剑之地', icon: '⚔️' },
      ],
    })
  }
  return JSON.stringify({
    npcs: [
      { id: 'npc_main_hall_1', name: '青云真人', gender: '男', profile: { identity: '掌门', description: '白发仙风道骨', personality_traits: ['淡然'], background: '执掌青云门数十年' }, location_id: 'main_hall', active: true, dead: false, favorability: 60 },
      { id: 'npc_bad_loc', name: '编造地点的NPC', location_id: 'nonexistent_place' },
    ],
  })
}
const genGame = createGame({ ...deps, callAI: genAI })
const uw = genGame.updateWorldview({ worldId: 'qingyun', worldview: '修仙门派，剑气纵横。主峰青云山，山巅剑峰为练剑之地。' })
if (!uw.ok) throw new Error('updateWorldview 失败')
const g = await genGame.generateContent({ worldId: 'qingyun', stage: 'all' })
console.log('generateContent:', JSON.stringify(g))
if (!g.ok) throw new Error('generateContent 失败')
const wLoc = JSON.parse(readFileSync(join(root, 'worlds', 'qingyun', 'locations.json'), 'utf8'))
const wNpc = JSON.parse(readFileSync(join(root, 'worlds', 'qingyun', 'npcs.json'), 'utf8'))
if (wLoc.locations.length !== 2) throw new Error('生成地点数不对')
if (wNpc.npcs.length !== 1) throw new Error('应只有 1 个合法 NPC（编造地点的被校验拒绝）')
if (wNpc.npcs[0].location_id !== 'main_hall') throw new Error('生成 NPC 地点异常')

// 14. 角色卡导入（JSON，V2）
const cardV2 = { spec: 'chara_card_v2', spec_version: '2.0', data: { name: '剑灵', description: '一柄古剑中诞生的剑灵，白衣如雪。', personality: '清冷、孤傲、重诺', scenario: '在剑峰沉睡千年，等待有缘人。', first_mes: '你唤醒了沉睡千年的剑灵……' } }
const ic1 = game.importCard({ worldId: 'qingyun', cardText: JSON.stringify(cardV2), locationId: 'sword_peak' })
console.log('importCard(JSON):', JSON.stringify(ic1))
if (!ic1.ok || ic1.name !== '剑灵' || ic1.locationId !== 'sword_peak') throw new Error('importCard JSON 失败')
const npcsAfter = JSON.parse(readFileSync(join(root, 'worlds', 'qingyun', 'npcs.json'), 'utf8')).npcs
const jianling = npcsAfter.find((n) => n.name === '剑灵')
if (!jianling || !jianling.profile.personality_traits.includes('清冷') || !jianling.first_mes) throw new Error('importCard 字段映射异常')

// 15. 角色卡导入（PNG tEXt chara 块）
function buildFakeCardPng(cardJson) {
  const b64 = Buffer.from(JSON.stringify(cardJson), 'utf8').toString('base64')
  function chunk(type, data) { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); return Buffer.concat([len, Buffer.from(type, 'ascii'), data, Buffer.alloc(4)]) }
  const sig = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A])
  return Buffer.concat([sig, chunk('IHDR', Buffer.alloc(0)), chunk('tEXt', Buffer.concat([Buffer.from('chara\0', 'ascii'), Buffer.from(b64, 'ascii')])), chunk('IEND', Buffer.alloc(0))])
}
const pngPath = join(root, 'card.png')
writeFileSync(pngPath, buildFakeCardPng(cardV2))
const ic2 = game.importCard({ worldId: 'qingyun', filePath: pngPath, locationId: 'main_hall', name: '剑灵（图）' })
console.log('importCard(PNG):', JSON.stringify(ic2))
if (!ic2.ok || ic2.name !== '剑灵（图）') throw new Error('importCard PNG 失败')

// 16. 世界导入（LazyNoodle 风格目录）
const srcWorld = join(root, 'src-world')
mkdirSync(join(srcWorld, 'avatars'), { recursive: true })
writeFileSync(join(srcWorld, 'worldview.txt'), '旧朝江湖，快意恩仇。', 'utf8')
writeFileSync(join(srcWorld, 'locations.json'), JSON.stringify({ regions: [], locations: [{ id: 'ke_zhan', name: '悦来客栈', parent: '', description: '江湖驿站', icon: '🏮' }] }), 'utf8')
writeFileSync(join(srcWorld, 'npcs.json'), JSON.stringify({ npcs: [{ id: 'npc_ke_zhan_1', name: '店小二', profile: { identity: '跑堂', description: '腿脚麻利', personality_traits: ['机灵'], background: '' }, location_id: 'ke_zhan', active: true, dead: false }] }), 'utf8')
writeFileSync(join(srcWorld, 'avatars', 'npc_ke_zhan_1.png'), Buffer.from([0x89, 0x50, 0x4E, 0x47, 1, 2, 3, 4]))
const iw = game.importWorld({ worldId: 'jianghu', sourceDir: srcWorld, name: '旧朝江湖' })
console.log('importWorld:', JSON.stringify(iw))
if (!iw.ok || iw.locations !== 1 || iw.npcs !== 1 || iw.avatars !== 1) throw new Error('importWorld 失败')
const iwIndex = JSON.parse(readFileSync(join(root, 'worlds', 'worlds_index.json'), 'utf8'))
if (!iwIndex.worlds.some((w) => w.id === 'jianghu')) throw new Error('importWorld 未注册索引')
if (!existsSync(join(root, 'worlds', 'jianghu', 'avatars', 'npc_ke_zhan_1.png'))) throw new Error('importWorld 未复制头像')

// 17. 规则系统：update_rules → 提示词注入 → 世界详情带 rules → 清空
const uwRules = game.updateRules({ worldId: 'qingyun', rulesText: '# 测试规则\nNPC 不得撒谎。\n禁用火系法术。' })
console.log('updateRules:', JSON.stringify(uwRules))
if (!uwRules.ok || uwRules.ruleCount !== 2) throw new Error('updateRules 失败')
let capturedPrompt = ''
const captureAI = async (prompt) => { capturedPrompt = prompt; return JSON.stringify({ description: '测试', reactions: [{ npc: '青云真人', content: '嗯。', emotion: '淡然' }], is_dead: false, new_location: null, relationship_update: null }) }
const capGame = createGame({ ...deps, callAI: captureAI })
const cr = capGame.createCharacter({ worldId: 'qingyun', profile: { name: '规则测试' } })
await capGame.act({ worldId: 'qingyun', characterId: cr.characterId, userInput: '测试行动' })
if (!capturedPrompt.includes('硬性规则') || !capturedPrompt.includes('NPC 不得撒谎')) throw new Error('规则未注入提示词')
const detail2 = game.listWorlds({ worldId: 'qingyun' })
console.log('世界详情 rules:', JSON.stringify(detail2.rules))
if (!detail2.rules.includes('NPC 不得撒谎。')) throw new Error('详情缺规则')
const clearRules = game.updateRules({ worldId: 'qingyun', rulesText: '' })
if (!clearRules.ok || clearRules.ruleCount !== 0) throw new Error('清空规则失败')

// 18. 历史分页：state 只带尾部（含 seq/总量/游标），history 接口翻更早
const histAI = async () => JSON.stringify({ description: 'd', reactions: [], is_dead: false, new_location: null, relationship_update: null })
const histGame = createGame({ ...deps, callAI: histAI })
const hc = histGame.createCharacter({ worldId: 'tavern', profile: { name: '历史测试' } })
const histCharPath = join(root, 'worlds', 'tavern', 'sessions', 'characters', hc.characterId + '.json')
const histChar = JSON.parse(readFileSync(histCharPath, 'utf8'))
histChar.conversation_history = Array.from({ length: 60 }, (_, k) => ({
  speaker: k % 2 ? '老汤姆' : '旁白',
  content: '第' + (k + 1) + '条',
  scene: '酒馆大厅',
  is_dead: false,
  timestamp: new Date().toISOString(),
  avatar: k % 2 ? 'npc_lao_tangmu.png' : '',
}))
writeFileSync(histCharPath, JSON.stringify(histChar, null, 2), 'utf8')
const st = histGame.state({ worldId: 'tavern', characterId: hc.characterId })
console.log('state 历史:', st.historyTail.length, '条(尾) / 共', st.historyTotal, '条 / more=', st.historyMore, '/ next=', st.historyNext)
if (st.historyTail.length !== 20 || st.historyTotal !== 60 || !st.historyMore || st.historyNext !== 40) throw new Error('state 历史尾部/总量/游标异常')
if (st.historyTail[0].seq !== 40 || st.historyTail[19].seq !== 59) throw new Error('state 历史 seq 异常')
const pg1 = histGame.history({ worldId: 'tavern', characterId: hc.characterId, before: st.historyNext })
console.log('history 第1页:', pg1.entries.length, '条 / more=', pg1.more, '/ next=', pg1.nextBefore)
if (pg1.entries.length !== 40 || pg1.more || pg1.nextBefore !== 0) throw new Error('history 第1页分页异常')
const seqs = [...pg1.entries, ...st.historyTail].map((e) => e.seq).sort((a, b) => a - b)
if (seqs[0] !== 0 || seqs[seqs.length - 1] !== 59 || seqs.length !== 60) throw new Error('history 页码不连续（未覆盖全部 60 条）')
const mid = histGame.history({ worldId: 'tavern', characterId: hc.characterId, before: 60, limit: 50 })
console.log('history 中段:', mid.entries.length, '条 / more=', mid.more, '/ next=', mid.nextBefore)
if (mid.entries.length !== 50 || !mid.more || mid.nextBefore !== 10) throw new Error('history 中段分页异常')
const head = histGame.history({ worldId: 'tavern', characterId: hc.characterId, before: 10 })
if (head.entries.length !== 10 || head.more || head.entries[0].seq !== 0) throw new Error('history 首段分页异常')

console.log('✅ agentnoodle 自测全部通过')
