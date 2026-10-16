/**
 * 训练结果页：结算等级 + 成绩统计 + 逐题回顾 + 收藏。
 */
const queries = require('../../utils/queries')
const storage = require('../../utils/storage')
const format = require('../../utils/format')
const { gradeLabel, gradeDescription } = require('../../utils/grading')

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
    const records = storage.questionsRepo.listQuestionsBySession(sessionId)

    const gradeClassMap = { excellent: 'badge-success', good: 'badge-success', pass: 'badge-warning', encourage: 'badge-muted' }

    this.setData({
      session,
      records,
      gradeLabel: gradeLabel(session.grade),
      gradeDescription: gradeDescription(session.grade),
      gradeClass: gradeClassMap[session.grade] || 'badge-muted',
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
