/**
 * 个人薄弱点页：按除数范围展示错误率，支持定向强化训练。
 */
const queries = require('../../utils/queries')
const storage = require('../../utils/storage')
const training = require('../../utils/training')
const format = require('../../utils/format')
const { weakPatternSuggestion, totalReinforcementRatio } = require('../../utils/weakPattern')

Page({
  data: {
    tab: 'all',
    tabs: [
      { key: 'all', label: '全部' },
      { key: 'active', label: '强化中' },
      { key: 'resolved', label: '已解决' }
    ],
    patterns: [],
    visiblePatterns: [],
    weakConfig: null,
    reinforcementRatio: 0,
    reinforcementCap: 0,
    startingId: ''
  },

  onShow() {
    this.load()
  },

  load() {
    const settings = storage.settingsRepo.getSettings()
    const patterns = queries.loadWeakPatterns('five-divide-three')
    const activePatterns = patterns.filter((p) => p.status === 'active' || p.status === 'improving')
    const resolvedPatterns = patterns.filter((p) => p.status === 'resolved')

    const visible = this.data.tab === 'active' ? activePatterns : this.data.tab === 'resolved' ? resolvedPatterns : patterns

    this.setData({
      patterns,
      visiblePatterns: visible.map((p) => this.decoratePattern(p)),
      weakConfig: settings.weakPattern,
      reinforcementRatio: totalReinforcementRatio(patterns) * 100,
      reinforcementCap: settings.weakPattern.maxReinforcementRatio * 100
    })
  },

  decoratePattern(p) {
    const statusMeta = {
      active: { label: '强化中', badgeClass: 'badge-warning' },
      improving: { label: '改善中', badgeClass: 'badge-success' },
      resolved: { label: '已解决', badgeClass: 'badge-muted' }
    }
    const trendLabel = p.trend === 'up' ? '错误率上升' : p.trend === 'down' ? '错误率下降' : '基本持平'
    const trendArrow = p.trend === 'up' ? '↑' : p.trend === 'down' ? '↓' : '→'
    const trendClass = p.trend === 'up' ? 'text-danger' : p.trend === 'down' ? 'text-success' : 'text-muted'
    return {
      ...p,
      statusLabel: statusMeta[p.status] ? statusMeta[p.status].label : p.status,
      statusBadgeClass: statusMeta[p.status] ? statusMeta[p.status].badgeClass : '',
      errorRateLabel: format.formatPercent(p.errorRate),
      overallErrorRateLabel: format.formatPercent(p.overallErrorRate),
      weightLabel: format.formatPercent(p.reinforcementWeight * 100),
      recentErrorRateLabel: format.formatPercent(p.recentErrorRate),
      trendLabel,
      trendArrow,
      trendClass,
      suggestion: weakPatternSuggestion(p)
    }
  },

  switchTab(e) {
    this.setData({ tab: e.currentTarget.dataset.key })
    this.load()
  },

  refresh() {
    const settings = storage.settingsRepo.getSettings()
    queries.refreshWeakPatterns(settings.weakPattern, 'five-divide-three')
    this.load()
    wx.showToast({ title: '已重新分析', icon: 'success' })
  },

  trainRange(e) {
    const id = e.currentTarget.dataset.id
    const pattern = this.data.patterns.find((p) => p.id === id)
    if (!pattern) return
    this.setData({ startingId: id })

    const wrongInRange = queries.loadWrongQuestions({
      module: 'five-divide-three',
      status: 'active',
      rangeMin: pattern.rangeMin,
      rangeMax: pattern.rangeMax
    })

    const settings = storage.settingsRepo.getSettings()
    const options = {
      module: 'five-divide-three',
      mode: 'training',
      questionCount: 0,
      allowedErrorRate: settings.defaultAllowedErrorRate
    }
    if (wrongInRange.length > 0) {
      options.source = 'wrongQuestions'
      options.presetQuestions = training.wrongQuestionsToQuestions(wrongInRange)
    }
    training.beginSession(options)
    this.setData({ startingId: '' })
    wx.navigateTo({ url: '/pages/training/training' })
  }
})
