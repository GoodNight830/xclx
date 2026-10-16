/**
 * 全局常量与可配置参数（迁移自 config/trainingConfig.ts）。
 * 阈值、比例一律集中在此，不写死在页面中。
 */

/** 训练模块标识 */
const MODULE_FIVE_DIVIDE_THREE = 'five-divide-three'
/** 正负运算模块标识（两位数加减，含正负数；不参与 AI/诊断/薄弱点分析） */
const MODULE_SIGNED_ADD_SUB = 'signed-add-sub'

/** 题目数量限制 */
const QUESTION_COUNT = {
  min: 1,
  max: 100,
  default: 10,
  presets: [5, 10, 20, 30]
}

/** 允许误差限制（%） */
const ALLOWED_ERROR_RATE = {
  min: 0,
  max: 20,
  step: 0.5,
  default: 3,
  presets: [1, 2, 3, 5]
}

/** 竞速模式结算阈值 */
const GRADE_THRESHOLDS_MS = {
  excellent: 60000,
  good: 75000,
  pass: 90000
}

/** 薄弱点分析默认配置 */
const DEFAULT_WEAK_PATTERN_CONFIG = {
  rangeSize: 100,
  minSampleCount: 10,
  minErrorCount: 3,
  ratioThreshold: 1.5,
  strongRatio: 3,
  minBaselineErrorRate: 0.5,
  maxReinforcementWeight: 0.35,
  maxReinforcementRatio: 0.35,
  recentWindowSize: 20,
  improvingDropRatio: 0.7,
  improvingWeightFactor: 0.5,
  enableReinforcement: true
}

/** 默认 AI 设置 */
const DEFAULT_AI_SETTINGS = {
  enabled: false,
  provider: 'openai-compatible',
  baseUrl: 'https://api.deepseek.com',
  apiKey: '',
  model: '',
  wireApi: 'chat_completions',
  transport: 'direct',
  reasoningEffort: 'medium',
  consentToUpload: false,
  autoAnalysis: 'off',
  reportDetail: 'standard',
  learningGoal: 'accuracy',
  maxOutputTokens: 1200
}

/** 默认应用设置 */
const DEFAULT_APP_SETTINGS = {
  defaultMode: 'training',
  defaultQuestionCount: QUESTION_COUNT.default,
  defaultAllowedErrorRate: ALLOWED_ERROR_RATE.default,
  weakPattern: { ...DEFAULT_WEAK_PATTERN_CONFIG },
  ai: { ...DEFAULT_AI_SETTINGS }
}

/** 导出文件格式版本 */
const SCHEMA_VERSION = 1

/** 存储 key 前缀 */
const STORAGE_PREFIX = 'bct'

module.exports = {
  MODULE_FIVE_DIVIDE_THREE,
  MODULE_SIGNED_ADD_SUB,
  QUESTION_COUNT,
  ALLOWED_ERROR_RATE,
  GRADE_THRESHOLDS_MS,
  DEFAULT_WEAK_PATTERN_CONFIG,
  DEFAULT_AI_SETTINGS,
  DEFAULT_APP_SETTINGS,
  SCHEMA_VERSION,
  STORAGE_PREFIX
}
