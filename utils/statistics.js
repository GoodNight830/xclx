/**
 * 统计计算（迁移自 services/statistics.ts，纯函数）。
 */

const { isInRange, localDateKey } = require('./format')

function accuracyOf(correctCount, questionCount) {
  if (questionCount <= 0) return 0
  return (correctCount / questionCount) * 100
}

function emptySummary() {
  return {
    sessionCount: 0, questionCount: 0, correctCount: 0, wrongCount: 0,
    accuracy: 0, totalElapsedMs: 0, avgElapsedMs: 0
  }
}

function summarizeQuestions(records) {
  const questionCount = records.length
  const correctCount = records.filter((r) => r.correct).length
  const totalElapsedMs = records.reduce((sum, r) => sum + (Number.isFinite(r.elapsedMs) ? r.elapsedMs : 0), 0)
  return {
    sessionCount: 0,
    questionCount,
    correctCount,
    wrongCount: questionCount - correctCount,
    accuracy: accuracyOf(correctCount, questionCount),
    totalElapsedMs,
    avgElapsedMs: questionCount > 0 ? totalElapsedMs / questionCount : 0
  }
}

function summarizeSessions(sessions) {
  const questionCount = sessions.reduce((sum, s) => sum + s.answeredCount, 0)
  const correctCount = sessions.reduce((sum, s) => sum + s.correctCount, 0)
  const totalElapsedMs = sessions.reduce((sum, s) => sum + s.totalElapsedMs, 0)
  return {
    sessionCount: sessions.length,
    questionCount,
    correctCount,
    wrongCount: questionCount - correctCount,
    accuracy: accuracyOf(correctCount, questionCount),
    totalElapsedMs,
    avgElapsedMs: questionCount > 0 ? totalElapsedMs / questionCount : 0
  }
}

function summarize(sessions, records) {
  if (records.length === 0) return summarizeSessions(sessions)
  const base = summarizeQuestions(records)
  const totalCount = sessions.reduce((sum, s) => sum + s.answeredCount, 0)
  const totalElapsedMs = sessions.reduce((sum, s) => sum + s.totalElapsedMs, 0)
  return {
    ...base,
    sessionCount: sessions.length,
    totalElapsedMs: totalElapsedMs > 0 ? totalElapsedMs : base.totalElapsedMs,
    avgElapsedMs: totalCount > 0 ? totalElapsedMs / totalCount : base.avgElapsedMs
  }
}

function summarizeRange(sessions, records, range, now) {
  const ref = now || new Date()
  if (range === 'all') return summarize(sessions, records)
  return summarize(
    sessions.filter((s) => isInRange(s.startedAt, range, ref)),
    records.filter((r) => isInRange(r.submittedAt || r.createdAt, range, ref))
  )
}

function buildDailySummaries(sessions, range, now) {
  const ref = now || new Date()
  const filtered = sessions.filter((s) => isInRange(s.startedAt, range || 'all', ref))
  const groups = new Map()
  for (const session of filtered) {
    const key = localDateKey(session.startedAt)
    const list = groups.get(key)
    if (list) list.push(session)
    else groups.set(key, [session])
  }
  return [...groups.entries()].map(([date, list]) => {
    const sorted = [...list].sort((a, b) => b.startedAt.localeCompare(a.startedAt))
    const summary = summarizeSessions(sorted)
    return {
      date,
      sessionCount: summary.sessionCount,
      questionCount: summary.questionCount,
      correctCount: summary.correctCount,
      wrongCount: summary.wrongCount,
      accuracy: summary.accuracy,
      totalElapsedMs: summary.totalElapsedMs,
      avgElapsedMs: summary.avgElapsedMs,
      sessions: sorted
    }
  }).sort((a, b) => b.date.localeCompare(a.date))
}

function averageElapsedByCorrectness(records, correct) {
  const filtered = records.filter((r) => r.correct === correct)
  if (filtered.length === 0) return null
  return filtered.reduce((sum, r) => sum + r.elapsedMs, 0) / filtered.length
}

function recentErrorRate(records, windowSize) {
  const sorted = [...records].sort((a, b) => a.createdAt.localeCompare(b.createdAt))
  const recent = sorted.slice(Math.max(0, sorted.length - windowSize))
  if (recent.length === 0) return 0
  const wrong = recent.filter((r) => !r.correct).length
  return accuracyOf(wrong, recent.length)
}

module.exports = {
  accuracyOf, emptySummary, summarizeQuestions, summarizeSessions, summarize,
  summarizeRange, buildDailySummaries, averageElapsedByCorrectness, recentErrorRate
}
