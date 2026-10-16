/**
 * 训练流程编排（迁移自 services/training.ts）。
 * 连接纯领域逻辑与本地存储。
 */

const { QUESTION_COUNT } = require('./config')
const { findArithmeticModule, getArithmeticModule } = require('./registry')
const { buildQuestionText } = require('./calculator')
const { analyzeWeakPatterns, divisorRangeOf, reinforcementTargets } = require('./weakPattern')
const { checkAnswer } = require('./validator')
const storage = require('./storage')
const {
  buildQuestionRecord, computeTotals, createSessionRecord, finalizeSession, mergeWrongQuestion, toAnswerEntry
} = require('./trainingSession')
const { newId, questionKeyOf } = require('./id')

const DEFAULT_AVOID_RECENT = 60

function nowIso() { return new Date().toISOString() }

function clampQuestionCount(value) {
  if (!Number.isFinite(value)) return QUESTION_COUNT.default
  return Math.min(QUESTION_COUNT.max, Math.max(QUESTION_COUNT.min, Math.floor(value)))
}

function generateQuestionsSync(module, count, active, weakPatterns, weakConfig, avoidRecentCount) {
  const mod = getArithmeticModule(module)
  const excludeKeys = new Set(active.questionList.map((q) => questionKeyOf(q.dividend, q.divisor)))
  for (const key of storage.questionsRepo.recentQuestionKeys(module, avoidRecentCount || DEFAULT_AVOID_RECENT)) {
    excludeKeys.add(key)
  }
  const weakTargets = mod.reinforcementSupported
    ? reinforcementTargets(weakPatterns || [], weakConfig)
    : []
  return mod.generator.generate({
    count,
    weakTargets,
    maxWeakRatio: weakConfig ? weakConfig.maxReinforcementRatio : undefined,
    excludeKeys
  })
}

function cloneAsRetryQuestion(question) {
  const mod = findArithmeticModule(question.module)
  const reinforcementSupported = mod ? mod.reinforcementSupported : false
  const { min, max } = divisorRangeOf(question.divisor, 100)
  return {
    id: newId(),
    module: question.module,
    dividend: question.dividend,
    divisor: question.divisor,
    correctAnswer: question.correctAnswer,
    text: question.question || buildQuestionText(question.dividend, question.divisor),
    origin: 'weak',
    weakRange: reinforcementSupported ? { min, max } : null,
    createdAt: nowIso()
  }
}

function wrongQuestionsToQuestions(list) {
  return list.map(cloneAsRetryQuestion)
}

function sessionFromActive(active, status) {
  const totals = computeTotals(active.answers)
  return {
    id: active.sessionId,
    module: active.module,
    mode: active.mode,
    questionCount: active.questionCount,
    allowedErrorRate: active.allowedErrorRate,
    startedAt: active.startTime,
    finishedAt: '',
    totalElapsedMs: totals.totalElapsedMs,
    answeredCount: totals.answeredCount,
    correctCount: totals.correctCount,
    wrongCount: totals.wrongCount,
    grade: 'encourage',
    status,
    createdAt: active.createdAt
  }
}

function beginSession(input) {
  const startedAt = nowIso()
  const sessionId = newId()
  const source = input.source || 'random'
  const preset = [...(input.presetQuestions || [])]
  const isSpeed = input.mode === 'speed'
  const questionCount = isSpeed ? clampQuestionCount(input.questionCount) : 0

  let initialQuestions
  if (isSpeed) {
    const fromPreset = preset.splice(0, questionCount)
    const remaining = questionCount - fromPreset.length
    const generated = remaining > 0
      ? generateQuestionsSync(input.module, remaining, { questionList: fromPreset, queuedQuestions: [] }, input.weakPatterns, input.weakConfig, input.avoidRecentCount)
      : []
    initialQuestions = [...fromPreset, ...generated]
  } else {
    const first = preset.shift()
    initialQuestions = first
      ? [first]
      : generateQuestionsSync(input.module, 1, { questionList: [], queuedQuestions: [] }, input.weakPatterns, input.weakConfig, input.avoidRecentCount)
  }

  const active = {
    id: sessionId,
    sessionId,
    module: input.module,
    mode: input.mode,
    questionCount,
    allowedErrorRate: input.allowedErrorRate,
    currentQuestionIndex: 0,
    questionList: initialQuestions,
    queuedQuestions: preset,
    source,
    answers: [],
    startTime: startedAt,
    accumulatedElapsedMs: 0,
    createdAt: startedAt,
    updatedAt: startedAt
  }

  storage.sessionsRepo.putSession({ ...createSessionRecord({ id: sessionId, module: input.module, mode: input.mode, questionCount, allowedErrorRate: input.allowedErrorRate, startedAt }), status: 'active' })
  storage.activeSessionsRepo.putActiveSession(active)
  return active
}

function currentQuestion(active) {
  return active.questionList[active.currentQuestionIndex] || null
}

function submitAnswer(active, rawAnswer, elapsedMs, startedAtIso, options) {
  const opts = options || {}
  const question = currentQuestion(active)
  if (!question) throw new Error('当前没有可作答的题目')

  const mod = getArithmeticModule(active.module)
  const check = mod.validate(rawAnswer, question.correctAnswer, active.allowedErrorRate)
  const submittedAt = nowIso()

  const record = buildQuestionRecord({
    sessionId: active.sessionId,
    module: active.module,
    mode: active.mode,
    questionIndex: active.currentQuestionIndex + 1,
    question,
    check,
    elapsedMs,
    startedAt: startedAtIso,
    submittedAt
  })

  storage.questionsRepo.putQuestion(record)

  const key = questionKeyOf(question.dividend, question.divisor)
  const existingWrong = storage.wrongQuestionsRepo.getWrongQuestionByKey(key)
  if (!check.correct || existingWrong) {
    storage.wrongQuestionsRepo.putWrongQuestion(mergeWrongQuestion(record, existingWrong))
  }

  const answers = [...active.answers, toAnswerEntry(record)]
  let next = {
    ...active,
    answers,
    currentQuestionIndex: active.currentQuestionIndex + 1,
    accumulatedElapsedMs: active.accumulatedElapsedMs + record.elapsedMs,
    updatedAt: nowIso()
  }

  const isComplete = next.mode === 'speed' && answers.length >= next.questionCount

  if (!isComplete && next.questionList.length <= next.currentQuestionIndex) {
    const queued = [...next.queuedQuestions]
    const preset = queued.shift()
    const appended = preset
      ? [preset]
      : generateQuestionsSync(next.module, 1, { questionList: next.questionList, queuedQuestions: [] }, opts.weakPatterns, opts.weakConfig, opts.avoidRecentCount)
    next = { ...next, queuedQuestions: queued, questionList: [...next.questionList, ...appended] }
  }

  storage.activeSessionsRepo.putActiveSession(next)
  storage.sessionsRepo.putSession(sessionFromActive(next, 'active'))

  return { active: next, record, check, isComplete }
}

function finishSession(active) {
  const finishedAt = nowIso()
  const base = sessionFromActive(active, 'active')
  const finished = finalizeSession(base, active.answers, finishedAt)
  storage.sessionsRepo.putSession(finished)
  storage.activeSessionsRepo.clearActiveSession(active.id)
  return finished
}

function abandonSession(active) {
  const base = sessionFromActive(active, 'abandoned')
  storage.sessionsRepo.putSession({ ...base, status: 'abandoned', finishedAt: nowIso() })
  storage.activeSessionsRepo.clearActiveSession(active.id)
}

function loadSessionAnalysisData(module) {
  const sessions = storage.sessionsRepo.listSessions(module ? { module } : {})
  const records = storage.questionsRepo.listQuestions(module ? { module } : {})
  const finished = sessions.filter((s) => s.status === 'finished')
  const finishedIds = new Set(finished.map((s) => s.id))
  return {
    sessions: finished,
    records: records.filter((r) => finishedIds.has(r.sessionId))
  }
}

function recomputeWeakPatterns(module, config) {
  const previous = storage.weakPatternsRepo.listWeakPatterns(module)
  const analysis = loadSessionAnalysisData(module)
  const patterns = analyzeWeakPatterns(analysis.records, previous, config, module)
  storage.weakPatternsRepo.replaceWeakPatterns(patterns, module)
  return patterns
}

function clearAllData() {
  storage.questionsRepo.deleteAllQuestions()
  storage.sessionsRepo.deleteAllSessions()
  storage.wrongQuestionsRepo.clearWrongQuestions()
  storage.weakPatternsRepo.clearWeakPatterns()
  storage.activeSessionsRepo.clearAllActiveSessions()
  storage.aiSnapshotsRepo.clearAiAnalyses()
}

function validateAnswer(module, raw, correctAnswer, allowedErrorRate) {
  const mod = getArithmeticModule(module)
  return mod.validate(raw, correctAnswer, allowedErrorRate)
}

module.exports = {
  beginSession, currentQuestion, submitAnswer, finishSession, abandonSession,
  loadSessionAnalysisData, recomputeWeakPatterns, clearAllData, validateAnswer,
  sessionFromActive, wrongQuestionsToQuestions, checkAnswer
}
