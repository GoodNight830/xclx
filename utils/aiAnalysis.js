/**
 * AI 分析（迁移自 services/aiAnalysis.ts）。
 *
 * 小程序版：前端直连 AI 服务（deepseek 等 chat_completions 协议），
 * 使用 wx.request 替代浏览器 fetch。
 *
 * ⚠️ 安全提示：API Key 保存在本地设置中，直连会随请求发送；
 * 生产环境建议改用云函数中转，避免 Key 暴露。
 */

const PROMPT_VERSION = 'diagnosis-v1'
const FORBIDDEN = ['肯定', '一定', '绝对', '完全掌握', '绝对没问题', '你就是粗心', '非常优秀', '天赋']
const UNSAFE_REPLACEMENTS = [
  [/完全掌握/g, '目前表现稳定'],
  [/绝对没问题/g, '当前未发现明显问题'],
  [/你就是粗心/g, '可能存在作答偏差'],
  [/非常优秀/g, '表现较好'],
  [/天赋/g, '当前表现'],
  [/肯定/g, '目前数据显示'],
  [/一定/g, '可能'],
  [/绝对/g, '目前']
]
const REPORT_TERM_LABELS = [
  [/\bempty\b/gi, '空答案'],
  [/\binvalid\b/gi, '无效输入'],
  [/\banswer_too_large\b/gi, '答案偏大'],
  [/\banswer_too_small\b/gi, '答案偏小'],
  [/\bslow_correct\b/gi, '答对但用时较长'],
  [/\bslow_wrong\b/gi, '答错且用时较长'],
  [/\brepeat_wrong\b/gi, '重复答错'],
  [/\bout_of_tolerance\b/gi, '超出允许误差'],
  [/\binsufficient_data\b/gi, '数据不足'],
  [/\brecent30\b/gi, '最近30天'],
  [/\brecent7\b/gi, '最近7天'],
  [/\bprevious7\b/gi, '前7天'],
  [/\blifetime\b/gi, '长期'],
  [/\bsampleCount\b/gi, '样本数'],
  [/\berrorCount\b/gi, '错误数'],
  [/\berrorRate\b/gi, '错误率'],
  [/\bmedianElapsedMs\b/gi, '中位用时'],
  [/\bp75ElapsedMs\b/gi, '较慢用时水平'],
  [/\bquestionCountSinceLastAi\b/gi, '上次分析后新增题数'],
  [/\berrorPatterns\b/gi, '错误类型分布'],
  [/\brecent7Count\b/gi, '最近7天次数'],
  [/\brecent30Count\b/gi, '最近30天次数'],
  [/\btopDivisors\b/gi, '高频具体除数'],
  [/\brate\b/gi, '占比'],
  [/\brangeMin\b/gi, '范围下限'],
  [/\brangeMax\b/gi, '范围上限'],
  [/\branges\b/gi, '除数范围'],
  [/\baccuracy\b/gi, '正确率'],
  [/\bcount\b/gi, '数量'],
  [/\btrend\b/gi, '趋势'],
  [/\bconfidence\b/gi, '可信度'],
  [/\binsufficient\b/gi, '数据不足'],
  [/\bstrength\b/gi, '优势'],
  [/\bweakness\b/gi, '薄弱项'],
  [/\blow\b/gi, '低'],
  [/\bmedium\b/gi, '中'],
  [/\bhigh\b/gi, '高'],
  [/\bschemaVersion\b/gi, '数据版本'],
  [/\bgeneratedAt\b/gi, '生成时间'],
  [/\bdataHash\b/gi, '数据摘要'],
  [/\bmodule\b/gi, '训练模块'],
  [/\bimproving\b/gi, '正在改善'],
  [/\bworsening\b/gi, '近期恶化'],
  [/\bstable\b/gi, '基本稳定']
]

function localizeReportText(value) {
  return REPORT_TERM_LABELS.reduce((text, pair) => text.replace(pair[0], pair[1]), value)
}

function sanitizeReportText(value) {
  return UNSAFE_REPLACEMENTS.reduce((text, pair) => text.replace(pair[0], pair[1]), value)
}

function formatAiReportText(value) {
  return sanitizeReportText(localizeReportText(value))
}

function cleanBaseUrl(value) {
  const trimmed = (value || '').trim()
  const markdownUrl = trimmed.match(/\]\((https?:\/\/[^)]+)\)/i)
  const plainUrl = trimmed.match(/https?:\/\/[^\s\])]+/i)
  const cleaned = (markdownUrl ? markdownUrl[1] : plainUrl ? plainUrl[0] : trimmed).replace(/\/$/, '')
  try {
    return new URL(cleaned).toString().replace(/\/$/, '')
  } catch (e) {
    throw new Error('接口地址格式无效，请只填写完整的 http:// 或 https:// 地址')
  }
}

function cleanApiKey(value) {
  let cleaned = (value || '').trim()
  cleaned = cleaned.replace(/^OPENAI_API_KEY\s*=\s*/i, '').trim()
  cleaned = cleaned.replace(/^Bearer\s+/i, '').trim()
  if ((cleaned.startsWith('"') && cleaned.endsWith('"')) || (cleaned.startsWith("'") && cleaned.endsWith("'"))) {
    cleaned = cleaned.slice(1, -1).trim()
  }
  if (/[^\x21-\x7e]/.test(cleaned)) {
    throw new Error('API Key 包含空格、换行或非英文字符，请只粘贴 Key 本身')
  }
  return cleaned
}

function isDeepSeek(settings) {
  const hostname = new URL(cleanBaseUrl(settings.baseUrl)).hostname
  return /(^|\.)deepseek\.com$/i.test(hostname) || (settings.provider || '').toLowerCase() === 'deepseek'
}

function endpoints(baseUrl) {
  const base = cleanBaseUrl(baseUrl)
  return [base.endsWith('/chat/completions') ? base : base + '/chat/completions']
}

function systemPrompt() {
  return '你是计算训练数据分析器。只依据输入的聚合数据生成中文报告，并严格返回 JSON。' +
    '事实、判断、建议必须分离。样本少于10不得判断；10-29仅低置信度；30-59最高中置信度；60以上才可高置信度。' +
    '禁止编造数值、心理归因、绝对化表述和无证据恭维。鼓励只能引用真实改善。每条结论必须写限制。' +
    '所有面向用户的文字必须使用自然中文，不得出现 answer_too_large、recent30、sampleCount 等内部字段名。' +
    '分析错误类型时必须结合 ranges[].errorPatterns，说明错误主要集中在哪些除数范围；只有 topDivisors 有数据时才能提及具体除数。不得把全局错误次数误写成某个范围的次数。' +
    '输出字段：summary, findings, nextPlan, uncertainty。findings字段严格使用 type,title,evidence,sampleCount,confidence,limitation,rangeMin,rangeMax,recommendation。nextPlan使用 action,rangeMin,rangeMax,suggestedQuestionCount,suggestedRatio,reevaluateAfterQuestions。'
}

function extractJson(text) {
  const cleaned = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')
  try {
    return JSON.parse(cleaned)
  } catch (e) {
    throw new Error('AI 返回的 JSON 不完整或格式有误')
  }
}

function assertString(value, field) {
  if (typeof value !== 'string' || !value.trim()) throw new Error('AI 返回缺少 ' + field)
}

// 用 wx.request 封装请求
function wxRequest(options) {
  return new Promise((resolve, reject) => {
    wx.request({
      url: options.url,
      method: options.method || 'POST',
      data: options.data,
      header: options.header,
      timeout: options.timeout || 60000,
      success(res) {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(res.data)
        } else {
          let detail = ''
          try {
            const parsed = res.data
            if (parsed && typeof parsed === 'object') {
              detail = typeof parsed.error === 'string' ? parsed.error : (parsed.error && parsed.error.message) || parsed.message || parsed.code || ''
            }
          } catch (e) { /* ignore */ }
          reject(new Error('AI 服务请求失败（' + res.statusCode + '）' + (detail ? '：' + detail : '')))
        }
      },
      fail(err) {
        const msg = (err && err.errMsg) || ''
        if (msg.indexOf('timeout') !== -1) {
          reject(new Error('连接超时，请检查网络或接口地址是否正确'))
        } else {
          reject(new Error('无法连接接口：' + (msg || '网络错误')))
        }
      }
    })
  })
}

async function performJsonRequest(settings, requestBody, timeoutMs) {
  const apiKey = cleanApiKey(settings.apiKey)
  let lastError = null
  for (const apiEndpoint of endpoints(settings.baseUrl)) {
    try {
      const body = await wxRequest({
        url: apiEndpoint,
        method: 'POST',
        header: {
          'Content-Type': 'application/json',
          ...(apiKey ? { Authorization: 'Bearer ' + apiKey } : {})
        },
        data: requestBody,
        timeout: timeoutMs
      })
      return body
    } catch (e) {
      lastError = e
    }
  }
  throw lastError || new Error('AI 服务请求失败')
}

function validateAiReport(raw, diagnosis) {
  if (!raw || typeof raw !== 'object') throw new Error('AI 返回格式不是对象')
  const value = raw
  if (typeof value.summary !== 'string' || !value.summary.trim()) {
    throw new Error('AI 返回缺少 summary；实际字段：' + (Object.keys(value).join(', ') || '无'))
  }
  if (!Array.isArray(value.findings) || !Array.isArray(value.nextPlan) || !Array.isArray(value.uncertainty)) {
    throw new Error('AI 返回结构不完整')
  }
  const allText = JSON.stringify(raw)
  const hadUnsafeLanguage = FORBIDDEN.some((word) => allText.includes(word))
  const rangeMap = new Map(diagnosis.ranges.map((r) => [r.rangeMin + '-' + r.rangeMax, r]))
  let filteredInvalidRange = false
  let correctedSampleCount = false
  let correctedConfidence = false
  let correctedType = false

  const findings = value.findings.slice(0, 8).filter((item) => {
    if (!item || typeof item !== 'object') return true
    const candidate = item
    if (candidate.rangeMin == null || candidate.rangeMax == null) return true
    const valid = rangeMap.has(candidate.rangeMin + '-' + candidate.rangeMax)
    if (!valid) filteredInvalidRange = true
    return valid
  }).map((item) => {
    if (!item || typeof item !== 'object') throw new Error('AI 发现项格式错误')
    const finding = { ...item }
    if (finding.rangeMin === null) finding.rangeMin = undefined
    if (finding.rangeMax === null) finding.rangeMax = undefined
    if (finding.recommendation === null) finding.recommendation = undefined
    assertString(finding.title, 'finding.title')
    assertString(finding.evidence, 'finding.evidence')
    assertString(finding.limitation, 'finding.limitation')

    const VALID_TYPES = ['strength', 'weakness', 'improving', 'worsening', 'insufficient_data']
    if (!VALID_TYPES.includes(finding.type)) {
      const rawType = typeof finding.type === 'string' ? finding.type.trim().toLowerCase() : ''
      const alias = {
        '优势': 'strength', '强项': 'strength', 'strengths': 'strength', 'strong': 'strength', 'good': 'strength', 'positive': 'strength',
        '薄弱': 'weakness', '弱点': 'weakness', '弱项': 'weakness', 'weak': 'weakness', 'bad': 'weakness', 'negative': 'weakness', 'error': 'weakness',
        '进步': 'improving', '改善': 'improving', '提升': 'improving', 'improve': 'improving', 'improvement': 'improving', 'better': 'improving',
        '退步': 'worsening', '恶化': 'worsening', '下降': 'worsening', 'worse': 'worsening', 'decline': 'worsening',
        '数据不足': 'insufficient_data', '不足': 'insufficient_data', 'insufficient': 'insufficient_data', 'unknown': 'insufficient_data', 'none': 'insufficient_data'
      }
      finding.type = alias[rawType] || 'insufficient_data'
      correctedType = true
    }

    const range = finding.rangeMin !== undefined && finding.rangeMax !== undefined ? rangeMap.get(finding.rangeMin + '-' + finding.rangeMax) : null
    const actualSamples = range ? range.recent7.sampleCount : diagnosis.recent7.sampleCount
    if (finding.sampleCount !== actualSamples) {
      finding.sampleCount = actualSamples
      correctedSampleCount = true
    }
    const maximum = actualSamples < 10 ? null : actualSamples < 30 ? 'low' : actualSamples < 60 ? 'medium' : 'high'
    const rank = { low: 1, medium: 2, high: 3 }
    if (maximum === null) {
      if (finding.type !== 'insufficient_data') {
        finding.type = 'insufficient_data'
        correctedConfidence = true
      }
      if (finding.confidence !== 'low') {
        finding.confidence = 'low'
        correctedConfidence = true
      }
    } else if (rank[finding.confidence] > rank[maximum]) {
      finding.confidence = maximum
      correctedConfidence = true
    }

    return {
      ...finding,
      title: sanitizeReportText(localizeReportText(finding.title)),
      evidence: sanitizeReportText(localizeReportText(finding.evidence)),
      limitation: sanitizeReportText(localizeReportText(finding.limitation)),
      recommendation: finding.recommendation ? sanitizeReportText(localizeReportText(finding.recommendation)) : undefined
    }
  })

  const nextPlan = value.nextPlan.slice(0, 5).filter((item) => {
    if (!item || typeof item !== 'object') return true
    const candidate = item
    const validRange = candidate.rangeMin == null || candidate.rangeMax == null || rangeMap.has(candidate.rangeMin + '-' + candidate.rangeMax)
    const validRatio = candidate.suggestedRatio == null || (candidate.suggestedRatio >= 0 && candidate.suggestedRatio <= 0.35)
    if (!validRange || !validRatio) filteredInvalidRange = true
    return validRange && validRatio
  }).map((item) => {
    const plan = { ...item }
    if (plan.rangeMin === null) plan.rangeMin = undefined
    if (plan.rangeMax === null) plan.rangeMax = undefined
    if (plan.suggestedQuestionCount === null) plan.suggestedQuestionCount = undefined
    if (plan.suggestedRatio === null) plan.suggestedRatio = undefined
    if (plan.reevaluateAfterQuestions === null) plan.reevaluateAfterQuestions = undefined
    assertString(plan.action, 'plan.action')
    return { ...plan, action: sanitizeReportText(localizeReportText(plan.action)) }
  })

  const uncertainty = value.uncertainty.filter((x) => typeof x === 'string').slice(0, 5).map((text) => sanitizeReportText(localizeReportText(text)))
  if (hadUnsafeLanguage) uncertainty.push('系统已将缺少数据依据的绝对化或恭维措辞改为中性表述。')
  if (filteredInvalidRange) uncertainty.push('系统已移除无法由本地统计验证的范围或训练比例。')
  if (correctedType) uncertainty.push('系统已纠正了部分发现项的类型标注。')
  if (correctedSampleCount) uncertainty.push('系统已按本地统计校正了部分发现项引用的样本量。')
  if (correctedConfidence) uncertainty.push('系统已按样本量规则校正了部分发现项的可信度或结论类型。')

  return { summary: sanitizeReportText(localizeReportText(value.summary)), findings, nextPlan, uncertainty }
}

async function requestAiReport(settings, diagnosis) {
  if (!settings.enabled || !settings.model || !settings.baseUrl) throw new Error('请先完成 AI 服务配置')
  if (['openai', 'fastaitoken', 'custom'].includes((settings.model || '').trim().toLowerCase())) throw new Error('模型名称填写的是服务商名称')
  if (!settings.consentToUpload) throw new Error('请先同意发送聚合统计')

  const promptInput = JSON.stringify({ learningGoal: settings.learningGoal, diagnosis })
  const deepSeek = isDeepSeek(settings)
  const deepSeekReasoner = deepSeek && (settings.model || '').toLowerCase().includes('reasoner')
  const effectiveMaxTokens = settings.reportDetail === 'short' ? Math.min(settings.maxOutputTokens, 600) : settings.maxOutputTokens
  const retryMaxTokens = Math.min(4000, Math.max(effectiveMaxTokens * 2, 2000))
  let lastError = null

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const maxTokens = attempt === 0 ? effectiveMaxTokens : retryMaxTokens
    const conciseInstruction = attempt === 0 ? '' : '\n上一次输出被截断。请缩短文字，每项只写一句话，确保 JSON 完整闭合。'
    const requestBody = {
      model: settings.model,
      max_tokens: maxTokens,
      ...(!deepSeekReasoner ? { temperature: 0.1, response_format: { type: 'json_object' } } : {}),
      messages: [
        { role: 'system', content: systemPrompt() + '\n请只输出一个可被 JSON.parse 解析的 JSON 对象，不要使用 Markdown 代码块。' + conciseInstruction },
        { role: 'user', content: promptInput }
      ],
      ...(deepSeek ? { stream: false } : {})
    }

    try {
      const body = await performJsonRequest(settings, requestBody, 60000)
      const content = body.choices && body.choices[0] && body.choices[0].message ? body.choices[0].message.content : null
      if (!content) {
        lastError = new Error('AI 服务没有返回报告内容')
      } else {
        try {
          return validateAiReport(extractJson(content), diagnosis)
        } catch (e) {
          lastError = e
          if (!isJsonParseFailure(e)) throw e
        }
      }
    } catch (e) {
      lastError = e
      if (!isJsonParseFailure(e)) throw e
    }
  }
  throw new Error('AI 连续两次返回了不完整的 JSON，请调高“最大输出量”或稍后重试')
}

function isJsonParseFailure(error) {
  return error && error.cause instanceof SyntaxError
}

async function testAiConnection(settings) {
  if (!settings.baseUrl || !settings.model) throw new Error('请填写接口地址和模型名称')
  const deepSeek = isDeepSeek(settings)
  const body = {
    model: settings.model,
    max_tokens: 16,
    messages: [{ role: 'user', content: '只回复 OK' }],
    ...(deepSeek ? { stream: false } : {})
  }
  await performJsonRequest(settings, body, 20000)
}

module.exports = { PROMPT_VERSION, formatAiReportText, requestAiReport, testAiConnection, validateAiReport }
