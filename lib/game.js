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
      // 自动注册新地点：AI 解锁的地点若不在地点库中，持久化写入，保证后续 NPC 归属与场景查找不断
      if (!locationByName(world.locations, newScene)) {
        const list = world.locations.locations || []
        list.push({
          id: 'loc_' + Date.now(),
          name: newScene,
          parent: '',
          description: '（AI 探索中发现的地点）',
          icon: '📍',
        })
        world.locations.locations = list
        writeJson(dataDir + '/worlds/' + worldId + '/locations.json', world.locations)
      }
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

  // ---------- 世界管理（供模型工具 / 聊天创建世界） ----------
  function handleCreateWorld(args) {
    const worldId = safeId(args.worldId || '')
    const name = String(args.name || worldId || '').trim()
    if (!worldId) return { error: 'worldId 必填（仅小写字母/数字/下划线）' }
    if (!name) return { error: 'name 必填' }
    const idx = loadWorldsIndex()
    if ((idx.worlds || []).some((w) => w.id === worldId)) return { error: '世界已存在: ' + worldId }
    // 写世界文件（writeText 会自动创建目录）
    writeJson(dataDir + '/worlds/' + worldId + '/locations.json', { regions: [], locations: [] })
    writeJson(dataDir + '/worlds/' + worldId + '/npcs.json', { npcs: [] })
    writeText(dataDir + '/worlds/' + worldId + '/worldview.txt', String(args.worldview || '（尚未设定世界观）'))
    // 更新索引并切换为当前世界
    idx.worlds = idx.worlds || []
    idx.worlds.push({
      id: worldId,
      name,
      description: String(args.description || ''),
      created_at: new Date().toISOString(),
      last_played: null,
    })
    idx.current_world = worldId
    writeJson(dataDir + '/worlds/worlds_index.json', idx)
    return { ok: true, worldId, name, note: '世界已创建。可用 agentnoodle_add_npc 添加 NPC；地点可在面板游玩中由 AI 动态解锁，或手工补 locations.json' }
  }

  function handleListWorlds(args) {
    const idx = loadWorldsIndex()
    const worldId = safeId((args && args.worldId) || '')
    // 详情模式：查看单个世界的完整信息（地点+NPC 名单）
    if (worldId) {
      let world
      try { world = loadWorld(worldId) } catch (e) { return { error: '加载世界失败: ' + String(e) } }
      const npcList = world.npcs.npcs || []
      const locations = (world.locations.locations || []).map((l) => ({
        id: l.id,
        name: l.name,
        parent: l.parent || '',
        icon: l.icon || '',
        description: l.description || '',
        npcs: npcList.filter((n) => n.location_id === l.id && n.active !== false && !n.dead).map((n) => n.name),
      }))
      const npcs = npcList.map((n) => ({
        id: n.id,
        name: n.name,
        identity: (n.profile || {}).identity || '',
        locationId: n.location_id || '',
        avatar: n.avatar || '',
        active: n.active !== false,
        dead: !!n.dead,
      }))
      const characters = listCharacters(worldId)
      const meta = (idx.worlds || []).find((w) => w.id === worldId) || {}
      return {
        worldId,
        name: meta.name || worldId,
        description: meta.description || '',
        worldview: (world.worldview || '').slice(0, 500),
        locations,
        npcs,
        characters,
      }
    }
    // 概览模式：所有世界的统计
    const worlds = (idx.worlds || []).map((w) => {
      let counts = { locations: 0, npcs: 0, characters: 0 }
      try {
        const world = loadWorld(w.id)
        counts = {
          locations: (world.locations.locations || []).length,
          npcs: (world.npcs.npcs || []).length,
          characters: listCharacters(w.id).length,
        }
      } catch (e) { counts.broken = String(e) }
      return { id: w.id, name: w.name, description: w.description || '', ...counts }
    })
    return { currentWorld: idx.current_world || '', worlds }
  }

  function handleAddNpc(args) {
    const worldId = safeId(args.worldId || '')
    const name = String(args.name || '').trim()
    if (!worldId || !name) return { error: 'worldId 和 name 必填' }
    let world
    try { world = loadWorld(worldId) } catch (e) { return { error: '加载世界失败: ' + String(e) } }
    const loc = args.locationId ? locationByName(world.locations, String(args.locationId)) : null
    if (!loc) {
      const available = (world.locations.locations || []).map((l) => l.id + '(' + l.name + ')').join(', ')
      return { error: 'locationId 无效。可用地点: ' + (available || '（世界暂无地点）') }
    }
    const p = args.profile || {}
    const npc = {
      id: 'npc_' + Date.now(),
      name,
      gender: p.gender || args.gender || '',
      profile: {
        identity: p.identity || args.identity || '居民',
        description: p.description || args.description || '',
        personality_traits: Array.isArray(args.personalityTraits) ? args.personalityTraits : [],
        background: p.background || args.background || '',
      },
      location_id: loc.id,
      active: true,
      dead: false,
    }
    if (args.avatar) npc.avatar = String(args.avatar)
    world.npcs.npcs = world.npcs.npcs || []
    world.npcs.npcs.push(npc)
    writeJson(dataDir + '/worlds/' + worldId + '/npcs.json', world.npcs)
    return { ok: true, id: npc.id, name: npc.name, locationId: loc.id, locationName: loc.name, note: 'NPC 已添加；刷新面板可见（有头像文件可传 avatar=文件名）' }
  }

  function handleAddLocation(args) {
    const worldId = safeId(args.worldId || '')
    const name = String(args.name || '').trim()
    if (!worldId || !name) return { error: 'worldId 和 name 必填' }
    let world
    try { world = loadWorld(worldId) } catch (e) { return { error: '加载世界失败: ' + String(e) } }
    const list = world.locations.locations || []
    const locId = safeId(args.locationId || ('loc_' + Date.now()))
    if (list.some((l) => l.id === locId)) return { error: '地点 ID 已存在: ' + locId }
    list.push({
      id: locId,
      name,
      parent: String(args.parent || ''),
      description: String(args.description || ''),
      icon: String(args.icon || '📍'),
    })
    world.locations.locations = list
    writeJson(dataDir + '/worlds/' + worldId + '/locations.json', world.locations)
    return { ok: true, id: locId, name, note: '地点已添加；可用 agentnoodle_add_npc 向此地点加 NPC（locationId=' + locId + '）' }
  }

  // ---------- 从零建世界：世界观迭代 + AI 生成地点/NPC ----------
  function handleUpdateWorldview(args) {
    const worldId = safeId(args.worldId || '')
    const worldview = String(args.worldview || '').trim()
    if (!worldId || !worldview) return { error: 'worldId 和 worldview 必填' }
    writeText(dataDir + '/worlds/' + worldId + '/worldview.txt', worldview)
    return { ok: true, worldId, note: '世界观已更新；可用 agentnoodle_generate_content 生成地点/NPC' }
  }

  const FALLBACK_LOCATIONS = [
    '你是一个游戏世界地点生成器。根据以下世界观，生成初始的地点库（1 个以上区域，每区域 1 个以上场景）。',
    '世界观：',
    '{world_setting}',
    '输出 JSON：{"regions":[{"id":"xx_region","name":"区域名","description":"描述","icon":"emoji"}],"locations":[{"id":"xx","name":"场景名","parent":"区域id","description":"描述","icon":"emoji"}]}。ID 用英文/拼音小写下划线。只输出 JSON。',
  ].join('\n')

  const FALLBACK_NPCS = [
    '你是一个游戏 NPC 生成器。根据世界观和地点列表生成 NPC。',
    '世界观：',
    '{world_setting}',
    '地点列表：',
    '{locations}',
    '输出 JSON：{"npcs":[{"id":"npc_<地点id>_<序号>","name":"名字","gender":"性别","profile":{"identity":"身份","description":"描述","personality_traits":["性格"],"background":"背景"},"location_id":"<必须来自地点列表>","active":true,"dead":false,"favorability":50}]}。只输出 JSON。',
  ].join('\n')

  async function generateLocations(worldId, world, cfg) {
    const template = readText(dataDir + '/prompts/generate_locations.txt') || FALLBACK_LOCATIONS
    const prompt = replaceAll(template, { world_setting: world.worldview })
    const raw = await callAI(prompt, cfg)
    const parsed = cleanJson(raw)
    if (!parsed || !Array.isArray(parsed.locations)) return { error: 'AI 返回的地点 JSON 无法解析', raw: (raw || '').slice(0, 300) }
    const seen = new Set()
    const locations = []
    for (const l of parsed.locations) {
      const id = safeId(l && l.id)
      const name = String((l && l.name) || '').trim()
      if (!id || !name || seen.has(id)) continue
      seen.add(id)
      locations.push({ id, name, parent: String((l && l.parent) || ''), description: String((l && l.description) || ''), icon: String((l && l.icon) || '📍') })
    }
    if (locations.length === 0) return { error: '生成的 locations 为空或无效' }
    const regions = (Array.isArray(parsed.regions) ? parsed.regions : []).map((r) => ({ id: safeId(r && r.id), name: String((r && r.name) || ''), description: String((r && r.description) || ''), icon: String((r && r.icon) || '🗺️') })).filter((r) => r.id && r.name)
    writeJson(dataDir + '/worlds/' + worldId + '/locations.json', { regions, locations })
    return { stage: 'locations', ok: true, count: locations.length, note: locations.map((l) => l.name).join('、') }
  }

  async function generateNpcs(worldId, world, cfg) {
    const template = readText(dataDir + '/prompts/generate_npcs.txt') || FALLBACK_NPCS
    const locList = (world.locations.locations || []).map((l) => l.id + ' - ' + l.name).join('\n') || '（无地点）'
    const prompt = replaceAll(template, { world_setting: world.worldview, locations: locList })
    const raw = await callAI(prompt, cfg)
    const parsed = cleanJson(raw)
    if (!parsed || !Array.isArray(parsed.npcs)) return { error: 'AI 返回的 NPC JSON 无法解析', raw: (raw || '').slice(0, 300) }
    const validLocIds = new Set((world.locations.locations || []).map((l) => l.id))
    const seen = new Set()
    const npcs = []
    for (const n of parsed.npcs) {
      const name = String((n && n.name) || '').trim()
      const locId = String((n && n.location_id) || '')
      if (!name || !locId) continue
      if (!validLocIds.has(locId)) continue // 校验：location_id 必须来自地点库
      let id = safeId(n && n.id)
      if (!id || seen.has(id)) id = 'npc_' + locId + '_' + (npcs.length + 1)
      if (seen.has(id)) continue
      seen.add(id)
      const p = (n && n.profile) || {}
      const npc = {
        id,
        name,
        gender: String((n && n.gender) || p.gender || ''),
        profile: {
          identity: String(p.identity || ''),
          description: String(p.description || ''),
          personality_traits: Array.isArray(p.personality_traits) ? p.personality_traits : [],
          background: String(p.background || ''),
        },
        location_id: locId,
        active: true,
        dead: false,
      }
      if (typeof n.favorability === 'number') npc.favorability = n.favorability
      if (n.avatar) npc.avatar = String(n.avatar)
      npcs.push(npc)
    }
    if (npcs.length === 0) return { error: '生成的 npcs 为空或全部被校验拒绝（location_id 不在地点库）', raw: (raw || '').slice(0, 300) }
    writeJson(dataDir + '/worlds/' + worldId + '/npcs.json', { npcs })
    return { stage: 'npcs', ok: true, count: npcs.length, note: npcs.map((n) => n.name).join('、') }
  }

  async function handleGenerateContent(args) {
    const worldId = safeId(args.worldId || '')
    const stage = String(args.stage || 'all')
    if (!worldId) return { error: 'worldId 必填' }
    if (!['locations', 'npcs', 'all'].includes(stage)) return { error: 'stage 必须是 locations / npcs / all' }
    let world
    try { world = loadWorld(worldId) } catch (e) { return { error: '加载世界失败: ' + String(e) } }
    if (!(world.worldview || '').trim()) return { error: '该世界还没有世界观，先用 agentnoodle_update_worldview 写入' }
    const cfg = loadConfig()
    const results = []
    if (stage === 'locations' || stage === 'all') {
      const r = await generateLocations(worldId, world, cfg)
      results.push(r)
      if (r.error) return { ok: false, worldId, stage, results }
      world = loadWorld(worldId) // 重新加载，NPC 生成基于新地点库
    }
    if (stage === 'npcs' || stage === 'all') {
      const r = await generateNpcs(worldId, world, cfg)
      results.push(r)
      if (r.error) return { ok: false, worldId, stage, results }
    }
    return { ok: true, worldId, stage, results }
  }

  return {
    worlds: handleWorlds,
    boot: handleBoot,
    createCharacter: handleCreateCharacter,
    state: handleState,
    act: handleAct,
    diag: handleDiag,
    createWorld: handleCreateWorld,
    listWorlds: handleListWorlds,
    addNpc: handleAddNpc,
    addLocation: handleAddLocation,
    updateWorldview: handleUpdateWorldview,
    generateContent: handleGenerateContent,
  }
}
