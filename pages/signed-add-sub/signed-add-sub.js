/**
 * 正负运算入口页（不参与 AI/诊断/薄弱点）。
 */
const storage = require('../../utils/storage')
const training = require('../../utils/training')
const { MODULE_SIGNED_ADD_SUB } = require('../../utils/config')

Page({
  data: {
    settings: null,
    starting: ''
  },

  onShow() {
    this.setData({ settings: storage.settingsRepo.getSettings() })
  },

  start(e) {
    const mode = e.currentTarget.dataset.mode
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
