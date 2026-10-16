/**
 * 个人薄弱点分析（迁移自 services/weakPattern.ts）。
 */

const { DEFAULT_WEAK_PATTERN_CONFIG } = require('./config')
const { roundTo } = require('./calculator')

function divisorRangeOf(divisor, rangeSize) {
  const min = Math.floor(divisor / rangeSize) * rangeSize
  return { min, max: min + rangeSize - 1 }
}

function patternIdFor(moduleId, dimension, min, max) {
  return moduleId + ':' + dimension + ':' + min + '-' + max
}

function overallErrorRateOf(records) {
  if (records.length === 0) return 0
  const errors = records.filter((r) => !r.correct).length
  return (errors / records.length) * 100
}

function buildRangeStats(records, rangeSize) {
  const size = rangeSize || DEFAULT_WEAK_PATTERN_CONFIG.rangeSize
  const buckets = new Map()
  for (const record of records) {
    if (!Number.isFinite(record.divisor) || record.divisor <= 0) continue
    const { min, max } = divisorRangeOf(record.divisor, size)
    const key = min + '-' + max
    const bucket = buckets.get(key) || { rangeMin: min, rangeMax: max, sampleCount: 0, errorCount: 0, errorRate: 0 }
    bucket.sampleCount += 1
    if (!record.correct) bucket.errorCount += 1
    buckets.set(key, bucket)
  }
  return [...buckets.values()]
    .map((bucket) => ({ ...bucket, errorRate: bucket.sampleCount > 0 ? (bucket.errorCount / bucket.sampleCount) * 100 : 0 }))
    .sort((a, b) => a.rangeMin - b.rangeMin)
}

function computeReinforcementWeight(rangeErrorRate, overallErrorRate, config) {
  const cfg = config || DEFAULT_WEAK_PATTERN_CONFIG
  if (!(rangeErrorRate > 0)) return 0
  const baseline = Math.max(overallErrorRate, cfg.minBaselineErrorRate)
  if (baseline <= 0) return cfg.maxReinforcementWeight
  const ratio = rangeErrorRate / baseline
  if (ratio <= 1) return 0
  const span = Math.max(cfg.strongRatio - 1, 1e-6)
  const normalized = Math.min(1, Math.max(0, (ratio - 1) / span))
  return roundTo(cfg.maxReinforcementWeight * normalized, 4)
}

function isWeakCandidate(stat, overallErrorRate, config) {
  const cfg = config || DEFAULT_WEAK_PATTERN_CONFIG
  if (stat.sampleCount < cfg.minSampleCount) return false
  if (stat.errorCount < cfg.minErrorCount) return false
  const baseline = Math.max(overallErrorRate, cfg.minBaselineErrorRate)
  if (baseline <= 0) return stat.errorRate > 0
  return stat.errorRate / baseline >= cfg.ratioThreshold
}

function recentRecordsInRange(records, rangeMin, rangeMax, windowSize) {
  return records
    .filter((r) => r.divisor >= rangeMin && r.divisor <= rangeMax)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    .slice(-Math.max(1, windowSize))
}

function resolveTrend(previous, currentErrorRate) {
  if (!previous) return 'flat'
  const delta = currentErrorRate - previous.errorRate
  if (delta <= -0.5) return 'down'
  if (delta >= 0.5) return 'up'
  return 'flat'
}

function analyzeWeakPatterns(records, previousPatterns, config, moduleId) {
  const cfg = config || DEFAULT_WEAK_PATTERN_CONFIG
  const mid = moduleId || 'five-divide-three'
  const scoped = records.filter((r) => r.module === mid)
  const overallErrorRate = overallErrorRateOf(scoped)
  const stats = buildRangeStats(scoped, cfg.rangeSize)
  const previousById = new Map((previousPatterns || []).map((p) => [p.id, p]))
  const nowIso = new Date().toISOString()
  const result = []

  for (const stat of stats) {
    const id = patternIdFor(mid, 'divisor_range', stat.rangeMin, stat.rangeMax)
    const previous = previousById.get(id) || null
    const recent = recentRecordsInRange(scoped, stat.rangeMin, stat.rangeMax, cfg.recentWindowSize)
    const recentSampleCount = recent.length
    const recentErrorRate = recentSampleCount > 0
      ? (recent.filter((r) => !r.correct).length / recentSampleCount) * 100
      : 0

    const qualified = isWeakCandidate(stat, overallErrorRate, cfg)
    let status
    let weight

    if (qualified) {
      status = 'active'
      weight = computeReinforcementWeight(stat.errorRate, overallErrorRate, cfg)
      const improvedRecently = recentSampleCount > 0 && recentErrorRate < stat.errorRate * cfg.improvingDropRatio
      if (improvedRecently) {
        status = 'improving'
        weight = roundTo(weight * cfg.improvingWeightFactor, 4)
      }
    } else if (previous && previous.status !== 'resolved') {
      const resolvedNow = stat.sampleCount >= cfg.minSampleCount && recentSampleCount > 0 && recentErrorRate <= overallErrorRate
      if (resolvedNow) {
        status = 'resolved'
        weight = 0
      } else {
        status = 'improving'
        weight = roundTo(Math.min(previous.reinforcementWeight * cfg.improvingWeightFactor, cfg.maxReinforcementWeight), 4)
      }
    } else {
      continue
    }

    result.push({
      id,
      module: mid,
      dimension: 'divisor_range',
      rangeMin: stat.rangeMin,
      rangeMax: stat.rangeMax,
      sampleCount: stat.sampleCount,
      errorCount: stat.errorCount,
      errorRate: roundTo(stat.errorRate, 2),
      overallErrorRate: roundTo(overallErrorRate, 2),
      reinforcementWeight: weight,
      status,
      recentSampleCount,
      recentErrorRate: roundTo(recentErrorRate, 2),
      previousErrorRate: previous ? previous.errorRate : null,
      trend: resolveTrend(previous, stat.errorRate),
      updatedAt: nowIso
    })
  }
  return result.sort((a, b) => b.reinforcementWeight - a.reinforcementWeight || a.rangeMin - b.rangeMin)
}

function reinforcementTargets(patterns, config) {
  const cfg = config || DEFAULT_WEAK_PATTERN_CONFIG
  if (!cfg.enableReinforcement) return []
  return patterns
    .filter((p) => p.status !== 'resolved' && p.reinforcementWeight > 0)
    .map((p) => ({
      patternId: p.id,
      rangeMin: p.rangeMin,
      rangeMax: p.rangeMax,
      weight: Math.min(p.reinforcementWeight, cfg.maxReinforcementWeight)
    }))
}

function totalReinforcementRatio(patterns, config) {
  const cfg = config || DEFAULT_WEAK_PATTERN_CONFIG
  const total = reinforcementTargets(patterns, cfg).reduce((sum, t) => sum + t.weight, 0)
  return Math.min(total, cfg.maxReinforcementRatio)
}

function hasActiveReinforcement(patterns, config) {
  return reinforcementTargets(patterns, config).length > 0
}

function weakPatternSuggestion(pattern) {
  if (pattern.status === 'resolved') {
    return pattern.rangeMin + '–' + pattern.rangeMax + ' 除数错误率已回落到整体水平，已停止强化。'
  }
  if (pattern.status === 'improving') {
    return pattern.rangeMin + '–' + pattern.rangeMax + ' 除数错误率正在改善，强化权重已降低。'
  }
  return '你的 ' + pattern.rangeMin + '–' + pattern.rangeMax + ' 除数题错误率明显高于整体水平（' +
    pattern.errorRate.toFixed(1) + '% vs ' + pattern.overallErrorRate.toFixed(1) +
    '%），建议近期增加该范围训练。'
}

module.exports = {
  divisorRangeOf, patternIdFor, overallErrorRateOf, buildRangeStats,
  computeReinforcementWeight, isWeakCandidate, analyzeWeakPatterns,
  reinforcementTargets, totalReinforcementRatio, hasActiveReinforcement, weakPatternSuggestion
}
