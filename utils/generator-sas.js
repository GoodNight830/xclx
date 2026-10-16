/**
 * 正负运算题目生成器（迁移自 signed-add-sub/generator.ts）。
 * 排除「两个正数直接相加」，其余 7 种符号组合全覆盖。
 */

const { createSeededRng, randomInt } = require('./random')
const { buildQuestionText, computeResult, ABS_MIN, ABS_MAX } = require('./calculator-sas')
const { MODULE_SIGNED_ADD_SUB } = require('./config')
const { newId } = require('./id')

const MAX_DEDUPE_ATTEMPTS = 40

const VALID_COMBINATIONS = [
  { aSign: 1, bSign: -1, op: '+' },   // 正 + 负
  { aSign: -1, bSign: 1, op: '+' },   // 负 + 正
  { aSign: -1, bSign: -1, op: '+' },  // 负 + 负
  { aSign: 1, bSign: 1, op: '-' },    // 正 - 正
  { aSign: 1, bSign: -1, op: '-' },   // 正 - 负
  { aSign: -1, bSign: 1, op: '-' },   // 负 - 正
  { aSign: -1, bSign: -1, op: '-' }   // 负 - 负
]

function questionKey(a, b) {
  return a + ':' + b
}

class SignedAddSubGenerator {
  constructor() {
    this.moduleId = MODULE_SIGNED_ADD_SUB
    this.title = '正负运算'
  }

  generate(options) {
    const count = Math.max(0, Math.floor(options.count))
    const rng = options.rng || (options.rngSeed !== undefined ? createSeededRng(options.rngSeed) : Math.random)
    const usedKeys = new Set(options.excludeKeys || [])
    const questions = []
    for (let index = 0; index < count; index += 1) {
      const question = this.createQuestion(rng, usedKeys)
      usedKeys.add(questionKey(question.dividend, question.divisor))
      questions.push(question)
    }
    return questions
  }

  createQuestion(rng, usedKeys) {
    let a = 0
    let b = 0
    let op = '+'
    for (let attempt = 0; attempt < MAX_DEDUPE_ATTEMPTS; attempt += 1) {
      const combo = VALID_COMBINATIONS[randomInt(0, VALID_COMBINATIONS.length - 1, rng)]
      op = combo.op
      const absA = randomInt(ABS_MIN, ABS_MAX, rng)
      const absB = randomInt(ABS_MIN, ABS_MAX, rng)
      a = combo.aSign * absA
      b = combo.bSign * absB
      if (!usedKeys.has(questionKey(a, b))) break
    }
    return {
      id: newId(),
      module: this.moduleId,
      dividend: a,
      divisor: b,
      correctAnswer: computeResult(a, b, op),
      text: buildQuestionText(a, b, op),
      origin: 'normal',
      weakRange: null,
      createdAt: new Date().toISOString()
    }
  }
}

const signedAddSubGenerator = new SignedAddSubGenerator()

module.exports = { SignedAddSubGenerator, signedAddSubGenerator }
