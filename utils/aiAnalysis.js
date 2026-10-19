/**
 * AI 分析（迁移自 services/aiAnalysis.ts）。
 *
 * 小程序版：前端直连 AI 服务（deepseek 等 chat_completions 协议），
 * 使用 wx.request 替代浏览器 fetch。
 *
 * ⚠️ 安全提示：API Key 保存在本地设置中，直连会随请求发送；
 * 生产环境建议改用云函数中转，避免 Key 暴露。
 */

const { validateBaseUrl, chatEndpoint, isDeepSeekHost, normalizeBaseUrl, hostnameOf } = require('./aiUrl')

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

/**
 * 接口地址清洗。
 * 注意：小程序逻辑层没有 URL 这个浏览器对象，绝不能用 new URL()，
 * 统一走 utils/aiUrl.js 的纯字符串实现，否则会报「地址无效 / URL 不正确」。
 */
function cleanBaseUrl(value) {
  return validateBaseUrl(value)
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
  return isDeepSeekHost(settings.baseUrl, settings.provider)
}

function endpoints(baseUrl) {
  return [chatEndpoint(baseUrl)]
}

function systemPrompt() {
  return '你是计算训练数据分析器。只依据输入的聚合数据生成中文报告，并严格返回 JSON。' +
    '事实、判断、建议必须分离。样本少于10不得判断；10-29仅低置信度；30-59最高中置信度；60以上才可高置信度。' +
    '禁止编造数值、心理归因、绝对化表述和无证据恭维。鼓励只能引用真实改善。每条结论必须写限制。' +
    '所有面向用户的文字必须使用自然中文，不得出现 answer_too_large、recent30、sampleCount 等内部字段名。' +
    '分析错误类型时必须结合 ranges[].errorPatterns，说明错误主要集中在哪些除数范围；只有 topDivisors 有数据时才能提及具体除数。不得把全局错误次数误写成某个范围的次数。' +
    '输出字段：summary, findings, nextPlan, uncertainty。findings字段严格使用 type,title,evidence,sampleCount,confidence,limitation,rangeMin,rangeMax,recommendation。nextPlan使用 action,rangeMin,rangeMax,suggestedQuestionCount,suggestedRatio,reevaluateAfterQuestions。'
}

/**
 * 从模型输出中提取 JSON。
 * 模型经常夹带 markdown 围栏、思考标签（<think>）或前后说明文字，
 * 严格的「整串 JSON.parse」会把这些全判失败；这里改为括号配对抢救。
 */
function extractJson(text) {
  const raw = String(text == null ? '' : text)
  // 去掉思考段（部分模型即使未声明 reasoner 也会输出）
  const cleaned = raw.replace(/<think>[\s\S]*?<\/think>/gi, '')
  const fence = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/i)
  const candidates = []
  if (fence) candidates.push(fence[1])
  candidates.push(cleaned)

  for (const candidate of candidates) {
    const salvaged = extractBalancedJson(candidate)
    if (salvaged) {
      try {
        return JSON.parse(salvaged)
      } catch (e) { /* 换下一个候选继续试 */ }
    }
  }
  const err = new Error('AI 返回的 JSON 不完整或格式有误')
  err.jsonError = true
  throw err
}

/** 从文本里取第一个括号配对完整的 {...}；被截断（没有闭合）时返回空串 */
function extractBalancedJson(text) {
  const start = text.indexOf('{')
  if (start === -1) return ''
  let depth = 0
  let inStr = false
  let esc = false
  for (let i = start; i < text.length; i += 1) {
    const ch = text[i]
    if (inStr) {
      if (esc) esc = false
      else if (ch === '\\') esc = true
      else if (ch === '"') inStr = false
      continue
    }
    if (ch === '"') inStr = true
    else if (ch === '{') depth += 1
    else if (ch === '}') {
      depth -= 1
      if (depth === 0) return text.slice(start, i + 1)
    }
  }
  return ''
}

function assertString(value, field) {
  if (typeof value !== 'string' || !value.trim()) throw new Error('AI 返回缺少 ' + field)
}

// 用 wx.request 封装请求

/** 把常见 HTTP 错误翻译成能直接操作的提示，而不是甩一段英文原文 */
function friendlyHttpError(statusCode, detail) {
  const text = detail || ''
  // 模型名填错：服务端会返回 "The supported API model names are a, b, but you passed x."
  const m = /supported API model names are ([^.]+?)\.?\s*(?:\(request_id|$)/i.exec(text)
  if (statusCode === 400 && m) {
    return '模型名称不被该接口支持（可用：' + m[1].trim() + '）。\n请到「设置 → AI 解读 → 模型名称」修改，或点上方服务商预设自动填好。'
  }
  if (statusCode === 401) {
    return 'API Key 无效或已过期（401）。请到「设置 → AI 解读」检查密钥是否填写正确。'
  }
  if (statusCode === 402) {
    return '账户余额不足（402），请到服务商控制台充值后重试。'
  }
  if (statusCode === 429) {
    return '请求太频繁或额度受限（429），请稍后再试。'
  }
  return 'AI 服务请求失败（' + statusCode + '）' + (text ? '：' + text : '')
}

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
          reject(new Error(friendlyHttpError(res.statusCode, detail)))
        }
      },
      fail(err) {
        const msg = (err && err.errMsg) || ''
        const host = hostnameOf(options.url)
        // 微信对不同失败原因给的 errMsg 不一样，分别翻译成人能看懂的提示
        if (/not in domain|不在以下|合法域名/i.test(msg)) {
          reject(new Error('域名 ' + host + ' 未加入小程序后台的「request 合法域名」。\n开发工具可勾选“不校验合法域名”先调试，正式版需在 mp.weixin.qq.com 配置。'))
          return
        }
        if (/invalid url|malformed|非法|url.*不正确/i.test(msg)) {
          reject(new Error('接口地址不被小程序接受：' + options.url + '\n请检查是否带端口、空格或多余路径。'))
          return
        }
        if (/timeout/i.test(msg)) {
          reject(new Error('连接超时（' + host + '），请检查网络，或在小程序后台把该域名加入白名单。'))
          return
        }
        reject(new Error('无法连接 ' + host + '：' + (msg || '网络错误')))
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

/**
 * 拉取服务商可用的模型列表（OpenAI 兼容的 GET /models 接口）。
 *
 * 目的：让用户「点选」模型而不是手填——模型名写错（如填 ds）会直接 400，
 * 而官方模型名还会随时间下线/新增（deepseek-chat 就是这么失效的）。
 *
 * @returns {Promise<string[]>} 模型名数组（已去重、按名称排序）
 */
async function fetchModelList(settings) {
  const apiKey = cleanApiKey(settings.apiKey)
  if (!apiKey) throw new Error('请先填写 API Key，再拉取模型列表')
  let base = ''
  try {
    base = validateBaseUrl(settings.baseUrl, { allowHttp: true })
  } catch (e) {
    throw new Error('接口地址无效，无法拉取模型列表：' + e.message)
  }
  // /models 与 /chat/completions 同级：base 形如 https://api.deepseek.com 或 .../v1
  const normalized = base.replace(/\/+$/, '')
  const candidates = [normalized + '/models']
  // 有些服务商（如自定义网关）要求显式带 /v1
  if (!/\/v\d+$/.test(normalized)) candidates.push(normalized + '/v1/models')

  let lastError = null
  for (const url of candidates) {
    try {
      const res = await wxRequest({
        url,
        method: 'GET',
        header: { ...(apiKey ? { Authorization: 'Bearer ' + apiKey } : {}) },
        timeout: 20000
      })
      // 兼容三种返回形态：裸数组 / { data: [...] }（OpenAI 标准）/ { models: [...] }
      const body = res || {}
      const list = Array.isArray(body) ? body : Array.isArray(body.data) ? body.data : Array.isArray(body.models) ? body.models : []
      const ids = list
        .map((m) => (typeof m === 'string' ? m : m && (m.id || m.model_id || m.name)))
        .filter((x) => typeof x === 'string' && x.trim())
      if (ids.length) {
        const unique = []
        ids.forEach((id) => { if (unique.indexOf(id) === -1) unique.push(id) })
        return unique.sort()
      }
      lastError = new Error('接口返回的模型列表为空')
    } catch (e) {
      lastError = e
    }
  }
  throw lastError || new Error('未能获取模型列表')
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
  if (!settings.baseUrl) throw new Error('还没填写接口地址，请在「设置 - AI 解读」里填写')
  if (!settings.model) throw new Error('还没填写模型名称，例如 deepseek-flash')
  if (!settings.enabled) throw new Error('AI 解读当前是关闭状态')
  if (['openai', 'fastaitoken', 'custom'].includes((settings.model || '').trim().toLowerCase())) throw new Error('模型名称填写的是服务商名称')
  if (!settings.consentToUpload) throw new Error('请先同意发送聚合统计')

  const promptInput = JSON.stringify({ learningGoal: settings.learningGoal, diagnosis })
  const deepSeek = isDeepSeek(settings)
  const deepSeekReasoner = deepSeek && (settings.model || '').toLowerCase().includes('reasoner')
  const effectiveMaxTokens = settings.reportDetail === 'short' ? Math.min(settings.maxOutputTokens, 600) : settings.maxOutputTokens
  // 思考型模型（如 deepseek-flash）会先消耗大量 token 做推理，
  // 重试时必须给到足够大的上限，否则两次都会在思考阶段就被截断
  const retryMaxTokens = Math.min(8000, Math.max(effectiveMaxTokens * 3, 4000))
  let lastError = null

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const maxTokens = attempt === 0 ? effectiveMaxTokens : retryMaxTokens
    const conciseInstruction = attempt === 0 ? '' : '\n上一次输出不完整。请跳过任何思考过程的复述，直接输出 JSON，每项文字只写一句话，确保完整闭合。'
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
      const choice = body && body.choices && body.choices[0]
      const message = (choice && choice.message) || {}
      const finishReason = choice && choice.finish_reason
      // 思考型模型可能把正文放在 reasoning_content；content 为空时兜底取一次
      let content = message.content
      if ((!content || !String(content).trim()) && message.reasoning_content) {
        content = message.reasoning_content
      }
      if (!content || !String(content).trim()) {
        const truncated = finishReason === 'length'
        lastError = new Error(truncated
          ? 'AI 的思考/输出超出了 max_tokens（本次上限 ' + maxTokens + '）被截断'
          : 'AI 服务没有返回报告内容')
        // 截断属于「可重试」问题：下一次尝试会提高 max_tokens
        lastError.jsonError = truncated
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
  throw new Error('AI 连续两次没有返回可用的 JSON。可在「设置 → AI 解读 → 最大输出量」调高上限后重试；若多次失败，建议换用非思考型模型（如 deepseek-chat 系列）')
}

function isJsonParseFailure(error) {
  // 原实现依赖 error.cause（SyntaxError 的 cause 属性）——但小程序运行时里
  // JSON.parse 抛出的错误不带 cause，JSON 提取错误又是手动 new 的，
  // 导致「永远不算可重试的解析失败」。改为显式标志位 + 消息特征。
  return Boolean(error && (error.jsonError || /JSON|结构不完整|缺少\s*\w+/.test(error.message || '')))
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

module.exports = { PROMPT_VERSION, formatAiReportText, requestAiReport, testAiConnection, fetchModelList, validateAiReport }
