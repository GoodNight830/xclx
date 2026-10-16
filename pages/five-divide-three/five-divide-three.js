/**
 * 五除三入口页：训练模式 / 竞速模式 / 错题重练 / AI 诊断入口。
 */
const storage = require('../../utils/storage')
const training = require('../../utils/training')
const queries = require('../../utils/queries')
const format = require('../../utils/format')
const { MODULE_FIVE_DIVIDE_THREE } = require('../../utils/config')

Page({
  data: {
    settings: null,
    wrongCount: 0,
    weakRanges: [],
    hasReinforcement: false,
    starting: ''
  },

  onShow() {
    this.load()
  },

  load() {
    const settings = storage.settingsRepo.getSettings()
    const wrongQuestions = queries.loadWrongQuestions({ module: 'five-divide-three', status: 'active' })
    const weakPatterns = storage.weakPatternsRepo.listWeakPatterns('five-divide-three')
    const weakRanges = weakPatterns.filter((p) => p.reinforcementWeight > 0)
    const hasReinforcement = settings.weakPattern.enableReinforcement && weakRanges.length > 0

    this.setData({
      settings,
      wrongCount: wrongQuestions.length,
      weakRanges: weakRanges.map((p) => ({
        ...p,
        errorRateLabel: format.formatPercent(p.errorRate)
      })),
      hasReinforcement
    })
  },

  start(e) {
    const mode = e.currentTarget.dataset.mode
    this.setData({ starting: mode })
    try {
      const settings = this.data.settings
      const weakPatterns = storage.weakPatternsRepo.listWeakPatterns('five-divide-three')
      training.beginSession({
        module: MODULE_FIVE_DIVIDE_THREE,
        mode,
        questionCount: settings.defaultQuestionCount,
        allowedErrorRate: settings.defaultAllowedErrorRate,
        weakPatterns,
        weakConfig: settings.weakPattern
      })
      wx.navigateTo({ url: '/pages/training/training' })
    } catch (err) {
      wx.showToast({ title: err.message || '开始失败', icon: 'none' })
    } finally {
      this.setData({ starting: '' })
    }
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

  goAi() {
    wx.navigateTo({ url: '/pages/ai/ai?module=five-divide-three' })
  },

  goSettings() {
    wx.switchTab({ url: '/pages/settings/settings' })
  }
})
