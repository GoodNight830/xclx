/**
 * 数据访问层（替代 Dexie/IndexedDB，基于 wx.storage）。
 *
 * wx.storage 的限制：
 * - 单 key 最大 1MB，总容量 10MB
 * - 无索引、无查询，全部读取后在内存中过滤
 *
 * 每张表用一个 key 存储 JSON 数组，读写时整体序列化/反序列化。
 * 本层提供与原 Dexie repository 相同的接口语义，页面/服务不直接访问 wx.storage。
 */

const { STORAGE_PREFIX } = require('./config')

// 表名 -> 存储 key
const TABLES = {
  sessions: STORAGE_PREFIX + ':sessions',
  questions: STORAGE_PREFIX + ':questions',
  wrongQuestions: STORAGE_PREFIX + ':wrongQuestions',
  weakPatterns: STORAGE_PREFIX + ':weakPatterns',
  settings: STORAGE_PREFIX + ':settings',
  activeSessions: STORAGE_PREFIX + ':activeSessions',
  aiAnalysisSnapshots: STORAGE_PREFIX + ':aiAnalysisSnapshots',
  bookmarks: STORAGE_PREFIX + ':bookmarks'
}

function readTable(table) {
  try {
    const raw = wx.getStorageSync(TABLES[table])
    if (Array.isArray(raw)) return raw
    return []
  } catch (e) {
    return []
  }
}

function writeTable(table, list) {
  wx.setStorageSync(TABLES[table], list)
}

// 深层克隆，避免响应式/引用问题（原 toPlain 的等价实现）
function toPlain(value) {
  if (value === undefined || value === null) return value
  if (typeof value !== 'object') return value
  return JSON.parse(JSON.stringify(value))
}

/* ---------- 通用 CRUD ---------- */

function getAll(table) {
  return readTable(table)
}

function getById(table, id) {
  return readTable(table).find((item) => item.id === id) || null
}

function put(table, item) {
  const list = readTable(table)
  const idx = list.findIndex((x) => x.id === item.id)
  const plain = toPlain(item)
  if (idx >= 0) list[idx] = plain
  else list.push(plain)
  writeTable(table, list)
}

function bulkPut(table, items) {
  if (items.length === 0) return
  const list = readTable(table)
  const map = new Map(list.map((x) => [x.id, x]))
  for (const item of items) {
    map.set(item.id, toPlain(item))
  }
  writeTable(table, [...map.values()])
}

function remove(table, id) {
  const list = readTable(table)
  writeTable(table, list.filter((x) => x.id !== id))
}

function clear(table) {
  writeTable(table, [])
}

/* ---------- sessions ---------- */
const sessionsRepo = {
  putSession(session) { put('sessions', session) },
  getSession(id) { return getById('sessions', id) },
  listSessions(query) {
    const q = query || {}
    return readTable('sessions')
      .filter((s) => (q.module ? s.module === q.module : true))
      .filter((s) => (q.mode ? s.mode === q.mode : true))
      .filter((s) => (q.status ? s.status === q.status : true))
      .filter((s) => (q.since ? s.startedAt >= q.since : true))
      .filter((s) => (q.until ? s.startedAt <= q.until : true))
      .sort((a, b) => b.startedAt.localeCompare(a.startedAt))
      .slice(q.offset || 0, (q.offset || 0) + (q.limit || Number.MAX_SAFE_INTEGER))
  },
  listFinishedSessions(module) { return sessionsRepo.listSessions({ module, status: 'finished' }) },
  countSessions(module) {
    const all = readTable('sessions')
    return module ? all.filter((s) => s.module === module).length : all.length
  },
  deleteSession(id) { remove('sessions', id) },
  deleteAllSessions() { clear('sessions') }
}

/* ---------- questions ---------- */
const questionsRepo = {
  putQuestion(record) { put('questions', record) },
  bulkPutQuestions(records) { bulkPut('questions', records) },
  getQuestion(id) { return getById('questions', id) },
  listQuestionsBySession(sessionId) {
    return readTable('questions')
      .filter((q) => q.sessionId === sessionId)
      .sort((a, b) => a.questionIndex - b.questionIndex)
  },
  listQuestions(query) {
    const q = query || {}
    return readTable('questions')
      .filter((x) => (q.module ? x.module === q.module : true))
      .filter((x) => (q.since ? x.createdAt >= q.since : true))
      .filter((x) => (q.until ? x.createdAt <= q.until : true))
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
  },
  recentQuestionKeys(module, limit) {
    const n = limit || 100
    const keys = readTable('questions')
      .filter((q) => q.module === module)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, n)
      .map((q) => q.dividend + ':' + q.divisor)
    return new Set(keys)
  },
  countQuestions(module) {
    const all = readTable('questions')
    return module ? all.filter((q) => q.module === module).length : all.length
  },
  deleteQuestion(id) { remove('questions', id) },
  deleteAllQuestions() { clear('questions') }
}

/* ---------- wrongQuestions ---------- */
const wrongQuestionsRepo = {
  getWrongQuestion(id) { return getById('wrongQuestions', id) },
  getWrongQuestionByKey(questionKey) {
    return readTable('wrongQuestions').find((q) => q.questionKey === questionKey) || null
  },
  putWrongQuestion(question) { put('wrongQuestions', question) },
  bulkPutWrongQuestions(questions) { bulkPut('wrongQuestions', questions) },
  listWrongQuestions(query) {
    const q = query || {}
    return readTable('wrongQuestions')
      .filter((x) => (q.module ? x.module === q.module : true))
      .filter((x) => (q.status ? x.status === q.status : true))
      .filter((x) => (q.rangeMin !== undefined ? x.divisor >= q.rangeMin : true))
      .filter((x) => (q.rangeMax !== undefined ? x.divisor <= q.rangeMax : true))
      .sort((a, b) => b.lastWrongAt.localeCompare(a.lastWrongAt))
  },
  markWrongQuestionMastered(id, mastered) {
    const existing = wrongQuestionsRepo.getWrongQuestion(id)
    if (!existing) return null
    const now = new Date().toISOString()
    const updated = { ...existing, status: mastered ? 'mastered' : 'active', masteredAt: mastered ? now : null, updatedAt: now }
    put('wrongQuestions', updated)
    return updated
  },
  bulkMarkMastered(ids, mastered) {
    const now = new Date().toISOString()
    const list = readTable('wrongQuestions')
    let count = 0
    for (const item of list) {
      if (ids.includes(item.id)) {
        item.status = mastered ? 'mastered' : 'active'
        item.masteredAt = mastered ? now : null
        item.updatedAt = now
        count += 1
      }
    }
    writeTable('wrongQuestions', list)
    return count
  },
  deleteWrongQuestion(id) { remove('wrongQuestions', id) },
  clearWrongQuestions() { clear('wrongQuestions') },
  countWrongQuestions(status) {
    const all = readTable('wrongQuestions')
    return status ? all.filter((q) => q.status === status).length : all.length
  },
  groupWrongQuestionsByRange(questions, rangeSize) {
    const buckets = new Map()
    for (const q of questions) {
      const min = Math.floor(q.divisor / rangeSize) * rangeSize
      buckets.set(min, (buckets.get(min) || 0) + 1)
    }
    return [...buckets.entries()]
      .map(([rangeMin, count]) => ({ rangeMin, rangeMax: rangeMin + rangeSize - 1, count }))
      .sort((a, b) => a.rangeMin - b.rangeMin)
  }
}

/* ---------- weakPatterns ---------- */
const weakPatternsRepo = {
  listWeakPatterns(module) {
    const all = module
      ? readTable('weakPatterns').filter((p) => p.module === module)
      : readTable('weakPatterns')
    return all.sort((a, b) => b.reinforcementWeight - a.reinforcementWeight || a.rangeMin - b.rangeMin)
  },
  replaceWeakPatterns(patterns, module) {
    const rest = module ? readTable('weakPatterns').filter((p) => p.module !== module) : []
    writeTable('weakPatterns', [...rest, ...patterns.map(toPlain)])
  },
  bulkPutWeakPatterns(patterns) { bulkPut('weakPatterns', patterns) },
  clearWeakPatterns(module) {
    if (module) {
      writeTable('weakPatterns', readTable('weakPatterns').filter((p) => p.module !== module))
      return
    }
    clear('weakPatterns')
  }
}

/* ---------- activeSessions ---------- */
const activeSessionsRepo = {
  getActiveSession(module) {
    const all = readTable('activeSessions')
    const scoped = module ? all.filter((s) => s.module === module) : all
    if (scoped.length === 0) return null
    return scoped.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0]
  },
  listActiveSessions() {
    return readTable('activeSessions').sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  },
  putActiveSession(session) {
    put('activeSessions', { ...session, updatedAt: new Date().toISOString() })
  },
  clearActiveSession(id) { remove('activeSessions', id) },
  clearAllActiveSessions() { clear('activeSessions') }
}

/* ---------- settings ---------- */
const SETTINGS_KEY = 'app-settings'

function clamp(value, min, max, fallback) {
  if (!Number.isFinite(value)) return fallback
  return Math.min(max, Math.max(min, value))
}

function normalizeBaseUrl(value) {
  const trimmed = (value || '').trim()
  const markdownUrl = trimmed.match(/\]\((https?:\/\/[^)]+)\)/i)
  const plainUrl = trimmed.match(/https?:\/\/[^\s\])]+/i)
  return (markdownUrl ? markdownUrl[1] : plainUrl ? plainUrl[0] : trimmed).replace(/\/$/, '')
}

function safeHostname(value) {
  try { return new URL(value).hostname } catch (e) { return '' }
}

function normalizeSettings(input) {
  const { DEFAULT_APP_SETTINGS, DEFAULT_WEAK_PATTERN_CONFIG, DEFAULT_AI_SETTINGS, QUESTION_COUNT, ALLOWED_ERROR_RATE } = require('./config')
  const raw = input || {}
  const weakRaw = raw.weakPattern || {}
  const weak = {
    ...DEFAULT_WEAK_PATTERN_CONFIG,
    ...weakRaw,
    minSampleCount: clamp(Number(weakRaw.minSampleCount !== undefined ? weakRaw.minSampleCount : DEFAULT_WEAK_PATTERN_CONFIG.minSampleCount), 1, 1000, DEFAULT_WEAK_PATTERN_CONFIG.minSampleCount),
    minErrorCount: clamp(Number(weakRaw.minErrorCount !== undefined ? weakRaw.minErrorCount : DEFAULT_WEAK_PATTERN_CONFIG.minErrorCount), 1, 1000, DEFAULT_WEAK_PATTERN_CONFIG.minErrorCount),
    ratioThreshold: clamp(Number(weakRaw.ratioThreshold !== undefined ? weakRaw.ratioThreshold : DEFAULT_WEAK_PATTERN_CONFIG.ratioThreshold), 1, 100, DEFAULT_WEAK_PATTERN_CONFIG.ratioThreshold),
    maxReinforcementRatio: clamp(Number(weakRaw.maxReinforcementRatio !== undefined ? weakRaw.maxReinforcementRatio : DEFAULT_WEAK_PATTERN_CONFIG.maxReinforcementRatio), 0, 0.9, DEFAULT_WEAK_PATTERN_CONFIG.maxReinforcementRatio),
    maxReinforcementWeight: clamp(Number(weakRaw.maxReinforcementWeight !== undefined ? weakRaw.maxReinforcementWeight : DEFAULT_WEAK_PATTERN_CONFIG.maxReinforcementWeight), 0, 1, DEFAULT_WEAK_PATTERN_CONFIG.maxReinforcementWeight),
    rangeSize: [100, 50, 10, 1].includes(Number(weakRaw.rangeSize)) ? Number(weakRaw.rangeSize) : DEFAULT_WEAK_PATTERN_CONFIG.rangeSize,
    enableReinforcement: weakRaw.enableReinforcement !== false
  }
  const aiRaw = raw.ai || DEFAULT_AI_SETTINGS
  const normalizedAiBaseUrl = normalizeBaseUrl(aiRaw.baseUrl !== undefined ? aiRaw.baseUrl : DEFAULT_AI_SETTINGS.baseUrl)
  const knownResponsesProvider = /(^|\.)fastaitoken\.com$/i.test(safeHostname(normalizedAiBaseUrl))
  const knownChatProvider = /(^|\.)deepseek\.com$/i.test(safeHostname(normalizedAiBaseUrl))
  const autoOptions = ['off', 'daily', 'weekly', 'after_30_questions']
  const detailOptions = ['short', 'standard', 'detailed']
  const goalOptions = ['accuracy', 'speed', 'exam', 'maintenance']

  return {
    defaultMode: raw.defaultMode === 'speed' ? 'speed' : 'training',
    defaultQuestionCount: clamp(Number(raw.defaultQuestionCount !== undefined ? raw.defaultQuestionCount : DEFAULT_APP_SETTINGS.defaultQuestionCount), QUESTION_COUNT.min, QUESTION_COUNT.max, DEFAULT_APP_SETTINGS.defaultQuestionCount),
    defaultAllowedErrorRate: clamp(Number(raw.defaultAllowedErrorRate !== undefined ? raw.defaultAllowedErrorRate : DEFAULT_APP_SETTINGS.defaultAllowedErrorRate), ALLOWED_ERROR_RATE.min, ALLOWED_ERROR_RATE.max, DEFAULT_APP_SETTINGS.defaultAllowedErrorRate),
    weakPattern: weak,
    ai: {
      ...DEFAULT_AI_SETTINGS,
      ...aiRaw,
      enabled: aiRaw.enabled === true,
      consentToUpload: aiRaw.consentToUpload === true,
      provider: String(aiRaw.provider !== undefined ? aiRaw.provider : DEFAULT_AI_SETTINGS.provider).slice(0, 80),
      baseUrl: normalizedAiBaseUrl,
      apiKey: String(aiRaw.apiKey || '').trim(),
      model: String(aiRaw.model || '').trim().slice(0, 200),
      wireApi: knownResponsesProvider ? 'responses' : knownChatProvider ? 'chat_completions' : aiRaw.wireApi === 'responses' ? 'responses' : 'chat_completions',
      transport: aiRaw.transport === 'direct' ? 'direct' : 'local_proxy',
      reasoningEffort: ['low', 'medium', 'high'].includes(aiRaw.reasoningEffort) ? aiRaw.reasoningEffort : 'medium',
      autoAnalysis: autoOptions.includes(aiRaw.autoAnalysis) ? aiRaw.autoAnalysis : 'off',
      reportDetail: detailOptions.includes(aiRaw.reportDetail) ? aiRaw.reportDetail : 'standard',
      learningGoal: goalOptions.includes(aiRaw.learningGoal) ? aiRaw.learningGoal : 'accuracy',
      maxOutputTokens: Math.round(clamp(Number(aiRaw.maxOutputTokens !== undefined ? aiRaw.maxOutputTokens : 1200), 300, 4000, 1200))
    }
  }
}

const settingsRepo = {
  getSettings() {
    const list = readTable('settings')
    const row = list.find((r) => r.key === SETTINGS_KEY)
    return normalizeSettings(row ? row.value : null)
  },
  saveSettings(settings) {
    const normalized = normalizeSettings(settings)
    const row = { key: SETTINGS_KEY, value: normalized, updatedAt: new Date().toISOString() }
    const list = readTable('settings').filter((r) => r.key !== SETTINGS_KEY)
    list.push(row)
    writeTable('settings', list)
    return normalized
  },
  resetSettings() {
    const { DEFAULT_APP_SETTINGS, DEFAULT_WEAK_PATTERN_CONFIG, DEFAULT_AI_SETTINGS } = require('./config')
    writeTable('settings', readTable('settings').filter((r) => r.key !== SETTINGS_KEY))
    return { ...DEFAULT_APP_SETTINGS, weakPattern: { ...DEFAULT_WEAK_PATTERN_CONFIG }, ai: { ...DEFAULT_AI_SETTINGS } }
  }
}

/* ---------- aiAnalysisSnapshots ---------- */
const aiSnapshotsRepo = {
  listAiAnalyses(module) {
    return readTable('aiAnalysisSnapshots')
      .filter((s) => s.module === module)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  },
  latestAiAnalysis(module) {
    const rows = aiSnapshotsRepo.listAiAnalyses(module)
    return rows[0] || null
  },
  saveAiAnalysis(snapshot) { put('aiAnalysisSnapshots', snapshot) },
  clearAiAnalyses() { clear('aiAnalysisSnapshots') }
}

/* ---------- bookmarks ---------- */
const bookmarksRepo = {
  getBookmarkByKey(questionKey) {
    return readTable('bookmarks').find((b) => b.questionKey === questionKey) || null
  },
  listBookmarks(module) {
    const all = module
      ? readTable('bookmarks').filter((b) => b.module === module)
      : readTable('bookmarks')
    return all.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  },
  putBookmark(bookmark) { put('bookmarks', bookmark) },
  deleteBookmark(id) { remove('bookmarks', id) },
  countBookmarks() { return readTable('bookmarks').length }
}

module.exports = {
  TABLES, readTable, writeTable, toPlain,
  sessionsRepo, questionsRepo, wrongQuestionsRepo, weakPatternsRepo,
  activeSessionsRepo, settingsRepo, aiSnapshotsRepo, bookmarksRepo
}
