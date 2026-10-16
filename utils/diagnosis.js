/**
 * 能力诊断（迁移自 services/diagnosis.ts）。
 */

const { divisorRangeOf } = require('./weakPattern')

const DAY = 86400000

function percentile(values, ratio) {
  if (!values.length) return null
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * ratio) - 1)] ?? null
}

function round(value) {
  return Math.round(value * 100) / 100
}

function windowOf(records) {
  const errorCount = records.filter((r) => !r.correct).length
  return {
    sampleCount: records.length,
    errorCount,
    errorRate: records.length ? round(errorCount / records.length * 100) : 0,
    accuracy: records.length ? round((records.length - errorCount) / records.length * 100) : 0,
    medianElapsedMs: percentile(records.map((r) => r.elapsedMs), 0.5),
    p75ElapsedMs: percentile(records.map((r) => r.elapsedMs), 0.75)
  }
}

function confidenceOf(sampleCount) {
  if (sampleCount < 10) return 'insufficient'
  if (sampleCount < 30) return 'low'
  if (sampleCount < 60) return 'medium'
  return 'high'
}

function since(records, start, end) {
  const e = end === undefined ? Infinity : end
  return records.filter((r) => {
    const time = Date.parse(r.submittedAt || r.createdAt)
    return Number.isFinite(time) && time >= start && time < e
  })
}

function hashText(text) {
  let hash = 2166136261
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0).toString(16).padStart(8, '0')
}

function errorPatterns(records, nowMs, slowThreshold) {
  const matches = new Map()
  const add = (type, record) => {
    const list = matches.get(type) || []
    list.push(record)
    matches.set(type, list)
  }
  const wrongKeys = new Map()
  for (const record of records) {
    if ((record.rawAnswer || '').trim() === '') add('empty', record)
    else if (record.userAnswer === null) add('invalid', record)
    else if (!record.correct && record.userAnswer > record.correctAnswer) add('answer_too_large', record)
    else if (!record.correct && record.userAnswer < record.correctAnswer) add('answer_too_small', record)
    if (record.elapsedMs > slowThreshold) add(record.correct ? 'slow_correct' : 'slow_wrong', record)
    if (!record.correct) {
      const key = record.dividend + ':' + record.divisor
      wrongKeys.set(key, (wrongKeys.get(key) || 0) + 1)
    }
  }
  const repeatedRecords = records.filter((record) => (wrongKeys.get(record.dividend + ':' + record.divisor) || 0) > 1 && !record.correct)
  if (repeatedRecords.length) matches.set('repeat_wrong', repeatedRecords)

  return [...matches.entries()].map(([type, matched]) => {
    const divisorCounts = new Map()
    for (const record of matched) divisorCounts.set(record.divisor, (divisorCounts.get(record.divisor) || 0) + 1)
    return {
      type,
      count: matched.length,
      rate: records.length ? round(matched.length / records.length * 100) : 0,
      recent7Count: since(matched, nowMs - 7 * DAY).length,
      recent30Count: since(matched, nowMs - 30 * DAY).length,
      topDivisors: [...divisorCounts.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0]).slice(0, 5).map(([divisor]) => divisor)
    }
  }).sort((a, b) => b.count - a.count)
}

function buildLocalDiagnosis(records, module, options) {
  const opts = options || {}
  const now = opts.now || new Date()
  const nowMs = now.getTime()
  const scoped = records.filter((r) => r.module === module)
  const recent7Records = since(scoped, nowMs - 7 * DAY)
  const previous7Records = since(scoped, nowMs - 14 * DAY, nowMs - 7 * DAY)
  const recent30Records = since(scoped, nowMs - 30 * DAY)
  const rangeSize = opts.rangeSize || 100
  const slowThreshold = percentile(scoped.map((r) => r.elapsedMs), 0.75) ?? Infinity
  const ranges = new Map()
  for (const record of scoped) {
    const range = divisorRangeOf(record.divisor, rangeSize)
    const list = ranges.get(range.min) || []
    list.push(record)
    ranges.set(range.min, list)
  }

  const rangeRows = [...ranges.entries()].map(([rangeMin, all]) => {
    const recent7 = windowOf(since(all, nowMs - 7 * DAY))
    const previous7 = windowOf(since(all, nowMs - 14 * DAY, nowMs - 7 * DAY))
    const delta = recent7.errorRate - previous7.errorRate
    const trend = recent7.sampleCount < 10 || previous7.sampleCount < 10
      ? 'insufficient_data'
      : delta <= -10 ? 'improving' : delta >= 10 ? 'worsening' : 'stable'
    return {
      rangeMin,
      rangeMax: rangeMin + rangeSize - 1,
      lifetime: windowOf(all),
      recent30: windowOf(since(all, nowMs - 30 * DAY)),
      recent7,
      previous7,
      trend,
      confidence: confidenceOf(recent7.sampleCount),
      errorPatterns: errorPatterns(all, nowMs, slowThreshold)
    }
  }).sort((a, b) => {
    const priority = { worsening: 3, stable: 2, improving: 1, insufficient_data: 0 }
    return priority[b.trend] - priority[a.trend] || b.recent7.errorRate - a.recent7.errorRate
  })

  const hashSource = JSON.stringify({
    count: scoped.length,
    lifetime: windowOf(scoped),
    recent7: windowOf(recent7Records),
    ranges: rangeRows.map((r) => [r.rangeMin, r.lifetime.sampleCount, r.lifetime.errorCount, r.recent7.sampleCount, r.recent7.errorCount, r.errorPatterns])
  })

  return {
    schemaVersion: 1,
    generatedAt: now.toISOString(),
    module,
    lifetime: windowOf(scoped),
    recent30: windowOf(recent30Records),
    recent7: windowOf(recent7Records),
    previous7: windowOf(previous7Records),
    ranges: rangeRows,
    errorPatterns: errorPatterns(scoped, nowMs, slowThreshold),
    questionCountSinceLastAi: Math.max(0, scoped.length - (opts.lastAiQuestionCount || 0)),
    dataHash: hashText(hashSource)
  }
}

module.exports = { buildLocalDiagnosis }
