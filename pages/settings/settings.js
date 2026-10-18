/**
 * 设置页：训练参数 + 薄弱点配置 + AI 配置 + 数据管理。
 */
const storage = require('../../utils/storage')
const queries = require('../../utils/queries')
const training = require('../../utils/training')
const { testAiConnection } = require('../../utils/aiAnalysis')
const { QUESTION_COUNT, ALLOWED_ERROR_RATE } = require('../../utils/config')

Page({
  data: {
    settings: null,
    dataCounts: null,
    // 表单状态
    modeOptions: ['练习模式', '竞速模式'],
    modeIndex: 0,
    modeLabel: '练习模式',
    defaultMode: 'training',
    questionCount: 10,
    allowedErrorRate: 3,
    // AI
    aiEnabled: false,
    aiBaseUrl: 'https://api.deepseek.com',
    aiApiKey: '',
    aiModel: '',
    aiConsent: false,
    testing: false,
    // 薄弱点
    weakEnable: true,
    minSampleCount: 10,
    minErrorCount: 3,
    maxReinforcementRatio: 35
  },

  onShow() {
    this.load()
  },

  load() {
    const settings = storage.settingsRepo.getSettings()
    const isSpeed = settings.defaultMode === 'speed'
    this.setData({
      settings,
      modeIndex: isSpeed ? 1 : 0,
      modeLabel: isSpeed ? '竞速模式' : '练习模式',
      defaultMode: isSpeed ? 'speed' : 'training',
      questionCount: settings.defaultQuestionCount,
      allowedErrorRate: settings.defaultAllowedErrorRate,
      aiEnabled: settings.ai.enabled,
      aiBaseUrl: settings.ai.baseUrl,
      aiApiKey: settings.ai.apiKey,
      aiModel: settings.ai.model,
      aiConsent: settings.ai.consentToUpload,
      weakEnable: settings.weakPattern.enableReinforcement,
      minSampleCount: settings.weakPattern.minSampleCount,
      minErrorCount: settings.weakPattern.minErrorCount,
      maxReinforcementRatio: Math.round(settings.weakPattern.maxReinforcementRatio * 100)
    })
    this.loadCounts()
  },

  loadCounts() {
    this.setData({ dataCounts: queries.loadDataCounts() })
  },

  // 训练参数
  onModeChange(e) {
    // picker 返回的是下标，必须转回字符串，否则存进去的 0/1 会让其它页面的
    // 「defaultMode === 'speed'」判断永远为假，导致切换竞速模式不生效。
    const index = Number(e.detail.value)
    const isSpeed = index === 1
    this.setData({
      modeIndex: index,
      modeLabel: isSpeed ? '竞速模式' : '练习模式',
      defaultMode: isSpeed ? 'speed' : 'training'
    })
  },
  onQuestionCountChange(e) {
    this.setData({ questionCount: Number(e.detail.value) })
  },
  onErrorRateChange(e) {
    this.setData({ allowedErrorRate: Number(e.detail.value) })
  },

  // AI
  onAiEnabledChange(e) {
    this.setData({ aiEnabled: e.detail.value })
  },
  onAiBaseUrlInput(e) {
    this.setData({ aiBaseUrl: e.detail.value })
  },
  onAiApiKeyInput(e) {
    this.setData({ aiApiKey: e.detail.value })
  },
  onAiModelInput(e) {
    this.setData({ aiModel: e.detail.value })
  },
  onAiConsentChange(e) {
    this.setData({ aiConsent: e.detail.value })
  },

  // 薄弱点
  onWeakEnableChange(e) {
    this.setData({ weakEnable: e.detail.value })
  },
  onMinSampleChange(e) {
    this.setData({ minSampleCount: Number(e.detail.value) })
  },
  onMinErrorChange(e) {
    this.setData({ minErrorCount: Number(e.detail.value) })
  },
  onMaxRatioChange(e) {
    this.setData({ maxReinforcementRatio: Number(e.detail.value) })
  },

  save() {
    const settings = this.data.settings
    storage.settingsRepo.saveSettings({
      ...settings,
      defaultMode: this.data.defaultMode,
      defaultQuestionCount: this.data.questionCount,
      defaultAllowedErrorRate: this.data.allowedErrorRate,
      ai: {
        ...settings.ai,
        enabled: this.data.aiEnabled,
        baseUrl: this.data.aiBaseUrl,
        apiKey: this.data.aiApiKey,
        model: this.data.aiModel,
        consentToUpload: this.data.aiConsent
      },
      weakPattern: {
        ...settings.weakPattern,
        enableReinforcement: this.data.weakEnable,
        minSampleCount: this.data.minSampleCount,
        minErrorCount: this.data.minErrorCount,
        maxReinforcementRatio: this.data.maxReinforcementRatio / 100
      }
    })
    wx.showToast({ title: '已保存', icon: 'success' })
    this.load()
  },

  async testAi() {
    if (this.data.testing) return
    this.setData({ testing: true })
    try {
      const settings = storage.settingsRepo.getSettings()
      const testSettings = {
        ...settings.ai,
        enabled: true,
        baseUrl: this.data.aiBaseUrl,
        apiKey: this.data.aiApiKey,
        model: this.data.aiModel,
        consentToUpload: true
      }
      await testAiConnection(testSettings)
      wx.showToast({ title: '连接成功', icon: 'success' })
    } catch (err) {
      wx.showToast({ title: err.message || '连接失败', icon: 'none' })
    } finally {
      this.setData({ testing: false })
    }
  },

  resetSettings() {
    wx.showModal({
      title: '恢复默认',
      content: '确定恢复所有设置为默认值吗？',
      success: (res) => {
        if (!res.confirm) return
        storage.settingsRepo.resetSettings()
        this.load()
        wx.showToast({ title: '已恢复默认', icon: 'success' })
      }
    })
  },

  clearAllData() {
    wx.showModal({
      title: '清空数据',
      content: '确定清空所有训练数据吗？此操作不可恢复！',
      confirmText: '清空',
      confirmColor: '#ef4444',
      success: (res) => {
        if (!res.confirm) return
        training.clearAllData()
        this.loadCounts()
        wx.showToast({ title: '已清空', icon: 'success' })
      }
    })
  }
})
