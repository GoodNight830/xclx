/**
 * 格式化工具（迁移自 services/format.ts，纯函数）。
 */

const pad2 = (value) => value.toString().padStart(2, '0')

function toDate(iso) {
  if (!iso) return null
  const date = new Date(iso)
  return Number.isNaN(date.getTime()) ? null : date
}

function formatSeconds(ms, decimals = 1) {
  if (!Number.isFinite(ms)) return '—'
  return (ms / 1000).toFixed(decimals)
}

function formatMs(ms) {
  if (ms === null || ms === undefined || !Number.isFinite(ms)) return '—'
  return formatSeconds(ms) + 's'
}

function formatDuration(ms) {
  if (ms === null || ms === undefined || !Number.isFinite(ms)) return '—'
  const totalSeconds = ms / 1000
  if (totalSeconds < 60) return totalSeconds.toFixed(1) + '秒'
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = Math.round(totalSeconds - minutes * 60)
  const secText = seconds.toString().padStart(2, '0')
  return minutes + '分' + secText + '秒'
}

function formatDate(iso) {
  const date = toDate(iso)
  if (!date) return '—'
  return date.getFullYear() + '-' + pad2(date.getMonth() + 1) + '-' + pad2(date.getDate())
}

function formatDateTime(iso) {
  const date = toDate(iso)
  if (!date) return '—'
  return formatDate(iso) + ' ' + pad2(date.getHours()) + ':' + pad2(date.getMinutes())
}

function localDateKey(value) {
  const date = typeof value === 'string' ? toDate(value) : value
  if (!date) return '—'
  return date.getFullYear() + '-' + pad2(date.getMonth() + 1) + '-' + pad2(date.getDate())
}

function relativeDayLabel(iso, now) {
  const date = toDate(iso)
  if (!date) return '—'
  const ref = now || new Date()
  const key = localDateKey(date)
  if (key === localDateKey(ref)) return '今天'
  const yesterday = new Date(ref.getTime() - 24 * 60 * 60 * 1000)
  if (key === localDateKey(yesterday)) return '昨天'
  return key
}

function formatPercent(value, decimals = 1) {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—'
  return value.toFixed(decimals) + '%'
}

const TIME_RANGE_LABELS = {
  today: '今天',
  '7d': '近7天',
  '30d': '近30天',
  all: '全部'
}

function rangeStartDate(range, now) {
  const start = new Date((now || new Date()).getFullYear(), (now || new Date()).getMonth(), (now || new Date()).getDate())
  switch (range) {
    case 'today': return start
    case '7d': return new Date(start.getTime() - 6 * 24 * 60 * 60 * 1000)
    case '30d': return new Date(start.getTime() - 29 * 24 * 60 * 60 * 1000)
    default: return null
  }
}

function isInRange(iso, range, now) {
  if (range === 'all') return true
  const date = toDate(iso)
  const start = rangeStartDate(range, now)
  if (!date || !start) return false
  return date.getTime() >= start.getTime()
}

module.exports = {
  pad2, toDate, formatSeconds, formatMs, formatDuration, formatDate, formatDateTime,
  localDateKey, relativeDayLabel, formatPercent, TIME_RANGE_LABELS, rangeStartDate, isInRange
}
