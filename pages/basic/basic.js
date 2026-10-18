/**
 * 基础计算页：快速开始 + 题型网格 + 今日概览 + 薄弱点 + 训练工具。
 */
const queries = require('../../utils/queries')
const format = require('../../utils/format')
const storage = require('../../utils/storage')
const { weakPatternSuggestion } = require('../../utils/weakPattern')
const training = require('../../utils/training')
const { MODULE_FIVE_DIVIDE_THREE } = require('../../utils/config')

Page({
  data: {
    overview: null,
    loading: true,
    errorMessage: '',
    settings: null,
    modeLabel: '练习模式',
    modeDescription: '',
    recentModeLabel: '训练模式',
    unmasteredWrongCount: 0,
    weakHint: '',
    todayAccuracy: '—',
    todayAvg: '—',
    topics: [
      { key: 'five-divide-three', title: '五位数÷三位数', available: true },
      { key: 'signed-add-sub', title: '正负运算', available: true },
      { key: 'three-add', title: '三位数加法', available: false },
      { key: 'three-sub', title: '三位数减法', available: false },
      { key: 'three-add-sub', title: '三位数加减', available: false },
      { key: 'four-add', title: '四位数加法', available: false },
      { key: 'three-mul-one', title: '三位数乘一位数', available: false },
      { key: 'three-div-one', title: '三位数除一位数', available: false },
      { key: 'two-mul-two', title: '两位数乘两位数', available: false },
      { key: 'mul-estimate', title: '乘法估算', available: false }
    ]
  },

  onShow() {
    this.load()
  },

  load() {
    this.setData({ loading: true, errorMessage: '' })
    try {
      const settings = storage.settingsRepo.getSettings()
      const overview = queries.loadOverview('five-divide-three')
      const today = overview.today

      // 最近常用模式（近30天）
      const history = queries.loadHistory('30d', 'five-divide-three')
      let training = 0
      let speed = 0
      for (const s of history.sessions) {
        if (s.mode === 'speed') speed += 1
        else training += 1
      }

      const weakHint = this.computeWeakHint(overview.weakPatterns)

      this.setData({
        overview,
        loading: false,
        settings,
        modeLabel: settings.defaultMode === 'speed' ? '竞速模式' : '练习模式',
        modeDescription: settings.defaultMode === 'speed'
          ? '竞速模式：固定题数，完成后结算，过程中不提示对错，等级由「是否全对 + 总用时」决定。'
          : '练习模式：无限练习，即时纠错，由你主动结束，适合稳步提升。',
        recentModeLabel: speed > training ? '竞速模式' : '训练模式',
        unmasteredWrongCount: overview.unmasteredWrongCount,
        weakHint,
        todayAccuracy: today.questionCount > 0 ? format.formatPercent(today.accuracy) : '—',
        todayAvg: today.questionCount > 0 ? format.formatMs(today.avgElapsedMs) : '—'
      })
    } catch (e) {
      this.setData({ loading: false, errorMessage: e.message || '加载失败' })
    }
  },

  computeWeakHint(patterns) {
    const pattern = (patterns || []).find((item) => item.status !== 'resolved' && item.reinforcementWeight > 0)
    return pattern ? weakPatternSuggestion(pattern) : ''
  },

  openTopic(e) {
    const key = e.currentTarget.dataset.key
    const topic = this.data.topics.find((t) => t.key === key)
    if (!topic || !topic.available) return
    if (topic.key === 'signed-add-sub') {
      wx.navigateTo({ url: '/pages/signed-add-sub/signed-add-sub' })
      return
    }
    wx.navigateTo({ url: '/pages/five-divide-three/five-divide-three' })
  },

  // 切换总训练模式（练习 / 竞速），持久化到设置，各题型页直接用该模式
  switchMode(e) {
    const mode = e.currentTarget.dataset.mode
    if (!mode || !this.data.settings) return
    if (this.data.settings.defaultMode === mode) return
    const settings = { ...this.data.settings, defaultMode: mode }
    storage.settingsRepo.saveSettings(settings)
    this.setData({
      settings,
      modeLabel: mode === 'speed' ? '竞速模式' : '练习模式',
      modeDescription: mode === 'speed'
        ? '竞速模式：固定题数，完成后结算，过程中不提示对错，等级由「是否全对 + 总用时」决定。'
        : '练习模式：无限练习，即时纠错，由你主动结束，适合稳步提升。'
    })
    wx.showToast({ title: mode === 'speed' ? '已切换到竞速模式' : '已切换到练习模式', icon: 'none' })
  },

  startPractice(e) {
    const mode = e.currentTarget.dataset.mode || null
    const settings = this.data.settings
    const target = mode || settings.defaultMode
    const active = training.beginSession({
      module: MODULE_FIVE_DIVIDE_THREE,
      mode: target,
      questionCount: settings.defaultQuestionCount,
      allowedErrorRate: settings.defaultAllowedErrorRate,
      weakPatterns: this.data.overview ? this.data.overview.weakPatterns : [],
      weakConfig: settings.weakPattern
    })
    wx.navigateTo({ url: '/pages/training/training' })
  },

  startWrongReview() {
    const wrongQuestions = queries.loadWrongQuestions({ module: 'five-divide-three', status: 'active' })
    training.beginSession({
      module: 'five-divide-three',
      mode: 'training',
      questionCount: 0,
      allowedErrorRate: this.data.settings.defaultAllowedErrorRate,
      source: 'wrongQuestions',
      presetQuestions: training.wrongQuestionsToQuestions(wrongQuestions)
    })
    wx.navigateTo({ url: '/pages/training/training' })
  },

  goTo(e) {
    const page = e.currentTarget.dataset.page
    const urls = {
      wrong: '/pages/wrong/wrong',
      profile: '/pages/profile/profile?module=five-divide-three',
      weak: '/pages/weak/weak',
      diagnosis: '/pages/diagnosis/diagnosis'
    }
    const url = urls[page]
    if (url) {
      if (page === 'profile' || page === 'diagnosis') {
        wx.navigateTo({ url })
      } else {
        wx.navigateTo({ url })
      }
    }
  }
})
