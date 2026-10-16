/**
 * 首页：一级分类入口 + 今日概览。
 */
const queries = require('../../utils/queries')
const format = require('../../utils/format')

Page({
  data: {
    categories: [
      { key: 'basic', icon: '🧮', title: '基础计算', description: '加减乘除基本功，打好数资基础', available: true },
      { key: 'assist', icon: '🧩', title: '计算辅助', description: '计算练习的辅助针对性训练', available: false },
      { key: 'quantity', icon: '🔢', title: '数量关系专项', description: '提高对数字的敏感性', available: false },
      { key: 'material', icon: '📊', title: '资料分析专项', description: '常用公式的专项练习', available: false }
    ],
    overview: null,
    todayAccuracy: '—',
    todayAvg: '—'
  },

  onLoad() {
    this.loadOverview()
  },

  loadOverview() {
    try {
      const overview = queries.loadOverview('five-divide-three')
      const today = overview.today
      this.setData({
        overview,
        todayAccuracy: today.questionCount > 0 ? format.formatPercent(today.accuracy) : '—',
        todayAvg: today.questionCount > 0 ? format.formatMs(today.avgElapsedMs) : '—'
      })
    } catch (e) {
      this.setData({ overview: null })
    }
  },

  openCategory(e) {
    const key = e.currentTarget.dataset.key
    const category = this.data.categories.find((c) => c.key === key)
    if (!category) return
    if (category.available) {
      wx.navigateTo({ url: '/pages/basic/basic' })
    } else {
      wx.navigateTo({ url: '/pages/coming-soon/coming-soon?title=' + encodeURIComponent(category.title) })
    }
  }
})
