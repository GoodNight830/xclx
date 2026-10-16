/**
 * 五除三题目生成器（迁移自 five-divide-three/generator.ts）。
 */

const { createSeededRng, pickWeighted, randomInt } = require('./random')
const { buildQuestionText, exactQuotient, DIVIDEND_MAX, DIVIDEND_MIN, DIVISOR_MAX, DIVISOR_MIN } = require('./calculator')
const { MODULE_FIVE_DIVIDE_THREE } = require('./config')
const { newId } = require('./id')

const MAX_DEDUPE_ATTEMPTS = 40

function clamp01(value) {
  if (!Number.isFinite(value)) return 0
  return Math.min(1, Math.max(0, value))
}

function questionKey(dividend, divisor) {
  return dividend + ':' + divisor
}

class FiveDivideThreeGenerator {
  constructor() {
    this.moduleId = MODULE_FIVE_DIVIDE_THREE
    this.title = '五除三'
  }

  generate(options) {
    const count = Math.max(0, Math.floor(options.count))
    const rng = options.rng || (options.rngSeed !== undefined ? createSeededRng(options.rngSeed) : Math.random)
    const weakTargets = (options.weakTargets || []).filter((t) => t.weight > 0)
    const maxWeakRatio = clamp01(options.maxWeakRatio !== undefined ? options.maxWeakRatio : 0.35)
    const totalWeakWeight = weakTargets.reduce((sum, t) => sum + Math.max(0, t.weight), 0)
    const weakProbability = Math.min(maxWeakRatio, clamp01(totalWeakWeight))

    const usedKeys = new Set(options.excludeKeys || [])
    const questions = []

    for (let index = 0; index < count; index += 1) {
      const useWeak = weakTargets.length > 0 && rng() < weakProbability
      const target = useWeak ? pickWeighted(weakTargets, (t) => t.weight, rng) : null
      const question = this.createQuestion(target, rng, usedKeys)
      usedKeys.add(questionKey(question.dividend, question.divisor))
      questions.push(question)
    }
    return questions
  }

  createQuestion(target, rng, usedKeys) {
    let dividend = 0
    let divisor = 0
    for (let attempt = 0; attempt < MAX_DEDUPE_ATTEMPTS; attempt += 1) {
      dividend = randomInt(DIVIDEND_MIN, DIVIDEND_MAX, rng)
      divisor = target
        ? randomInt(target.rangeMin, target.rangeMax, rng)
        : randomInt(DIVISOR_MIN, DIVISOR_MAX, rng)
      if (!usedKeys.has(questionKey(dividend, divisor))) break
    }
    if (divisor < DIVISOR_MIN || divisor > DIVISOR_MAX) {
      divisor = randomInt(DIVISOR_MIN, DIVISOR_MAX, rng)
    }
    return {
      id: newId(),
      module: this.moduleId,
      dividend,
      divisor,
      correctAnswer: exactQuotient(dividend, divisor),
      text: buildQuestionText(dividend, divisor),
      origin: target ? 'weak' : 'normal',
      weakRange: target ? { min: target.rangeMin, max: target.rangeMax } : null,
      createdAt: new Date().toISOString()
    }
  }
}

const fiveDivideThreeGenerator = new FiveDivideThreeGenerator()

module.exports = { FiveDivideThreeGenerator, fiveDivideThreeGenerator }
