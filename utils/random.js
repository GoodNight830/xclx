/**
 * 随机数工具（迁移自 modules/arithmetic/random.ts）。
 * 提供可注入随机源，便于测试复现。
 */

function createSeededRng(seed) {
  let a = seed >>> 0
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function randomInt(min, max, rng) {
  if (max < min) return min
  return min + Math.floor((rng || Math.random)() * (max - min + 1))
}

function pickWeighted(items, weightOf, rng) {
  if (items.length === 0) return null
  const total = items.reduce((sum, item) => sum + Math.max(0, weightOf(item)), 0)
  if (total <= 0) return items[0]
  let ticket = (rng || Math.random)() * total
  for (const item of items) {
    ticket -= Math.max(0, weightOf(item))
    if (ticket <= 0) return item
  }
  return items[items.length - 1]
}

module.exports = { createSeededRng, randomInt, pickWeighted }
