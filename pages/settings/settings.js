/**
 * 设置页：训练参数 + 薄弱点配置 + AI 配置 + 数据管理。
 */
const storage = require('../../utils/storage')
const queries = require('../../utils/queries')
const training = require('../../utils/training')
const { testAiConnection } = require('../../utils/aiAnalysis')
const { QUESTION_COUNT, ALLOWED_ERROR_RATE } = require('../../utils/config')
const { PROVIDERS, chatEndpoint, validateBaseUrl, normalizeBaseUrl, hostnameOf } = require('../../utils/aiUrl')

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
    aiProvider: 'deepseek',
    aiEndpoint: '',
    aiUrlError: '',
    providers: PROVIDERS,
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
      aiProvider: this.matchProvider(settings.ai.baseUrl),
      weakEnable: settings.weakPattern.enableReinforcement,
      minSampleCount: settings.weakPattern.minSampleCount,
      minErrorCount: settings.weakPattern.minErrorCount,
      maxReinforcementRatio: Math.round(settings.weakPattern.maxReinforcementRatio * 100)
    })
    this.refreshEndpoint()
    this.loadCounts()
  },

  loadCounts() {
    this.setData({ dataCounts: queries.loadDataCounts() })
  },

  // ---------- AI 接口地址 ----------

  /** 根据当前地址反查是哪个预设服务商（用于高亮 chip） */
  matchProvider(baseUrl) {
    const host = hostnameOf(baseUrl)
    if (!host) return 'custom'
    const hit = PROVIDERS.find((p) => p.baseUrl && hostnameOf(p.baseUrl) === host)
    return hit ? hit.key : 'custom'
  },

  /** 实时算出实际请求地址并做校验，让用户一眼看到最终会请求哪里 */
  refreshEndpoint() {
    const raw = this.data.aiBaseUrl
    let endpoint = ''
    let error = ''
    try {
      const base = validateBaseUrl(raw, { allowHttp: true })
      endpoint = chatEndpoint(base)
    } catch (err) {
      // 地址还没填完时给个宽松预览，只标出明显问题
      endpoint = chatEndpoint(raw)
      error = endpoint ? err.message : ''
    }
    this.setData({ aiEndpoint: endpoint, aiUrlError: error })
  },

  pickProvider(e) {
    const key = e.currentTarget.dataset.key
    const provider = PROVIDERS.find((p) => p.key === key)
    if (!provider) return
    const patch = { aiProvider: key, aiUrlError: '' }
    if (key !== 'custom') {
      patch.aiBaseUrl = provider.baseUrl
      // 预设的意义就是「地址+模型一起填对」：覆盖旧值（旧值可能是过时/写错的模型名）。
      // 选完仍可手动改，提示语里已说明。
      patch.aiModel = provider.model
    }
    this.setData(patch, () => this.refreshEndpoint())
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
    this.setData({ aiBaseUrl: e.detail.value, aiProvider: this.matchProvider(e.detail.value) }, () => this.refreshEndpoint())
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
    // 保存前把地址归一化：补协议、去掉尾部多余的斜杠，避免存进去一个歪的地址
    let baseUrl = this.data.aiBaseUrl
    let autoFixed = false
    try {
      const normalized = normalizeBaseUrl(baseUrl)
      if (normalized && normalized !== baseUrl) {
        baseUrl = normalized
        autoFixed = true
      }
    } catch (e) { /* 地址暂时不合法也允许保存，测试连接时会给出明确提示 */ }

    storage.settingsRepo.saveSettings({
      ...settings,
      defaultMode: this.data.defaultMode,
      defaultQuestionCount: this.data.questionCount,
      defaultAllowedErrorRate: this.data.allowedErrorRate,
      ai: {
        ...settings.ai,
        enabled: this.data.aiEnabled,
        baseUrl,
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
    wx.showToast({ title: autoFixed ? '已保存（地址已自动修正）' : '已保存', icon: 'success' })
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
      if (!testSettings.model) throw new Error('请先填写模型名称，例如 deepseek-flash')
      await testAiConnection(testSettings)
      wx.showToast({ title: '连接成功', icon: 'success' })
    } catch (err) {
      // toast 只能显示十几个字，排查类错误必须用弹窗显示完整内容
      wx.showModal({
        title: '连接失败',
        content: err.message || '未知错误',
        showCancel: false,
        confirmText: '知道了'
      })
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
