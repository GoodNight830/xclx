/**
 * 五除三计算与格式化（迁移自 five-divide-three/calculator.ts）。
 */

const ANSWER_DECIMALS = 2
const DIVIDEND_MIN = 10000
const DIVIDEND_MAX = 99999
const DIVISOR_MIN = 100
const DIVISOR_MAX = 999

function exactQuotient(dividend, divisor) {
  if (!Number.isFinite(dividend) || !Number.isFinite(divisor) || divisor === 0) return Number.NaN
  return dividend / divisor
}

function roundTo(value, decimals) {
  if (!Number.isFinite(value)) return value
  const factor = 10 ** decimals
  return Math.round((value + Number.EPSILON * Math.sign(value)) * factor) / factor
}

function formatNumber(value, decimals = ANSWER_DECIMALS) {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—'
  return value.toFixed(decimals)
}

function buildQuestionText(dividend, divisor) {
  return dividend + ' ÷ ' + divisor
}

function formatErrorRate(errorRate, decimals = 2) {
  if (errorRate === null || errorRate === undefined || !Number.isFinite(errorRate)) return '—'
  return errorRate.toFixed(decimals) + '%'
}

module.exports = {
  ANSWER_DECIMALS, DIVIDEND_MIN, DIVIDEND_MAX, DIVISOR_MIN, DIVISOR_MAX,
  exactQuotient, roundTo, formatNumber, buildQuestionText, formatErrorRate
}
