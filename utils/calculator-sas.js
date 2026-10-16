/**
 * 正负运算计算与格式化（迁移自 signed-add-sub/calculator.ts）。
 */

const ABS_MIN = 1
const ABS_MAX = 99

function computeResult(a, b, op) {
  return op === '+' ? a + b : a - b
}

function buildQuestionText(a, b, op) {
  const left = a < 0 ? '(' + a + ')' : String(a)
  const right = b < 0 ? '(' + b + ')' : String(b)
  return left + ' ' + op + ' ' + right
}

function formatOperand(value) {
  return value < 0 ? '(' + value + ')' : String(value)
}

module.exports = { ABS_MIN, ABS_MAX, computeResult, buildQuestionText, formatOperand }
