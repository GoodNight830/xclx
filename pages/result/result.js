/**
 * 训练结果页：结算等级 + 成绩统计 + 逐题回顾 + 收藏。
 */
const queries = require('../../utils/queries')
const storage = require('../../utils/storage')
const format = require('../../utils/format')
const { gradeLabel, gradeDescription } = require('../../utils/grading')

/**
 * 展示用数字：除法允许误差作答，正确答案常是无限小数，
 * 原始浮点（523.9382325581396）既难读又会撑破排版 → 最多保留 2 位小数。
 */
function formatQuantity(value) {
  if (value === null || value === undefined || value === '') return '—'
  const n = Number(value)
  if (!Number.isFinite(n)) return String(value)
  // Math.round 后再转字符串会自动去掉末尾的 0（523.94 / 47 / 63.5）
  return String(Math.round(n * 100) / 100)
}

Page({
  data: {
    session: null,
    records: [],
    gradeLabel: '',
    gradeDescription: '',
    gradeClass: '',
    accuracy: '—',
    totalElapsedLabel: '—',
    avgElapsedLabel: '—',
    bookmarkStates: {}
  },

  onLoad(options) {
    const sessionId = options.sessionId
    const session = storage.sessionsRepo.getSession(sessionId)
    if (!session) {
      wx.showToast({ title: '训练组不存在', icon: 'none' })
      return
    }
    const rawRecords = storage.questionsRepo.listQuestionsBySession(sessionId)
    // 除法模块允许误差作答，正确答案可能是无限小数；展示时最多保留 2 位，
    // 否则 523.9382325581396 这种原始浮点会占满整行
    const records = rawRecords.map((r) => ({
      ...r,
      userAnswerLabel: formatQuantity(r.userAnswer),
      correctAnswerLabel: formatQuantity(r.correctAnswer)
    }))

    const gradeClassMap = { excellent: 'grade-excellent', good: 'grade-good', pass: 'grade-pass', encourage: 'grade-encourage' }

    this.setData({
      session,
      records,
      gradeLabel: gradeLabel(session.grade),
      gradeDescription: gradeDescription(session.grade),
      gradeClass: gradeClassMap[session.grade] || 'grade-encourage',
      accuracy: session.answeredCount > 0 ? format.formatPercent((session.correctCount / session.answeredCount) * 100) : '—',
      totalElapsedLabel: format.formatDuration(session.totalElapsedMs),
      avgElapsedLabel: session.answeredCount > 0 ? format.formatMs(session.totalElapsedMs / session.answeredCount) : '—'
    })

    this.loadBookmarkStates(records)
  },

  loadBookmarkStates(records) {
    const states = {}
    const bookmarks = storage.bookmarksRepo.listBookmarks()
    const bookmarkKeys = new Set(bookmarks.map((b) => b.questionKey))
    for (const r of records) {
      states[r.id] = bookmarkKeys.has(r.dividend + ':' + r.divisor)
    }
    this.setData({ bookmarkStates: states })
  },

  toggleBookmark(e) {
    const index = e.currentTarget.dataset.index
    const record = this.data.records[index]
    if (!record) return
    const result = queries.toggleBookmark({
      module: record.module,
      question: record.question,
      dividend: record.dividend,
      divisor: record.divisor,
      correctAnswer: record.correctAnswer
    })
    this.loadBookmarkStates(this.data.records)
  },

  goHome() {
    wx.switchTab({ url: '/pages/home/home' })
  },

  trainAgain() {
    wx.navigateBack()
  }
})
