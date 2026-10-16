/**
 * 训练组领域逻辑（迁移自 services/trainingSession.ts，纯函数）。
 */

const { gradeSession } = require('./grading')
const { buildQuestionText } = require('./calculator')
const { questionKeyOf } = require('./id')

function createSessionRecord(draft) {
  return {
    id: draft.id,
    module: draft.module,
    mode: draft.mode,
    questionCount: draft.questionCount,
    allowedErrorRate: draft.allowedErrorRate,
    startedAt: draft.startedAt,
    finishedAt: '',
    totalElapsedMs: 0,
    answeredCount: 0,
    correctCount: 0,
    wrongCount: 0,
    grade: 'encourage',
    status: 'active',
    createdAt: new Date().toISOString()
  }
}

function buildQuestionRecord(input) {
  const { question, check } = input
  return {
    id: input.recordId || question.id,
    sessionId: input.sessionId,
    module: input.module,
    mode: input.mode,
    question: question.text || buildQuestionText(question.dividend, question.divisor),
    questionIndex: input.questionIndex,
    dividend: question.dividend,
    divisor: question.divisor,
    correctAnswer: question.correctAnswer,
    rawAnswer: check.raw,
    userAnswer: check.userAnswer,
    errorRate: check.errorRate,
    correct: check.correct,
    elapsedMs: Math.max(0, Math.round(input.elapsedMs)),
    startedAt: input.startedAt,
    submittedAt: input.submittedAt,
    origin: question.origin,
    weakRange: question.weakRange ? { min: question.weakRange.min, max: question.weakRange.max } : null,
    createdAt: input.createdAt || new Date().toISOString()
  }
}

function toAnswerEntry(record) {
  return {
    questionId: record.id,
    questionIndex: record.questionIndex,
    rawAnswer: record.rawAnswer,
    userAnswer: record.userAnswer,
    errorRate: record.errorRate,
    correct: record.correct,
    elapsedMs: record.elapsedMs,
    startedAt: record.startedAt,
    submittedAt: record.submittedAt
  }
}

function computeTotals(answers) {
  const answeredCount = answers.length
  const correctCount = answers.filter((a) => a.correct).length
  const totalElapsedMs = answers.reduce((sum, a) => sum + (Number.isFinite(a.elapsedMs) ? a.elapsedMs : 0), 0)
  return { answeredCount, correctCount, wrongCount: answeredCount - correctCount, totalElapsedMs }
}

function finalizeSession(session, answers, finishedAt) {
  const totals = computeTotals(answers)
  const grade = gradeSession(totals.totalElapsedMs, totals.correctCount, totals.answeredCount)
  return {
    ...session,
    finishedAt,
    totalElapsedMs: totals.totalElapsedMs,
    answeredCount: totals.answeredCount,
    correctCount: totals.correctCount,
    wrongCount: totals.wrongCount,
    grade,
    status: 'finished'
  }
}

function mergeWrongQuestion(record, existing) {
  const now = new Date().toISOString()
  const base = existing || {
    id: record.id,
    questionKey: questionKeyOf(record.dividend, record.divisor),
    module: record.module,
    question: record.question,
    dividend: record.dividend,
    divisor: record.divisor,
    correctAnswer: record.correctAnswer,
    userAnswer: record.userAnswer,
    rawAnswer: record.rawAnswer,
    errorRate: record.errorRate,
    elapsedMs: record.elapsedMs,
    wrongCount: 0,
    correctCount: 0,
    createdAt: record.createdAt,
    lastWrongAt: record.submittedAt,
    lastCorrectAt: null,
    trainingSessionId: record.sessionId,
    firstSessionId: record.sessionId,
    status: 'active',
    masteredAt: null,
    updatedAt: now
  }

  if (record.correct) {
    return {
      ...base,
      correctCount: base.correctCount + 1,
      lastCorrectAt: record.submittedAt,
      userAnswer: record.userAnswer,
      rawAnswer: record.rawAnswer,
      errorRate: record.errorRate,
      elapsedMs: record.elapsedMs,
      question: record.question,
      correctAnswer: record.correctAnswer,
      updatedAt: now
    }
  }

  return {
    ...base,
    question: record.question,
    correctAnswer: record.correctAnswer,
    userAnswer: record.userAnswer,
    rawAnswer: record.rawAnswer,
    errorRate: record.errorRate,
    elapsedMs: record.elapsedMs,
    wrongCount: base.wrongCount + 1,
    lastWrongAt: record.submittedAt,
    trainingSessionId: record.sessionId,
    updatedAt: now
  }
}

module.exports = {
  createSessionRecord, buildQuestionRecord, toAnswerEntry, computeTotals, finalizeSession, mergeWrongQuestion
}
