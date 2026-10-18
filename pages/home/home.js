/**
 * 首页：一级分类入口 + 今日概览。
 *
 * 本页是 tabBar 页面：Tab 页的 onLoad 只会在第一次进入时执行一次，
 * 之后在 Tab 之间来回切换只会触发 onShow。因此数据加载必须放在 onShow，
 * 否则完成训练后切回首页看到的仍是旧数据（只能靠重新编译才刷新）。
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

  // 每次进入 / 切回本 Tab 都重新读一次存储，保证今日概览与最新训练同步
  onShow() {
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
