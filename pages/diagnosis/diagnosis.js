/**
 * 能力诊断页：本地诊断（长期基线与近期变化），含 AI 解读跳转入口。
 */
const queries = require('../../utils/queries')
const format = require('../../utils/format')
const { listDiagnosableModules } = require('../../utils/registry')
const { MODULE_FIVE_DIVIDE_THREE } = require('../../utils/config')

Page({
  data: {
    moduleOptions: [],
    selectedModule: MODULE_FIVE_DIVIDE_THREE,
    moduleIndex: 0,
    selectedModuleTitle: '五除三',
    diagnosis: null,
    focusRanges: [],
    improvedCount: 0,
    focusExpanded: false,
    hasData: false
  },

  onLoad(options) {
    const moduleOptions = listDiagnosableModules().map((m) => ({
      id: m.meta.id,
      title: m.meta.title,
      subtitle: m.meta.subtitle
    }))
    let selectedModule = MODULE_FIVE_DIVIDE_THREE
    if (options.module && moduleOptions.some((m) => m.id === options.module)) {
      selectedModule = options.module
    }
    const selectedModuleTitle = (moduleOptions.find((m) => m.id === selectedModule) || {}).title || '五除三'
    // picker 的 value 要的是下标，不是模块 id（原先直接把 id 传进去，属于类型错配）
    const selectedIndex = moduleOptions.findIndex((m) => m.id === selectedModule)
    const moduleIndex = selectedIndex >= 0 ? selectedIndex : 0
    this.setData({ moduleOptions, selectedModule, moduleIndex, selectedModuleTitle })
    this.load()
  },

  load() {
    const bundle = queries.loadDiagnosis(this.data.selectedModule)
    const diagnosis = bundle.diagnosis
    const focusRanges = diagnosis.ranges
      .filter((r) => r.recent7.sampleCount >= 10)
      .slice(0, 3)
      .map((r) => this.decorateRange(r))
    const improvedCount = diagnosis.ranges.filter((r) => r.trend === 'improving').length

    this.setData({
      diagnosis,
      focusRanges,
      improvedCount,
      hasData: diagnosis.lifetime.sampleCount > 0
    })
  },

  decorateRange(r) {
    const trendLabelMap = { improving: '近期改善', worsening: '近期恶化', stable: '基本稳定', insufficient_data: '数据不足' }
    const confidenceMap = { insufficient: '数据不足', low: '低', medium: '中', high: '高' }
    const badgeClass = r.trend === 'worsening' ? 'badge-warning' : r.trend === 'improving' ? 'badge-success' : ''
    return {
      ...r,
      trendLabel: trendLabelMap[r.trend] || r.trend,
      confidenceLabel: confidenceMap[r.confidence] || r.confidence,
      trendBadgeClass: badgeClass,
      recent7ErrorRate: format.formatPercent(r.recent7.errorRate),
      lifetimeErrorRate: format.formatPercent(r.lifetime.errorRate)
    }
  },

  switchModule(e) {
    const index = Number(e.detail.value)
    const module = this.data.moduleOptions[index]
    if (!module) return
    this.setData({ selectedModule: module.id, moduleIndex: index, selectedModuleTitle: module.title })
    this.load()
  },

  toggleFocus() {
    this.setData({ focusExpanded: !this.data.focusExpanded })
  },

  goAi() {
    const app = getApp()
    if (app && app.globalData) app.globalData.aiEntryModule = this.data.selectedModule
    wx.switchTab({ url: '/pages/ai/ai' })
  }
})
