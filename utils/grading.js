/**
 * 结算评分（迁移自 services/grading.ts）。
 * 评分只依据「是否全对 + 总用时」，正确率不参与等级计算。
 */

const { GRADE_THRESHOLDS_MS } = require('./config')

const GRADE_LABELS = {
  excellent: '优秀',
  good: '良好',
  pass: '合格',
  encourage: '加油'
}

function gradeSession(totalElapsedMs, correctCount, totalCount) {
  if (totalCount <= 0) return 'encourage'
  if (correctCount !== totalCount) return 'encourage'
  if (totalElapsedMs <= GRADE_THRESHOLDS_MS.excellent) return 'excellent'
  if (totalElapsedMs <= GRADE_THRESHOLDS_MS.good) return 'good'
  if (totalElapsedMs <= GRADE_THRESHOLDS_MS.pass) return 'pass'
  return 'encourage'
}

function gradeLabel(grade) {
  return GRADE_LABELS[grade] || '加油'
}

function gradeDescription(grade) {
  switch (grade) {
    case 'excellent': return '全部正确且总用时不超过 60 秒'
    case 'good': return '全部正确且总用时不超过 75 秒'
    case 'pass': return '全部正确且总用时不超过 90 秒'
    default: return '存在错误题，或总用时超过 90 秒'
  }
}

function isExcellentGrade(grade) {
  return grade === 'excellent'
}

module.exports = { GRADE_LABELS, gradeSession, gradeLabel, gradeDescription, isExcellentGrade }
