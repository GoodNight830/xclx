/**
 * 基础计算页：模式总开关 + 快速开始 + 题型网格 + 模块信息 + 薄弱点 + 训练工具。
 * 说明：今日概览统一放在「首页」Tab，这里不再重复渲染同一份数据。
 */
const queries = require('../../utils/queries')
const storage = require('../../utils/storage')
const { weakPatternSuggestion } = require('../../utils/weakPattern')
const training = require('../../utils/training')
const { MODULE_FIVE_DIVIDE_THREE, MODULE_SIGNED_ADD_SUB } = require('../../utils/config')

Page({
  data: {
    overview: null,
    loading: true,
    errorMessage: '',
    settings: null,
    modeLabel: '练习模式',
    modeDescription: '',
    unmasteredWrongCount: 0,
    weakHint: '',
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

      const weakHint = this.computeWeakHint(overview.weakPatterns)

      this.setData({
        overview,
        loading: false,
        settings,
        modeLabel: settings.defaultMode === 'speed' ? '竞速模式' : '练习模式',
        modeDescription: settings.defaultMode === 'speed'
          ? '竞速模式：固定题数，完成后结算，过程中不提示对错，等级由「是否全对 + 总用时」决定。'
          : '练习模式：无限练习，即时纠错，由你主动结束，适合稳步提升。',
        unmasteredWrongCount: overview.unmasteredWrongCount,
        weakHint
      })
    } catch (e) {
      this.setData({ loading: false, errorMessage: e.message || '加载失败' })
    }
  },

  computeWeakHint(patterns) {
    const pattern = (patterns || []).find((item) => item.status !== 'resolved' && item.reinforcementWeight > 0)
    return pattern ? weakPatternSuggestion(pattern) : ''
  },

  // 点题型直接使用总开关选好的模式开始训练，不再进入中间页
  openTopic(e) {
    const key = e.currentTarget.dataset.key
    const topic = this.data.topics.find((t) => t.key === key)
    if (!topic || !topic.available) return
    this.startModule(key)
  },

  startModule(key) {
    const settings = this.data.settings
    if (!settings) return
    const mode = settings.defaultMode || 'training'
    try {
      if (key === 'signed-add-sub') {
        training.beginSession({
          module: MODULE_SIGNED_ADD_SUB,
          mode,
          questionCount: settings.defaultQuestionCount,
          allowedErrorRate: 0
        })
      } else {
        training.beginSession({
          module: MODULE_FIVE_DIVIDE_THREE,
          mode,
          questionCount: settings.defaultQuestionCount,
          allowedErrorRate: settings.defaultAllowedErrorRate,
          weakPatterns: this.data.overview ? this.data.overview.weakPatterns : [],
          weakConfig: settings.weakPattern
        })
      }
      wx.navigateTo({ url: '/pages/training/training' })
    } catch (err) {
      wx.showToast({ title: err.message || '开始失败', icon: 'none' })
    }
  },

  // 次要入口：查看模块详情（配置 / 强化范围 / 错题重练 / AI 入口）
  goModuleInfo(e) {
    const page = e.currentTarget.dataset.page
    const urls = {
      'five-divide-three': '/pages/five-divide-three/five-divide-three',
      'signed-add-sub': '/pages/signed-add-sub/signed-add-sub'
    }
    if (urls[page]) wx.navigateTo({ url: urls[page] })
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
