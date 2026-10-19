/**
 * 设置页：训练参数 + 薄弱点配置 + AI 配置 + 数据管理。
 */
const storage = require('../../utils/storage')
const queries = require('../../utils/queries')
const training = require('../../utils/training')
const { testAiConnection, fetchModelList } = require('../../utils/aiAnalysis')
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
    aiMaxTokens: 2000,
    providers: PROVIDERS,
    testing: false,
    // 模型列表：从服务商 /models 接口拉取，供用户点选
    modelList: [],
    modelIndex: -1,
    modelLoading: false,
    // 自动保存后的提示（避免用户以为没保存）
    savedHint: '',
    // 薄弱点
    weakEnable: true,
    minSampleCount: 10,
    minErrorCount: 3,
    maxReinforcementRatio: 35
  },

  _persistTimer: null,
  _modelTimer: null,

  onShow() {
    // 若上一次改动还在防抖等待中，先落盘：否则 load() 会用旧值覆盖刚填的内容
    this.flushPersist()
    this.load()
  },

  onHide() {
    this.flushPersist()
  },

  onUnload() {
    this.flushPersist()
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
      aiMaxTokens: settings.ai.maxOutputTokens,
      aiProvider: this.matchProvider(settings.ai.baseUrl),
      weakEnable: settings.weakPattern.enableReinforcement,
      minSampleCount: settings.weakPattern.minSampleCount,
      minErrorCount: settings.weakPattern.minErrorCount,
      maxReinforcementRatio: Math.round(settings.weakPattern.maxReinforcementRatio * 100),
      // 已拉取过模型列表时保持选中项同步（-1 在 picker 里非法，兜底 0）
      modelIndex: Math.max(0, this.data.modelList.indexOf(settings.ai.model))
    })
    this.refreshEndpoint()
    this.loadCounts()
  },

  loadCounts() {
    this.setData({ dataCounts: queries.loadDataCounts() })
  },

  // ---------- 保存（自动 + 手动） ----------

  /** 把当前表单值写入存储，返回是否成功 */
  writeSettings() {
    const settings = this.data.settings
    if (!settings) return false
    // 地址归一化：补协议、去尾部多余斜杠，避免存进去一个歪地址
    let baseUrl = this.data.aiBaseUrl
    try {
      const normalized = normalizeBaseUrl(baseUrl)
      if (normalized) baseUrl = normalized
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
        consentToUpload: this.data.aiConsent,
        maxOutputTokens: this.data.aiMaxTokens
      },
      weakPattern: {
        ...settings.weakPattern,
        enableReinforcement: this.data.weakEnable,
        minSampleCount: this.data.minSampleCount,
        minErrorCount: this.data.minErrorCount,
        maxReinforcementRatio: this.data.maxReinforcementRatio / 100
      }
    })
    return true
  },

  /**
   * 自动保存（防抖 300ms）。
   * 之前必须手动滚到页面底部点「保存设置」，用户常以为没有保存按钮，
   * 导致切到 AI 诊断 Tab 时读到的仍是旧配置、无法诊断。
   */
  schedulePersist() {
    if (this._persistTimer) clearTimeout(this._persistTimer)
    this._persistTimer = setTimeout(() => {
      this._persistTimer = null
      if (this.writeSettings()) this.setData({ savedHint: '已自动保存' })
    }, 300)
  },

  /** 立刻执行待落盘的保存（切 Tab / 离开页面 / 测试连接前调用） */
  flushPersist() {
    if (!this._persistTimer) return
    clearTimeout(this._persistTimer)
    this._persistTimer = null
    this.writeSettings()
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
    // 换了服务商，原来的模型名必然不适用；填了 Key 就顺便拉真实可用模型
    const shouldAutoLoad = key !== 'custom' && Boolean(this.data.aiApiKey)
    if (key !== 'custom') {
      patch.aiBaseUrl = provider.baseUrl
      // 预设的意义就是「地址+模型一起填对」：覆盖旧值（旧值可能是过时/写错的模型名）。
      // 选完仍可手动改，提示语里已说明。
      patch.aiModel = provider.model
      patch.modelList = []
      patch.modelIndex = -1
    }
    this.setData(patch, () => {
      this.refreshEndpoint()
      this.schedulePersist()
      if (shouldAutoLoad) this.loadModels({ silent: true, force: true })
    })
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
    }, () => this.schedulePersist())
  },
  onQuestionCountChange(e) {
    this.setData({ questionCount: Number(e.detail.value) }, () => this.schedulePersist())
  },
  onErrorRateChange(e) {
    this.setData({ allowedErrorRate: Number(e.detail.value) }, () => this.schedulePersist())
  },

  // AI
  onAiEnabledChange(e) {
    this.setData({ aiEnabled: e.detail.value }, () => this.schedulePersist())
  },
  onAiBaseUrlInput(e) {
    this.setData({ aiBaseUrl: e.detail.value, aiProvider: this.matchProvider(e.detail.value) }, () => {
      this.refreshEndpoint()
      this.schedulePersist()
    })
  },
  onAiApiKeyInput(e) {
    this.setData({ aiApiKey: e.detail.value }, () => this.schedulePersist())
  },
  /** Key 填完就自动拉模型，用户不必手填模型名 */
  onAiApiKeyBlur(e) {
    this.setData({ aiApiKey: e.detail.value }, () => {
      this.schedulePersist()
      if (this.data.aiApiKey && this.data.aiEnabled) this.loadModels({ silent: true })
    })
  },
  onAiModelInput(e) {
    const value = e.detail.value
    // picker 的 value 必须是非负下标；手填的名字可能不在列表里
    const idx = this.data.modelList.indexOf(value)
    this.setData({ aiModel: value, modelIndex: idx < 0 ? 0 : idx }, () => this.schedulePersist())
  },
  onAiConsentChange(e) {
    this.setData({ aiConsent: e.detail.value }, () => this.schedulePersist())
  },
  onAiMaxTokensChange(e) {
    this.setData({ aiMaxTokens: Number(e.detail.value) }, () => this.schedulePersist())
  },

  // ---------- 模型列表 ----------

  /** 从服务商 /models 接口拉取可用模型，供用户点选 */
  async loadModels(options) {
    const silent = options && options.silent
    const force = options && options.force
    if (this.data.modelLoading) return
    if (!this.data.aiApiKey) {
      if (!silent) wx.showToast({ title: '请先填写 API Key', icon: 'none' })
      return
    }
    this.setData({ modelLoading: true })
    try {
      const settings = storage.settingsRepo.getSettings()
      const list = await fetchModelList({
        ...settings.ai,
        baseUrl: this.data.aiBaseUrl,
        apiKey: this.data.aiApiKey
      })
      // 已有手填的模型名时不要擅自覆盖（除非是刚换了服务商、旧名必然失效）。
      // 列表照样展示，用户想换随时点选。
      const current = this.data.aiModel
      const preferred = !force && current ? current : this.pickPreferredModel(list, current)
      const index = list.indexOf(preferred)
      this.setData({
        modelList: list,
        modelIndex: index < 0 ? 0 : index,
        aiModel: preferred || list[0] || ''
      }, () => {
        this.refreshEndpoint()
        this.schedulePersist()
      })
      if (!silent) wx.showToast({ title: '已获取 ' + list.length + ' 个模型', icon: 'none' })
    } catch (err) {
      // 拉取失败不阻塞手工填写，只在非静默时提示原因
      if (!silent) {
        wx.showModal({ title: '获取模型列表失败', content: err.message || '未知错误', showCancel: false, confirmText: '知道了' })
      }
    } finally {
      this.setData({ modelLoading: false })
    }
  },

  /** 从列表里挑一个适合对话/分析的模型：保留当前值 > 排除非对话类 > 按关键词优先 */
  pickPreferredModel(list, current) {
    if (current && list.indexOf(current) !== -1) return current
    const notChat = /(embed|rerank|moderation|tts|whisper|dall|image|audio|vision|search)/i
    const usable = list.filter((m) => !notChat.test(m))
    const pool = usable.length ? usable : list
    const keywords = ['flash', 'chat', 'v4-pro', 'pro', 'v3']
    for (const kw of keywords) {
      const hit = pool.find((m) => m.toLowerCase().indexOf(kw) !== -1)
      if (hit) return hit
    }
    return pool[0] || current || ''
  },

  pickModel(e) {
    const index = Number(e.detail.value)
    const model = this.data.modelList[index]
    if (!model) return
    this.setData({ modelIndex: index, aiModel: model }, () => this.schedulePersist())
  },

  // 薄弱点
  onWeakEnableChange(e) {
    this.setData({ weakEnable: e.detail.value }, () => this.schedulePersist())
  },
  onMinSampleChange(e) {
    this.setData({ minSampleCount: Number(e.detail.value) }, () => this.schedulePersist())
  },
  onMinErrorChange(e) {
    this.setData({ minErrorCount: Number(e.detail.value) }, () => this.schedulePersist())
  },
  onMaxRatioChange(e) {
    this.setData({ maxReinforcementRatio: Number(e.detail.value) }, () => this.schedulePersist())
  },

  /** 手动保存（其实改动已自动保存，这个按钮只是给一个明确反馈） */
  save() {
    let autoFixed = false
    try {
      const normalized = normalizeBaseUrl(this.data.aiBaseUrl)
      if (normalized && normalized !== this.data.aiBaseUrl) autoFixed = true
    } catch (e) { /* 地址暂时不合法也允许保存，测试连接时会给出明确提示 */ }
    this.writeSettings()
    wx.showToast({ title: autoFixed ? '已保存（地址已自动修正）' : '已保存', icon: 'success' })
    this.setData({ savedHint: '已保存' })
    this.load()
  },

  async testAi() {
    if (this.data.testing) return
    // 先把当前表单落盘，测试通过后用户直接切到 AI 诊断就能用
    this.flushPersist()
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
      // 连通了但开关没开，用户到 AI 页仍会被拦——这里直接点明还差哪一步
      const missing = []
      if (!this.data.aiEnabled) missing.push('启用 AI 解读')
      if (!this.data.aiConsent) missing.push('同意发送聚合统计')
      if (missing.length) {
        wx.showModal({
          title: '连接成功',
          content: '还差一步：请打开「' + missing.join('」和「') + '」，AI 诊断才能生成报告。',
          showCancel: false,
          confirmText: '知道了'
        })
      } else {
        wx.showToast({ title: '连接成功', icon: 'success' })
      }
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
