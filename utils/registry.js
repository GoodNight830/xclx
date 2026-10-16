/**
 * 计算模块注册表（迁移自 modules/arithmetic/registry.ts）。
 */

const { fiveDivideThreeGenerator } = require('./generator-f53')
const { checkAnswer } = require('./validator')
const { signedAddSubGenerator } = require('./generator-sas')
const { checkSignedAnswer } = require('./validator-sas')
const { MODULE_FIVE_DIVIDE_THREE, MODULE_SIGNED_ADD_SUB, QUESTION_COUNT } = require('./config')

const arithmeticModules = [
  {
    meta: {
      id: MODULE_FIVE_DIVIDE_THREE,
      title: '五除三',
      subtitle: '五位数 ÷ 三位数',
      description: '例如 58231 ÷ 317，默认 ' + QUESTION_COUNT.default + ' 题，允许误差 3%',
      enabled: true,
      diagnosisSupported: true,
      aiSupported: true
    },
    generator: fiveDivideThreeGenerator,
    validate: checkAnswer,
    reinforcementSupported: true
  },
  {
    meta: {
      id: MODULE_SIGNED_ADD_SUB,
      title: '正负运算',
      subtitle: '两位数加减',
      description: '例如 (-37) + 25、18 - (-42)，两位数整数加减，不含两个正数直接相加',
      enabled: true,
      diagnosisSupported: false,
      aiSupported: false
    },
    generator: signedAddSubGenerator,
    validate: checkSignedAnswer,
    reinforcementSupported: false
  }
]

function getArithmeticModule(moduleId) {
  const found = arithmeticModules.find((m) => m.meta.id === moduleId)
  if (!found) throw new Error('未注册的计算模块：' + moduleId)
  return found
}

function findArithmeticModule(moduleId) {
  return arithmeticModules.find((m) => m.meta.id === moduleId) || null
}

function listDiagnosableModules() {
  return arithmeticModules.filter((m) => m.meta.enabled && m.meta.diagnosisSupported)
}

function listAiModules() {
  return arithmeticModules.filter((m) => m.meta.enabled && m.meta.aiSupported)
}

module.exports = {
  arithmeticModules, getArithmeticModule, findArithmeticModule, listDiagnosableModules, listAiModules
}
