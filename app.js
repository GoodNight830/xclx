/**
 * 小程序全局逻辑。
 * 基础计算训练系统（微信小程序版）—— 从 Web 版（Vue3 + Dexie）迁移而来。
 * 本地优先：训练数据仅保存在本机（wx.storage），不联网。
 */

App({
  onLaunch() {
    // 初始化存储（wx.storage 无需显式建库，按需读写即可）
  },

  globalData: {
    // 当前进行中的训练会话（内存态，训练页与结果页共享）
    activeSession: null,

    // AI 诊断是 Tab 页，wx.switchTab 不允许带 URL 参数，
    // 因此各子模块跳转前先把目标模块写在这里，AI 诊断页 onShow 读取后清空。
    aiEntryModule: ''
  }
})
