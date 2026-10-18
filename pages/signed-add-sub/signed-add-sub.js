/**
 * 正负运算入口页（不参与 AI/诊断/薄弱点）。
 */
const storage = require('../../utils/storage')
const training = require('../../utils/training')
const { MODULE_SIGNED_ADD_SUB } = require('../../utils/config')

Page({
  data: {
    settings: null,
    modeLabel: '练习模式',
    modeDescription: '',
    starting: ''
  },

  onShow() {
    const settings = storage.settingsRepo.getSettings()
    const isSpeed = settings.defaultMode === 'speed'
    this.setData({
      settings,
      modeLabel: isSpeed ? '竞速模式' : '练习模式',
      modeDescription: isSpeed
        ? settings.defaultQuestionCount + ' 题 · 完成后结算 · 过程中不提示对错'
        : '无限练习 · 即时纠错 · 由你主动结束'
    })
  },

  // 切换训练模式（沿用基础计算页的总开关）
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
        ? settings.defaultQuestionCount + ' 题 · 完成后结算 · 过程中不提示对错'
        : '无限练习 · 即时纠错 · 由你主动结束'
    })
  },

  start() {
    const mode = this.data.settings.defaultMode || 'training'
    this.setData({ starting: mode })
    try {
      const settings = this.data.settings
      training.beginSession({
        module: MODULE_SIGNED_ADD_SUB,
        mode,
        questionCount: settings.defaultQuestionCount,
        allowedErrorRate: 0
      })
      wx.navigateTo({ url: '/pages/training/training' })
    } catch (err) {
      wx.showToast({ title: err.message || '开始失败', icon: 'none' })
    } finally {
      this.setData({ starting: '' })
    }
  },

  goSettings() {
    wx.switchTab({ url: '/pages/settings/settings' })
  }
})
