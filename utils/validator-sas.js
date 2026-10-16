/**
 * 正负运算答案校验（迁移自 signed-add-sub/validator.ts）。
 * 整数精确匹配，无误差容忍。
 */

const { normalizeAnswerInput, parseUserAnswer, computeErrorRate } = require('./validator')

function checkSignedAnswer(raw, correctAnswer) {
  const normalized = normalizeAnswerInput(raw)
  const userAnswer = parseUserAnswer(raw)

  if (normalized === '') {
    return { raw: raw || '', userAnswer: null, correctAnswer, errorRate: null, correct: false, reason: 'empty' }
  }
  if (userAnswer === null) {
    return { raw: raw || '', userAnswer: null, correctAnswer, errorRate: null, correct: false, reason: 'invalid' }
  }

  const correct = userAnswer === correctAnswer
  const errorRate = correct ? 0 : computeErrorRate(userAnswer, correctAnswer)

  return { raw: raw || '', userAnswer, correctAnswer, errorRate, correct, reason: correct ? 'ok' : 'out_of_tolerance' }
}

module.exports = { checkSignedAnswer }
