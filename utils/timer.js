/**
 * 计时工具（迁移自 services/timer.ts）。
 * 小程序无 performance.now 时回退 Date.now。
 */

let monotonicNow = function () {
  try {
    if (typeof wx !== 'undefined' && wx.getPerformance) {
      const perf = wx.getPerformance()
      if (perf && typeof perf.now === 'function') return perf.now()
    }
  } catch (e) { /* ignore */ }
  if (typeof globalThis !== 'undefined' && globalThis.performance && typeof globalThis.performance.now === 'function') {
    return globalThis.performance.now()
  }
  return Date.now()
}

function now() {
  return monotonicNow()
}

function elapsedSince(startMonotonic) {
  return Math.max(0, Math.round(now() - startMonotonic))
}

module.exports = { now, elapsedSince }
