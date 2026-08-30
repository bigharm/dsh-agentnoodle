// agentnoodle · 游戏核心逻辑（纯函数，依赖注入，与运行时解耦）
// deps: { dataDir, readText(path)→string|null, writeText(path, content), listDirNames(dir)→string[], callAI(prompt, cfg)→string, log(msg) }
export function createGame(deps) {
  const { dataDir, readText, writeText, listDirNames, callAI, log } = deps

  function worldPath(worldId) { return dataDir + '/worlds/' + worldId }
  function charPath(worldId, charId) { return worldPath(worldId) + '/sessions/characters/' + charId + '.json' }
  function safeId(id) { return String(id || '').replace(/[^a-zA-Z0-9_-]/g, '') }

  function readJson(path) {
    const text = readText(path)
    if (text === null) return null
    try { return JSON.parse(text) } catch (e) { throw new Error('bad json: ' + path) }
  }
  function writeJson(path, data) { writeText(path, JSON.stringify(data, null, 2)) }

  function listJsonFiles(dir) {
    return listDirNames(dir).filter((n) => n.endsWith('.json'))
  }

  function loadConfig() {
    const cfg = { temperature: 0.6, maxTokens: 2500, historyTail: 12 }
    const text = readText(dataDir + '/.env')
    if (text) {
      for (const line of text.split(/\r?\n/)) {
        const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/)
        if (!m) continue
        const key = m[1]; const value = m[2]
        if (key === 'AI_TEMPERATURE') cfg.temperature = Number(value) || cfg.temperature
        else if (key === 'AI_MAX_TOKENS') cfg.maxTokens = Number(value) || cfg.maxTokens
        else if (key === 'HISTORY_TAIL') cfg.historyTail = Number(value) || cfg.historyTail
      }
    }
    return cfg
  }

  function cleanJson(text) {
    if (!text) return null
    let s = text.trim().replace(/^\uFEFF/, '')
    s = s.replace(/^```(?:json)?/i, '').replace(/```\s*$/, '').trim()
    const a = s.indexOf('{'); const b = s.lastIndexOf('}')
    if (a !== -1 && b !== -1 && b > a) s = s.slice(a, b + 1)
    try { return JSON.parse(s) } catch (e) {
      s = s.replace(/,\s*([}\]])/g, '$1')
      try { return JSON.parse(s) } catch (e2) { return null }
    }
  }

  function replaceAll(text, map) {
    for (const k of Object.keys(map)) {
      text = text.split('{' + k + '}').join(String(map[k] === undefined || map[k] === null ? '' : map[k]))
    }
    return text
  }

  // ---------- 世界数据 ----------
  function loadWorldsIndex() {
    const idx = readJson(dataDir + '/worlds/worlds_index.json')
    return idx || { worlds: [], current_world: '' }
  }

  function loadWorld(worldId) {
    const base = worldPath(worldId)
    const worldview = readText(base + '/worldview.txt')
    const locations = readJson(base + '/locations.json')
    const npcs = readJson(base + '/npcs.json')
    return {
      worldview: worldview || '',
      locations: locations || { regions: [], locations: [] },
      npcs: npcs || { npcs: [] },
    }
  }

  function listCharacters(worldId) {
    const dir = worldPath(worldId) + '/sessions/characters'
    const chars = []
    for (const name of listJsonFiles(dir)) {
      const data = readJson(dir + '/' + name)
      if (!data) continue
      chars.push({
        id: data.character_id,
        name: data.profile ? data.profile.name : name.replace('.json', ''),
        scene: data.status ? data.status.current_scene : '',
        isDead: data.status ? !!data.status.is_dead : false,
      })
    }
    return chars
  }

  function locationByName(locations, nameOrId) {
    const list = locations.locations || []
    return list.find((l) => l.name === nameOrId || l.id === nameOrId) || null
  }

  function npcsAtScene(npcs, loc) {
    if (!loc) return []
    return (npcs.npcs || []).filter((n) => n.location_id === loc.id && n.active !== false && !n.dead)
  }

  function npcSummary(npc) {
    const p = npc.profile || {}
    return npc.name + '（' + (p.identity || '') + '）：' + (p.description || '')
  }

  function buildHistoryText(char, tail) {
    const h = char.conversation_history || []
    return h.slice(-tail).map((m) => (m.speaker || '?') + '：' + (m.content || '')).join('\n')
  }

  const FALLBACK_PROMPT = [
    '你是小说文字游戏的引擎主脑。玩家扮演主角，与你合作续写故事；你不能替玩家说话和做决定。',
    '',
    '世界观设定：',
    '{world_setting}',
    '',
    '之前经历的情节：',
    '{history_text}',
    '',
    '玩家最新输入：',
    '{user_input}',
    '',
    '当前场景：{scene_name}',
    '已有地点库：',
    '{existing_locations}',
    '',
    '玩家（主角）：',
    '角色名：{player_name}',
    '身份：{player_identity}',
    '外貌：{player_appearance}',
    '性格：{player_personality}',
    '背景：{player_background}',
    '',
    '当前场景中的其他NPC（与玩家不同的独立角色）：',
    '{npc_info}',
    '',
    '输出要求：只输出一个 JSON 对象：',
    '- description: 整体环境描写（0-150字，第二人称"你"指代玩家；可省略或为空字符串）',
    '- reactions: 数组，每个元素是该场景中一个NPC对玩家行动的反应：{"npc":"NPC名","content":"反应（40-120字）","emotion":"情绪"}。选择2-4个最相关NPC反应（至少1个），"npc"必须来自{npc_info}，严禁编造',
    '- is_dead: 布尔值',
    '- new_location: 玩家位置变化时为新场景名，否则 null',
    '- relationship_update: 态度显著变化时返回 {"NPC名":"新态度"}，否则 null',
    '只输出 JSON。',
  ].join('\n')

  function buildActPrompt(char, world, sceneName, userInput, cfg) {
    const template = readText(dataDir + '/prompts/environment.txt') || FALLBACK_PROMPT
    const loc = locationByName(world.locations, sceneName)
    const npcs = npcsAtScene(world.npcs, loc)
    const locLines = (world.locations.locations || []).map((l) => '- ' + l.name + '：' + (l.description || '')).join('\n')
    const npcLines = npcs.map(npcSummary).join('\n') || '（无）'
    const p = char.profile || {}
    return replaceAll(template, {
      world_setting: (world.worldview || '').slice(0, 3000),
      history_text: buildHistoryText(char, cfg.historyTail) || '（尚未发生）',
      user_input: userInput,
      scene_name: sceneName,
      existing_locations: locLines,
      player_name: p.name || '玩家',
      player_identity: p.identity || '',
      player_appearance: p.appearance || '',
      player_personality: p.personality || '',
      player_background: p.background || '',
      npc_info: npcLines,
    })
  }

  // ---------- handlers ----------
  function handleWorlds() {
    const idx = loadWorldsIndex()
    return { worlds: idx.worlds || [], currentWorld: idx.current_world || '' }
  }

  function handleBoot(args) {
    const idx = loadWorldsIndex()
    const worldId = safeId((args && args.worldId) || idx.current_world || ((idx.worlds[0] || {}).id) || '')
    if (!worldId) return { error: 'no world' }
    const world = loadWorld(worldId)
    const characters = listCharacters(worldId)
    const meta = (idx.worlds || []).find((w) => w.id === worldId) || {}
    return {
      worldId,
      worldName: meta.name || worldId,
      worldview: world.worldview,
      locations: world.locations,
      npcs: world.npcs,
      characters,
    }
  }

  function handleCreateCharacter(args) {
    const worldId = safeId(args.worldId)
    const p = args.profile || {}
    const world = loadWorld(worldId)
    const first = (world.locations.locations || [])[0]
    const charId = 'char_' + Date.now()
    const now = new Date().toISOString()
    const char = {
      character_id: charId,
      world_id: worldId,
      created_at: now,
      last_played: now,
      profile: {
        name: p.name || '无名旅人',
        gender: p.gender || '',
        identity: p.identity || '旅人',
        appearance: p.appearance || '',
        personality: p.personality || '沉默寡言',
        background: p.background || '',
      },
      status: { is_dead: false, death_cause: null, health: 100, current_scene: first ? first.name : '' },
      relationships: {},
      inventory: [],
      conversation_history: [],
    }
    writeJson(charPath(worldId, charId), char)
    return { characterId: charId, name: char.profile.name, scene: char.status.current_scene }
  }

  function handleState(args) {
    const worldId = safeId(args.worldId)
    const charId = safeId(args.characterId)
    const char = readJson(charPath(worldId, charId))
    if (!char) return { character: null }
    const world = loadWorld(worldId)
    const sceneName = char.status.current_scene
    const loc = locationByName(world.locations, sceneName)
    const npcs = npcsAtScene(world.npcs, loc)
    return {
      character: {
        id: char.character_id,
        name: char.profile.name,
        scene: sceneName,
        isDead: !!char.status.is_dead,
        relationships: char.relationships || {},
      },
      sceneNpcs: npcs.map((n) => ({ id: n.id, name: n.name, identity: (n.profile || {}).identity || '', description: (n.profile || {}).description || '', avatar: n.avatar || '' })),
      historyTail: (char.conversation_history || []).slice(-8).map((m) => ({
        speaker: m.speaker || '',
        content: m.content || '',
        avatar: m.avatar || '',
        isDead: !!m.is_dead,
      })),
    }
  }

  async function handleAct(args) {
    const worldId = safeId(args.worldId)
    const charId = safeId(args.characterId)
    const userInput = String(args.userInput || '').trim()
    if (!userInput) return { error: 'empty input' }
    const char = readJson(charPath(worldId, charId))
    if (!char) return { error: 'character not found' }
    const cfg = loadConfig()
    const world = loadWorld(worldId)
    const sceneName = char.status.current_scene
    const prompt = buildActPrompt(char, world, sceneName, userInput, cfg)
    const raw = await callAI(prompt, cfg)
    const parsed = cleanJson(raw)
    if (!parsed) return { error: 'AI 输出无法解析', raw: (raw || '').slice(0, 500) }
    const now = new Date().toISOString()
    const history = char.conversation_history || []
    // 群像反应：旁白一条 + 每个 NPC 反应各一条（各自带头像）
    const newEntries = []
    if (parsed.description && String(parsed.description).trim()) {
      const narr = { speaker: '旁白', content: String(parsed.description).trim(), scene: sceneName, is_dead: !!parsed.is_dead, timestamp: now }
      history.push(narr)
      newEntries.push({ speaker: '旁白', content: narr.content, avatar: '' })
    }
    const reactions = Array.isArray(parsed.reactions) ? parsed.reactions : []
    for (const r of reactions) {
      const name = String((r && r.npc) || '').trim()
      const content = String((r && r.content) || '').trim()
      if (!name || !content) continue
      const npc = (world.npcs.npcs || []).find((n) => n.name === name || n.id === name)
      const entry = {
        speaker: npc ? npc.name : name,
        content,
        scene: sceneName,
        is_dead: false,
        timestamp: now,
        avatar: npc ? (npc.avatar || '') : '',
      }
      history.push(entry)
      newEntries.push({ speaker: entry.speaker, content, avatar: entry.avatar })
    }
    if (newEntries.length === 0) {
      return { error: 'AI 输出缺少内容（无描述也无角色反应）', raw: (raw || '').slice(0, 500) }
    }
    let newScene = null
    if (parsed.new_location) {
      newScene = String(parsed.new_location)
      char.status.current_scene = newScene
      history.push({ speaker: '系统', content: '🕹️ 场景已切换至：' + newScene, scene: newScene, is_dead: false, timestamp: new Date().toISOString() })
    }
    if (parsed.is_dead) {
      char.status.is_dead = true
      char.status.death_cause = parsed.description
    }
    if (parsed.relationship_update && typeof parsed.relationship_update === 'object') {
      char.relationships = char.relationships || {}
      for (const k of Object.keys(parsed.relationship_update)) char.relationships[k] = parsed.relationship_update[k]
    }
    char.conversation_history = history
    char.last_played = now
    writeJson(charPath(worldId, charId), char)
    const loc = locationByName(world.locations, char.status.current_scene)
    return {
      entries: newEntries,
      description: parsed.description || '',
      isDead: !!char.status.is_dead,
      newLocation: newScene,
      relationships: char.relationships,
      scene: char.status.current_scene,
      sceneNpcs: npcsAtScene(world.npcs, loc).map((n) => ({ id: n.id, name: n.name, identity: (n.profile || {}).identity || '', avatar: n.avatar || '' })),
    }
  }

  function handleDiag() {
    const diag = { dataDir, ok: {} }
    try {
      const idx = loadWorldsIndex()
      diag.worldsIndex = idx
    } catch (e) { diag.indexError = String(e) }
    try {
      const world = loadWorld('tavern')
      diag.tavern = {
        worldviewLen: (world.worldview || '').length,
        locations: (world.locations.locations || []).map((l) => l.name),
        npcs: (world.npcs.npcs || []).map((n) => n.name),
      }
    } catch (e) { diag.tavernError = String(e) }
    try {
      diag.config = loadConfig()
    } catch (e) { diag.configError = String(e) }
    return diag
  }

  return { worlds: handleWorlds, boot: handleBoot, createCharacter: handleCreateCharacter, state: handleState, act: handleAct, diag: handleDiag }
}
