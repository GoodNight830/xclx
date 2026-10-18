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
    moduleFilterIndex: 0,
    range: '7d',
    ranges: [
      { key: 'today', label: '今天' },
      { key: '7d', label: '近7天' },
      { key: '30d', label: '近30天' },
      { key: 'all', label: '全部' }
    ],
    dateOptions: [],
    dateFilter: '',
    dateFilterIndex: 0,
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
    if (totalCount > 0) {
      pieSegments = modules.map((m, i) => {
        return {
          module: m.module,
          label: m.label,
          questionCount: m.questionCount,
          percent: (m.questionCount / totalCount) * 100,
          percentLabel: format.formatPercent((m.questionCount / totalCount) * 100),
          color: PIE_COLORS[i % PIE_COLORS.length]
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
    }, () => {
      // setData 渲染完成后绘制饼状图
      if (totalCount > 0) this.drawPieChart()
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

  // 用 canvas 2d 绘制饼状图（替代不兼容的 SVG）
  drawPieChart() {
    if (!this.data.pieHasData || !this.data.pieSegments.length) return
    const query = wx.createSelectorQuery()
    query.select('#pieChart').fields({ node: true, size: true }).exec((res) => {
      if (!res || !res[0] || !res[0].node) return
      const canvas = res[0].node
      const ctx = canvas.getContext('2d')
      const dpr = wx.getSystemInfoSync().pixelRatio || 2
      const size = res[0].width
      canvas.width = size * dpr
      canvas.height = size * dpr
      ctx.scale(dpr, dpr)

      const cx = size / 2
      const cy = size / 2
      const r = size / 2 - 4
      const segs = this.data.pieSegments

      // 背景圆
      ctx.beginPath()
      ctx.arc(cx, cy, r, 0, Math.PI * 2)
      ctx.fillStyle = '#eef1f6'
      ctx.fill()

      // 各扇形
      let acc = 0
      const total = segs.reduce((s, m) => s + m.questionCount, 0)
      if (total <= 0) return
      segs.forEach((m) => {
        const start = (acc / total) * 360
        acc += m.questionCount
        const end = (acc / total) * 360
        const startRad = ((start - 90) * Math.PI) / 180
        const endRad = ((end - 90) * Math.PI) / 180
        ctx.beginPath()
        ctx.moveTo(cx, cy)
        ctx.arc(cx, cy, r, startRad, endRad)
        ctx.closePath()
        ctx.fillStyle = m.color
        ctx.fill()
      })
    })
  },

  loadHistory() {
    const module = this.data.moduleFilter || this.presetModule || 'five-divide-three'
    const history = queries.loadHistory(this.data.range, module)

    this.allDaily = history.daily

    const moduleOptions = [{ value: '', label: '全部模块' }].concat(
      this.data.modules.map((m) => ({ value: m.module, label: m.label }))
    )
    // picker 的 value 必须是下标，不能直接传模块 id
    const filterIndex = moduleOptions.findIndex((m) => m.value === this.data.moduleFilter)
    const moduleFilterLabel = (moduleOptions.find((m) => m.value === this.data.moduleFilter) || moduleOptions[0]).label

    this.setData({
      moduleOptions,
      moduleFilterIndex: filterIndex >= 0 ? filterIndex : 0,
      moduleFilterLabel,
      summary: {
        ...history.summary,
        accuracyLabel: history.summary.questionCount > 0 ? format.formatPercent(history.summary.accuracy) : '—',
        avgElapsedLabel: history.summary.questionCount > 0 ? format.formatMs(history.summary.avgElapsedMs) : '—'
      },
      dateOptions: this.allDaily.map((d) => d.date),
      dateFilter: '',
      dateFilterIndex: 0,
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
    const index = Number(e.detail.value)
    const module = this.data.moduleOptions[index]
    this.setData({ moduleFilterIndex: index, moduleFilter: module ? module.value : '', dateFilter: '' })
    this.loadHistory()
  },

  switchRange(e) {
    this.setData({ range: e.currentTarget.dataset.key, dateFilter: '' })
    this.loadHistory()
  },

  switchDate(e) {
    const index = Number(e.detail.value)
    const date = this.data.dateOptions[index]
    this.setData({ dateFilterIndex: index, dateFilter: date || '' })
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
