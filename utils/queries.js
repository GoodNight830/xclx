/**
 * 页面读取服务（迁移自 services/queries.ts）。
 * 页面只通过本文件读取/修改数据，不直接访问 storage。
 */

const { MODULE_FIVE_DIVIDE_THREE } = require('./config')
const storage = require('./storage')
const { accuracyOf, buildDailySummaries, summarizeRange, summarize } = require('./statistics')
const { loadSessionAnalysisData, recomputeWeakPatterns } = require('./training')
const { rangeStartDate } = require('./format')
const { buildLocalDiagnosis } = require('./diagnosis')
const { newId } = require('./id')
const { requestAiReport, PROMPT_VERSION } = require('./aiAnalysis')
const { findArithmeticModule } = require('./registry')

function loadOverview(module) {
  const mid = module || MODULE_FIVE_DIVIDE_THREE
  const analysis = loadSessionAnalysisData(mid)
  const wrongQuestions = storage.wrongQuestionsRepo.listWrongQuestions({ module: mid })
  const weakPatterns = storage.weakPatternsRepo.listWeakPatterns(mid)
  const activeSession = storage.activeSessionsRepo.getActiveSession(mid)

  return {
    today: summarizeRange(analysis.sessions, analysis.records, 'today'),
    total: summarize(analysis.sessions, analysis.records),
    wrongQuestionCount: wrongQuestions.length,
    unmasteredWrongCount: wrongQuestions.filter((q) => q.status === 'active').length,
    masteredWrongCount: wrongQuestions.filter((q) => q.status === 'mastered').length,
    weakPatterns,
    hasUnfinishedTraining: activeSession !== null
  }
}

function loadHistory(range, module) {
  const mid = module || MODULE_FIVE_DIVIDE_THREE
  const analysis = loadSessionAnalysisData(mid)
  const now = new Date()
  const since = rangeStartDate(range, now) ? rangeStartDate(range, now).toISOString() : null
  const sessions = analysis.sessions.filter((s) => (since ? s.startedAt >= since : true))
  const records = analysis.records.filter((r) => (since ? r.createdAt >= since : true))

  return {
    summary: summarize(sessions, records),
    daily: buildDailySummaries(analysis.sessions, range, now),
    sessions
  }
}

function loadSessionRecords(sessionId) {
  return storage.questionsRepo.listQuestionsBySession(sessionId)
}

function loadSession(sessionId) {
  return storage.sessionsRepo.getSession(sessionId)
}

function loadWrongQuestions(filter) {
  return storage.wrongQuestionsRepo.listWrongQuestions(filter || {})
}

function setWrongQuestionMastered(id, mastered) {
  return storage.wrongQuestionsRepo.markWrongQuestionMastered(id, mastered)
}

function setManyWrongQuestionsMastered(ids, mastered) {
  return storage.wrongQuestionsRepo.bulkMarkMastered(ids, mastered)
}

function removeWrongQuestion(id) {
  storage.wrongQuestionsRepo.deleteWrongQuestion(id)
}

function loadWrongQuestionRanges(module, rangeSize) {
  const mid = module || MODULE_FIVE_DIVIDE_THREE
  const list = storage.wrongQuestionsRepo.listWrongQuestions({ module: mid, status: 'active' })
  return storage.wrongQuestionsRepo.groupWrongQuestionsByRange(list, rangeSize || 100)
}

function loadWrongQuestionById(id) {
  return storage.wrongQuestionsRepo.getWrongQuestion(id)
}

function loadWeakPatterns(module) {
  return storage.weakPatternsRepo.listWeakPatterns(module || MODULE_FIVE_DIVIDE_THREE)
}

function refreshWeakPatterns(config, module) {
  return recomputeWeakPatterns(module || MODULE_FIVE_DIVIDE_THREE, config)
}

function loadDataCounts() {
  return {
    sessions: storage.sessionsRepo.countSessions(),
    questions: storage.questionsRepo.countQuestions(),
    wrongQuestions: storage.wrongQuestionsRepo.countWrongQuestions(),
    weakPatterns: storage.weakPatternsRepo.listWeakPatterns().length
  }
}

function loadDiagnosis(module) {
  const mid = module || MODULE_FIVE_DIVIDE_THREE
  const analysis = loadSessionAnalysisData(mid)
  const aiHistory = storage.aiSnapshotsRepo.listAiAnalyses(mid)
  const latestAi = aiHistory[0] || null
  return {
    diagnosis: buildLocalDiagnosis(analysis.records, mid, { lastAiQuestionCount: latestAi ? latestAi.questionCount : 0 }),
    latestAi,
    aiHistory
  }
}

function maybeAutoAnalyze(module) {
  const mid = module || MODULE_FIVE_DIVIDE_THREE
  const mod = findArithmeticModule(mid)
  if (!mod || !mod.meta.aiSupported) return false

  const settings = storage.settingsRepo.getSettings()
  const ai = settings.ai
  if (!ai.enabled || !ai.consentToUpload || !ai.model || ai.autoAnalysis === 'off') return false

  const analysis = loadSessionAnalysisData(mid)
  const latestAi = storage.aiSnapshotsRepo.latestAiAnalysis(mid)
  const diagnosis = buildLocalDiagnosis(analysis.records, mid, { lastAiQuestionCount: latestAi ? latestAi.questionCount : 0 })
  if (diagnosis.questionCountSinceLastAi < 30) return false
  if (latestAi && latestAi.dataHash === diagnosis.dataHash) return false

  const DAY = 86400000
  if (latestAi) {
    const lastMs = Date.parse(latestAi.createdAt)
    if (Number.isFinite(lastMs)) {
      const elapsed = Date.now() - lastMs
      if (ai.autoAnalysis === 'daily' && elapsed < DAY) return false
      if (ai.autoAnalysis === 'weekly' && elapsed < 7 * DAY) return false
    }
  }

  return requestAiReport(ai, diagnosis).then((report) => {
    const snapshot = {
      id: newId(),
      module: mid,
      createdAt: new Date().toISOString(),
      dataHash: diagnosis.dataHash,
      questionCount: diagnosis.lifetime.sampleCount,
      model: ai.model,
      promptVersion: PROMPT_VERSION,
      report
    }
    storage.aiSnapshotsRepo.saveAiAnalysis(snapshot)
    return true
  }).catch(() => false)
}

/* ---------- 收藏与笔记 ---------- */

function loadBookmarks(module) {
  return storage.bookmarksRepo.listBookmarks(module)
}

function toggleBookmark(target) {
  const questionKey = target.dividend + ':' + target.divisor
  const existing = storage.bookmarksRepo.getBookmarkByKey(questionKey)
  if (existing) {
    storage.bookmarksRepo.deleteBookmark(existing.id)
    return { bookmarks: storage.bookmarksRepo.listBookmarks(), bookmarked: false }
  }
  const now = new Date().toISOString()
  const bookmark = {
    id: newId(),
    module: target.module,
    questionKey,
    question: target.question,
    dividend: target.dividend,
    divisor: target.divisor,
    correctAnswer: target.correctAnswer,
    note: '',
    createdAt: now,
    updatedAt: now
  }
  storage.bookmarksRepo.putBookmark(bookmark)
  return { bookmarks: storage.bookmarksRepo.listBookmarks(), bookmarked: true }
}

function updateBookmarkNote(id, note) {
  const found = storage.bookmarksRepo.listBookmarks().find((b) => b.id === id)
  if (!found) return null
  const updated = { ...found, note, updatedAt: new Date().toISOString() }
  storage.bookmarksRepo.putBookmark(updated)
  return updated
}

/* ---------- 个人数据概览 ---------- */

function loadProfileData() {
  const analysis = loadSessionAnalysisData()
  const bookmarks = storage.bookmarksRepo.listBookmarks()
  const wrongQuestions = storage.wrongQuestionsRepo.listWrongQuestions({})

  const moduleMap = new Map()
  for (const record of analysis.records) {
    const entry = moduleMap.get(record.module) || {
      module: record.module, sessionCount: 0, questionCount: 0, correctCount: 0, accuracy: 0, totalElapsedMs: 0
    }
    entry.questionCount += 1
    entry.correctCount += record.correct ? 1 : 0
    entry.totalElapsedMs += Number.isFinite(record.elapsedMs) ? record.elapsedMs : 0
    moduleMap.set(record.module, entry)
  }
  for (const session of analysis.sessions) {
    const entry = moduleMap.get(session.module)
    if (entry) entry.sessionCount += 1
  }
  for (const entry of moduleMap.values()) {
    entry.accuracy = accuracyOf(entry.correctCount, entry.questionCount)
  }
  const modules = [...moduleMap.values()].sort((a, b) => b.questionCount - a.questionCount)

  return {
    total: summarize(analysis.sessions, analysis.records),
    modules,
    bookmarkCount: bookmarks.length,
    wrongQuestionCount: wrongQuestions.length,
    masteredWrongCount: wrongQuestions.filter((q) => q.status === 'mastered').length
  }
}

module.exports = {
  loadOverview, loadHistory, loadSessionRecords, loadSession,
  loadWrongQuestions, setWrongQuestionMastered, setManyWrongQuestionsMastered, removeWrongQuestion,
  loadWrongQuestionRanges, loadWrongQuestionById, loadWeakPatterns, refreshWeakPatterns,
  loadDataCounts, loadDiagnosis, maybeAutoAnalyze,
  loadBookmarks, toggleBookmark, updateBookmarkNote, loadProfileData
}
