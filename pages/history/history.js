/**
 * 训练记录页（历史）：时间范围切换 + 按天聚合 + 展开到题目级。
 */
const queries = require('../../utils/queries')
const format = require('../../utils/format')

const RANGE_KEYS = ['today', '7d', '30d', 'all']

Page({
  data: {
    ranges: [
      { key: 'today', label: '今天' },
      { key: '7d', label: '近7天' },
      { key: '30d', label: '近30天' },
      { key: 'all', label: '全部' }
    ],
    range: '7d',
    summary: null,
    daily: [],
    expandedSessionId: '',
    sessionRecords: {}
  },

  onLoad(options) {
    if (options.module) this.module = options.module
    this.load()
  },

  load() {
    const module = this.module || 'five-divide-three'
    const history = queries.loadHistory(this.data.range, module)
    const daily = history.daily.map((d) => ({
      ...d,
      dateLabel: format.relativeDayLabel(d.date),
      accuracyLabel: format.formatPercent(d.accuracy)
    }))
    this.setData({
      summary: {
        ...history.summary,
        accuracyLabel: history.summary.questionCount > 0 ? format.formatPercent(history.summary.accuracy) : '—',
        avgElapsedLabel: history.summary.questionCount > 0 ? format.formatMs(history.summary.avgElapsedMs) : '—'
      },
      daily,
      expandedSessionId: '',
      sessionRecords: {}
    })
  },

  switchRange(e) {
    this.setData({ range: e.currentTarget.dataset.key })
    this.load()
  },

  toggleSession(e) {
    const sessionId = e.currentTarget.dataset.id
    if (this.data.expandedSessionId === sessionId) {
      this.setData({ expandedSessionId: '' })
      return
    }
    const sessionRecords = { ...this.data.sessionRecords }
    if (!sessionRecords[sessionId]) {
      sessionRecords[sessionId] = queries.loadSessionRecords(sessionId)
    }
    this.setData({ expandedSessionId: sessionId, sessionRecords })
  }
})
