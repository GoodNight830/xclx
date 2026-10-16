/**
 * 个人数据页：概览卡 + 模块分布饼状图 + 训练记录（模块/日期筛选 + 分页）+ 收藏。
 */
const queries = require('../../utils/queries')
const storage = require('../../utils/storage')
const format = require('../../utils/format')
const { findArithmeticModule } = require('../../utils/registry')

const PIE_COLORS = ['#4f7cff', '#f59e0b', '#10b981', '#ef4444', '#8b5cf6', '#14b8a6', '#f97316', '#64748b']
const PAGE_SIZE = 7

Page({
  data: {
    total: null,
    modules: [],
    bookmarks: [],
    wrongQuestionCount: 0,
    masteredWrongCount: 0,
    bookmarkCount: 0,

    // 饼状图
    pieSegments: [],
    pieHasData: false,

    // 训练记录
    moduleOptions: [],
    moduleFilter: '',
    range: '7d',
    ranges: [
      { key: 'today', label: '今天' },
      { key: '7d', label: '近7天' },
      { key: '30d', label: '近30天' },
      { key: 'all', label: '全部' }
    ],
    dateOptions: [],
    dateFilter: '',
    moduleFilterLabel: '全部模块',
    summary: null,
    visibleDaily: [],
    filteredDailyLength: 0,
    hasMore: false,
    hasRecords: false,
    expandedSessionId: '',
    sessionRecords: {}
  },

  allDaily: [],

  onLoad(options) {
    this.loadProfile()
    const preset = options.module || ''
    if (preset) this.presetModule = preset
    this.loadHistory()
  },

  onShow() {
    // 收藏可能在结果页变化，刷新收藏
    this.loadBookmarksOnly()
  },

  moduleLabel(moduleId) {
    const mod = findArithmeticModule(moduleId)
    return mod ? mod.meta.title : moduleId
  },

  loadProfile() {
    const profile = queries.loadProfileData()
    const modules = profile.modules.map((m) => ({
      ...m,
      label: this.moduleLabel(m.module),
      accuracyLabel: format.formatPercent(m.accuracy)
    }))

    // 饼状图
    const totalCount = modules.reduce((sum, m) => sum + m.questionCount, 0)
    let pieSegments = []
    let acc = 0
    if (totalCount > 0) {
      pieSegments = modules.map((m, i) => {
        const start = (acc / totalCount) * 360
        acc += m.questionCount
        const end = (acc / totalCount) * 360
        return {
          module: m.module,
          label: m.label,
          questionCount: m.questionCount,
          percent: (m.questionCount / totalCount) * 100,
          percentLabel: format.formatPercent((m.questionCount / totalCount) * 100),
          color: PIE_COLORS[i % PIE_COLORS.length],
          start,
          end,
          path: this.piePath(start, end, 88)
        }
      })
    }

    this.setData({
      total: profile.total,
      modules,
      wrongQuestionCount: profile.wrongQuestionCount,
      masteredWrongCount: profile.masteredWrongCount,
      bookmarkCount: profile.bookmarkCount,
      pieSegments,
      pieHasData: totalCount > 0
    })
    this.loadBookmarksOnly()
  },

  loadBookmarksOnly() {
    const bookmarks = queries.loadBookmarks().map((b) => ({
      ...b,
      moduleLabel: this.moduleLabel(b.module)
    }))
    this.setData({ bookmarks })
  },

  piePath(start, end, r) {
    if (end - start >= 360) {
      return 'M 100 ' + (100 - r) + ' A ' + r + ' ' + r + ' 0 1 1 100 ' + (100 + r) + ' A ' + r + ' ' + r + ' 0 1 1 100 ' + (100 - r) + ' Z'
    }
    const a = ((start - 90) * Math.PI) / 180
    const b = ((end - 90) * Math.PI) / 180
    const x1 = 100 + r * Math.cos(a)
    const y1 = 100 + r * Math.sin(a)
    const x2 = 100 + r * Math.cos(b)
    const y2 = 100 + r * Math.sin(b)
    const largeArc = end - start > 180 ? 1 : 0
    return 'M 100 100 L ' + x1 + ' ' + y1 + ' A ' + r + ' ' + r + ' 0 ' + largeArc + ' 1 ' + x2 + ' ' + y2 + ' Z'
  },

  loadHistory() {
    const module = this.data.moduleFilter || this.presetModule || 'five-divide-three'
    const history = queries.loadHistory(this.data.range, module)

    this.allDaily = history.daily

    const moduleOptions = [{ value: '', label: '全部模块' }].concat(
      this.data.modules.map((m) => ({ value: m.module, label: m.label }))
    )
    const moduleFilterLabel = (moduleOptions.find((m) => m.value === this.data.moduleFilter) || moduleOptions[0]).label

    this.setData({
      moduleOptions,
      moduleFilterLabel,
      summary: {
        ...history.summary,
        accuracyLabel: history.summary.questionCount > 0 ? format.formatPercent(history.summary.accuracy) : '—',
        avgElapsedLabel: history.summary.questionCount > 0 ? format.formatMs(history.summary.avgElapsedMs) : '—'
      },
      dateOptions: this.allDaily.map((d) => d.date),
      dateFilter: '',
      expandedSessionId: '',
      sessionRecords: {}
    })
    this.applyFilter()
  },

  applyFilter() {
    const filtered = this.data.dateFilter
      ? this.allDaily.filter((d) => d.date === this.data.dateFilter)
      : this.allDaily
    const decorated = filtered.map((d) => ({
      ...d,
      dateLabel: format.relativeDayLabel(d.date),
      accuracyLabel: format.formatPercent(d.accuracy)
    }))
    const visible = decorated.slice(0, PAGE_SIZE)
    this.setData({
      filteredDailyLength: decorated.length,
      visibleDaily: visible,
      hasMore: visible.length < decorated.length,
      hasRecords: decorated.length > 0
    })
  },

  switchModule(e) {
    const module = this.data.moduleOptions[e.detail.value]
    this.setData({ moduleFilter: module ? module.value : '', dateFilter: '' })
    this.loadHistory()
  },

  switchRange(e) {
    this.setData({ range: e.currentTarget.dataset.key, dateFilter: '' })
    this.loadHistory()
  },

  switchDate(e) {
    const date = this.data.dateOptions[e.detail.value]
    this.setData({ dateFilter: date || '' })
    this.applyFilter()
  },

  loadMore() {
    const filtered = this.data.dateFilter
      ? this.allDaily.filter((d) => d.date === this.data.dateFilter)
      : this.allDaily
    const decorated = filtered.map((d) => ({
      ...d,
      dateLabel: format.relativeDayLabel(d.date),
      accuracyLabel: format.formatPercent(d.accuracy)
    }))
    this.setData({
      visibleDaily: decorated.slice(0, this.data.visibleDaily.length + PAGE_SIZE),
      hasMore: this.data.visibleDaily.length + PAGE_SIZE < decorated.length
    })
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
