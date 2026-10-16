/**
 * AI 解读页：模块切换 + 生成 AI 报告 + 历史报告。
 * 前端直连 AI 服务（deepseek）。
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
    diagnosis: null,
    latestAi: null,
    aiHistory: [],
    canAnalyze: false,
    generating: false,
    elapsedSeconds: 0,
    errorText: '',
    aiDetailExpanded: false,
    historyExpanded: false,
    hasData: false
  },

  timerHandle: null,

  onLoad(options) {
    const moduleOptions = listAiModules().map((m) => ({ id: m.meta.id, title: m.meta.title, subtitle: m.meta.subtitle }))
    let selectedModule = MODULE_FIVE_DIVIDE_THREE
    if (options.module && moduleOptions.some((m) => m.id === options.module)) {
      selectedModule = options.module
    }
    this.setData({
      moduleOptions,
      selectedModule,
      selectedModuleTitle: moduleOptions.find((m) => m.id === selectedModule)?.title || '五除三'
    })
    this.load()
  },

  onUnload() {
    if (this.timerHandle) clearInterval(this.timerHandle)
  },

  load() {
    const settings = storage.settingsRepo.getSettings()
    const bundle = queries.loadDiagnosis(this.data.selectedModule)
    this.setData({
      diagnosis: bundle.diagnosis,
      latestAi: bundle.latestAi,
      aiHistory: bundle.aiHistory,
      canAnalyze: settings.ai.enabled && settings.ai.consentToUpload && Boolean(settings.ai.model),
      hasData: bundle.diagnosis.lifetime.sampleCount > 0
    })
  },

  switchModule(e) {
    const module = this.data.moduleOptions[e.detail.value]
    if (!module) return
    this.setData({ selectedModule: module.id, selectedModuleTitle: module.title })
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
