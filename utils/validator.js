/**
 * 五除三答案校验与误差计算（迁移自 five-divide-three/validator.ts）。
 * errorRate = |userAnswer - correctAnswer| / |correctAnswer| × 100%
 */

const { roundTo } = require('./calculator')

const EPSILON = 1e-9
const ERROR_RATE_DECIMALS = 4

function normalizeAnswerInput(raw) {
  return (raw || '')
    .replace(/[\uFF10-\uFF19]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xfee0))
    .replace(/\uFF0E/g, '.')
    .replace(/\u3002/g, '.')
    .replace(/\uFF0D/g, '-')
    .replace(/[\s\u00A0\u3000]/g, '')
}

function parseUserAnswer(raw) {
  if (typeof raw !== 'string') return null
  const normalized = normalizeAnswerInput(raw)
  if (normalized === '') return null
  if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(normalized)) return null
  const value = Number(normalized)
  if (!Number.isFinite(value)) return null
  return value
}

function computeErrorRate(userAnswer, correctAnswer) {
  if (!Number.isFinite(userAnswer) || !Number.isFinite(correctAnswer)) return Number.NaN
  if (correctAnswer === 0) return userAnswer === 0 ? 0 : Number.POSITIVE_INFINITY
  return (Math.abs(userAnswer - correctAnswer) / Math.abs(correctAnswer)) * 100
}

function isWithinTolerance(errorRate, allowedErrorRate) {
  if (errorRate === null || errorRate === undefined || Number.isNaN(errorRate)) return false
  if (!Number.isFinite(errorRate)) return false
  return errorRate <= allowedErrorRate + EPSILON
}

function checkAnswer(raw, correctAnswer, allowedErrorRate) {
  const normalized = normalizeAnswerInput(raw)
  const userAnswer = parseUserAnswer(raw)

  if (normalized === '') {
    return { raw: raw || '', userAnswer: null, correctAnswer, errorRate: null, correct: false, reason: 'empty' }
  }
  if (userAnswer === null) {
    return { raw: raw || '', userAnswer: null, correctAnswer, errorRate: null, correct: false, reason: 'invalid' }
  }

  const errorRate = roundTo(computeErrorRate(userAnswer, correctAnswer), ERROR_RATE_DECIMALS)
  const correct = isWithinTolerance(errorRate, allowedErrorRate)

  return { raw: raw || '', userAnswer, correctAnswer, errorRate, correct, reason: correct ? 'ok' : 'out_of_tolerance' }
}

module.exports = {
  EPSILON, ERROR_RATE_DECIMALS, normalizeAnswerInput, parseUserAnswer,
  computeErrorRate, isWithinTolerance, checkAnswer
}
