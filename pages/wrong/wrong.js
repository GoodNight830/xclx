/**
 * 错题本页：错题列表 + 标记掌握 + 错题重练。
 */
const queries = require('../../utils/queries')
const storage = require('../../utils/storage')
const training = require('../../utils/training')
const format = require('../../utils/format')

Page({
  data: {
    tab: 'active',
    tabs: [
      { key: 'active', label: '未掌握' },
      { key: 'mastered', label: '已掌握' },
      { key: 'all', label: '全部' }
    ],
    list: [],
    totalCount: 0,
    activeCount: 0,
    masteredCount: 0,
    selectedIds: [],
    selectMode: false
  },

  onShow() {
    this.load()
  },

  load() {
    const all = queries.loadWrongQuestions({})
    const active = all.filter((q) => q.status === 'active')
    const mastered = all.filter((q) => q.status === 'mastered')
    const list = this.data.tab === 'active' ? active : this.data.tab === 'mastered' ? mastered : all

    this.setData({
      list: list.map((q) => ({
        ...q,
        errorRateLabel: q.errorRate !== null && q.errorRate !== undefined ? format.formatPercent(q.errorRate) : '—',
        lastWrongLabel: format.formatDateTime(q.lastWrongAt),
        selected: false
      })),
      totalCount: all.length,
      activeCount: active.length,
      masteredCount: mastered.length
    })
  },

  switchTab(e) {
    this.setData({ tab: e.currentTarget.dataset.key, selectedIds: [], selectMode: false })
    this.load()
  },

  toggleMastered(e) {
    const id = e.currentTarget.dataset.id
    const item = this.data.list.find((q) => q.id === id)
    if (!item) return
    const mastered = item.status !== 'mastered'
    queries.setWrongQuestionMastered(id, mastered)
    this.load()
  },

  // 批量选择
  toggleSelectMode() {
    this.setData({ selectMode: !this.data.selectMode, selectedIds: [] })
  },

  toggleSelect(e) {
    const id = e.currentTarget.dataset.id
    const selected = [...this.data.selectedIds]
    const idx = selected.indexOf(id)
    if (idx >= 0) selected.splice(idx, 1)
    else selected.push(id)
    this.setData({ selectedIds: selected })
  },

  batchMaster() {
    if (this.data.selectedIds.length === 0) return
    queries.setManyWrongQuestionsMastered(this.data.selectedIds, true)
    this.setData({ selectMode: false, selectedIds: [] })
    this.load()
  },

  startReview() {
    const wrongQuestions = queries.loadWrongQuestions({ status: 'active' })
    if (wrongQuestions.length === 0) {
      wx.showToast({ title: '没有未掌握错题', icon: 'none' })
      return
    }
    const settings = storage.settingsRepo.getSettings()
    training.beginSession({
      module: 'five-divide-three',
      mode: 'training',
      questionCount: 0,
      allowedErrorRate: settings.defaultAllowedErrorRate,
      source: 'wrongQuestions',
      presetQuestions: training.wrongQuestionsToQuestions(wrongQuestions)
    })
    wx.navigateTo({ url: '/pages/training/training' })
  }
})
