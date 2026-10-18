/**
 * 基础计算页：模式总开关 + 训练模块 + 薄弱点提示 + 训练工具 + 错题重练。
 *
 * 说明：
 * - 「今日概览」统一放在「首页」Tab，这里不重复渲染同一份数据。
 * - 点题型即直接开练，不再经模块详情页中转；原 five-divide-three / signed-add-sub
 *   两个详情页的内容已全部被设置页、薄弱点页、能力诊断页覆盖，已下线。
 * - 已开放模块列表从 utils/registry 读取，模块的 description 与「是否支持 AI 诊断」
 *   都以注册表为唯一数据源，避免页面里再硬编码一套。
 */
const queries = require('../../utils/queries')
const storage = require('../../utils/storage')
const { weakPatternSuggestion } = require('../../utils/weakPattern')
const training = require('../../utils/training')
const { arithmeticModules } = require('../../utils/registry')
const { MODULE_FIVE_DIVIDE_THREE, MODULE_SIGNED_ADD_SUB } = require('../../utils/config')

// 尚未实现的题型（占位，等算法完成后到 registry 里注册即可）
const UPCOMING_TOPICS = [
  { key: 'three-add', title: '三位数加法' },
  { key: 'three-sub', title: '三位数减法' },
  { key: 'three-add-sub', title: '三位数加减' },
  { key: 'four-add', title: '四位数加法' },
  { key: 'three-mul-one', title: '三位数乘一位数' },
  { key: 'three-div-one', title: '三位数除一位数' },
  { key: 'two-mul-two', title: '两位数乘两位数' },
  { key: 'mul-estimate', title: '乘法估算' }
]

function buildAvailableTopics() {
  return arithmeticModules
    .filter((m) => m.meta.enabled)
    .map((m) => ({
      key: m.meta.id,
      title: m.meta.subtitle || m.meta.title,
      desc: m.meta.description || '',
      aiSupported: Boolean(m.meta.aiSupported)
    }))
}

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
    availableTopics: [],
    upcomingTopics: UPCOMING_TOPICS
  },

  onLoad() {
    this.setData({ availableTopics: buildAvailableTopics() })
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

  // 直接使用总开关选好的模式开始训练，不再进入中间页
  openTopic(e) {
    const key = e.currentTarget.dataset.key
    if (!this.data.availableTopics.some((t) => t.key === key)) return
    this.startModule(key)
  },

  // 子模块的「AI 诊断」入口：只做跳转，由 AI 诊断页自动选中该模块并展示最近的诊断数据
  goModuleDiagnosis(e) {
    const key = e.currentTarget.dataset.key
    if (!key) return
    wx.navigateTo({ url: '/pages/ai/ai?module=' + key })
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
