/**
 * 唯一 ID 生成（迁移自 utils/id.ts）。
 * 小程序无 crypto.randomUUID 时回退到时间戳 + 随机数。
 */

function newId() {
  try {
    if (typeof wx !== 'undefined' && typeof globalThis.crypto !== 'undefined' && typeof globalThis.crypto.randomUUID === 'function') {
      return globalThis.crypto.randomUUID()
    }
  } catch (e) { /* ignore */ }
  const rand = Math.random().toString(36).slice(2, 10)
  return 'id-' + Date.now().toString(36) + '-' + rand
}

/** 错题唯一键：被除数 + 除数 */
function questionKeyOf(dividend, divisor) {
  return dividend + ':' + divisor
}

module.exports = { newId, questionKeyOf }
