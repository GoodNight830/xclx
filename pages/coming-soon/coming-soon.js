Page({
  data: {
    title: ''
  },
  onLoad(options) {
    if (options.title) {
      this.setData({ title: decodeURIComponent(options.title) })
      wx.setNavigationBarTitle({ title: options.title ? decodeURIComponent(options.title) : '敬请期待' })
    }
  },
  goBack() {
    wx.navigateBack()
  }
})
