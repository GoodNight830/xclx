/**
 * AI 诊断页（Tab 页）：选择模块 → 生成 AI 报告 → 历史报告。
 * 前端直连 AI 服务（deepseek）。
 *
 * 说明：本页是 tabBar 页面，wx.switchTab 不允许携带 URL 参数，
 * 因此外部想指定模块时写在 app.globalData.aiEntryModule 上，本页在
 * onShow 里读取并清空（onLoad 的参数形式仍兼容，便于将来 navigateTo 复用）。
 */
const queries = require('../../utils/queries')
const storage = require('../../utils/storage')
const format = require('../../utils/format')
const { listAiModules } = require('../../utils/registry')
const { MODULE_FIVE_DIVIDE_THREE } = require('../../utils/config')
const { requestAiReport, testAiConnection, formatAiReportText, PROMPT_VERSION } = require('../../utils/aiAnalysis')
const { newId } = require('../../utils/id')

Page({
  data: {
    moduleOptions: [],
    selectedModule: MODULE_FIVE_DIVIDE_THREE,
    selectedModuleTitle: '五除三',
    selectedModuleSubtitle: '',
    diagnosis: null,
    latestAi: null,
    aiHistory: [],
    canAnalyze: false,
    generating: false,
    elapsedSeconds: 0,
    errorText: '',
    aiDetailExpanded: false,
    historyExpanded: false,
    hasData: false,
    // 不能生成诊断时的具体原因（缺哪一项配置）
    blockReason: ''
  },

  timerHandle: null,

  onLoad(options) {
    const options2 = options || {}
    // 模块清单来自注册表，新增支持 AI 的模块会自动出现在这里
    this._moduleList = listAiModules().map((m) => ({ id: m.meta.id, title: m.meta.title, subtitle: m.meta.subtitle }))
    this.setData({ moduleOptions: this._moduleList })
    this.applyIncomingModule(options2.module)
  },

  // Tab 页每次切到前台都会触发：读取外部指定的模块并刷新数据。
  // 正在生成报告时不刷新，避免按钮状态与计时被打断。
  onShow() {
    const app = getApp()
    const wanted = app && app.globalData ? app.globalData.aiEntryModule : ''
    if (wanted) {
      app.globalData.aiEntryModule = ''
      if (wanted !== this.data.selectedModule) {
        this.applyIncomingModule(wanted)
        return
      }
    }
    if (!this.data.generating) this.load()
  },

  onUnload() {
    if (this.timerHandle) clearInterval(this.timerHandle)
  },

  // 选中指定模块（无效值回退到第一个可用模块）
  applyIncomingModule(moduleId) {
    const fallback = this._moduleList[0] || { id: MODULE_FIVE_DIVIDE_THREE, title: '五除三', subtitle: '' }
    const incoming = moduleId && this._moduleList.find((m) => m.id === moduleId)
    const current = incoming || fallback
    this.setData({
      selectedModule: current.id,
      selectedModuleTitle: current.title,
      selectedModuleSubtitle: current.subtitle || ''
    })
  },

  load() {
    const settings = storage.settingsRepo.getSettings()
    const bundle = queries.loadDiagnosis(this.data.selectedModule)
    // 逐项检查配置，把「为什么还不能诊断」直接说清楚。
    // 之前只给一个「配置 AI 服务」按钮，用户不知道是开关没开、同意没勾还是模型没填。
    let blockReason = ''
    if (!settings.ai.enabled) blockReason = '未启用 AI 解读：请到「设置 → AI 解读」打开开关'
    else if (!settings.ai.apiKey) blockReason = '未填写 API Key：请到「设置 → AI 解读」填写'
    else if (!settings.ai.model) blockReason = '未选择模型：请到「设置 → AI 解读」点「拉取模型」后选择'
    else if (!settings.ai.consentToUpload) blockReason = '未同意发送聚合统计：请到「设置 → AI 解读」打开该开关'
    this.setData({
      diagnosis: bundle.diagnosis,
      latestAi: bundle.latestAi,
      aiHistory: bundle.aiHistory,
      canAnalyze: !blockReason,
      blockReason,
      hasData: bundle.diagnosis.lifetime.sampleCount > 0
    })
  },

  // 由点击直接切换模块（原来是 picker，e.detail.value 传的是下标，容易与模块 id 混淆）
  switchModule(e) {
    const id = e.currentTarget.dataset.id
    const target = this.data.moduleOptions.find((m) => m.id === id)
    if (!target || target.id === this.data.selectedModule) return
    this.setData({
      selectedModule: target.id,
      selectedModuleTitle: target.title,
      selectedModuleSubtitle: target.subtitle || ''
    })
    this.load()
  },

  toggleDetail() {
    this.setData({ aiDetailExpanded: !this.data.aiDetailExpanded })
  },

  toggleHistory() {
    this.setData({ historyExpanded: !this.data.historyExpanded })
  },

  async generate() {
    if (this.data.generating) return
    const diagnosis = this.data.diagnosis
    if (!diagnosis) return

    const settings = storage.settingsRepo.getSettings()
    if (this.data.latestAi && this.data.latestAi.dataHash === diagnosis.dataHash) {
      wx.showToast({ title: '数据无变化', icon: 'none' })
      return
    }

    this.setData({ generating: true, elapsedSeconds: 0, errorText: '' })
    this.timerHandle = setInterval(() => {
      this.setData({ elapsedSeconds: this.data.elapsedSeconds + 1 })
    }, 1000)

    try {
      const report = await requestAiReport(settings.ai, diagnosis)
      const snapshot = {
        id: newId(),
        module: diagnosis.module,
        createdAt: new Date().toISOString(),
        dataHash: diagnosis.dataHash,
        questionCount: diagnosis.lifetime.sampleCount,
        model: settings.ai.model,
        promptVersion: PROMPT_VERSION,
        report
      }
      storage.aiSnapshotsRepo.saveAiAnalysis(snapshot)
      this.setData({
        latestAi: snapshot,
        aiHistory: [snapshot, ...this.data.aiHistory]
      })
    } catch (err) {
      this.setData({ errorText: err.message || 'AI 分析失败，已保留本地诊断' })
    } finally {
      if (this.timerHandle) clearInterval(this.timerHandle)
      this.timerHandle = null
      this.setData({ generating: false })
    }
  },

  goSettings() {
    wx.switchTab({ url: '/pages/settings/settings' })
  }
})
