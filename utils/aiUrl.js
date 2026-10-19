/**
 * AI 接口地址处理 —— 全部用字符串 + 正则实现，不依赖任何浏览器 API。
 *
 * ⚠️ 关键：微信小程序的逻辑层运行在 JSCore / V8 沙箱里，没有 window、document，
 * 也**没有 URL / URLSearchParams 这些 BOM 对象**。直接 new URL() 会抛
 * "ReferenceError: URL is not defined"，表现出来的现象就是「接口地址格式无效 / URL 不正确」。
 * 因此这里所有解析都手写实现。
 */

const CHAT_PATH = '/chat/completions'

/**
 * 常见服务商预设。手填地址最容易出错（漏协议、多 /v1、带空格、复制了 markdown），
 * 直接选一个即可自动填好地址与模型名。
 */
const PROVIDERS = [
  // DeepSeek 官方接口已不支持旧模型名（deepseek-chat 会报 400），
  // 以服务端 2026-10 返回的可用列表为准：deepseek-flash / deepseek-v4-pro
  { key: 'deepseek', label: 'DeepSeek', baseUrl: 'https://api.deepseek.com', model: 'deepseek-flash' },
  { key: 'glm', label: '智谱 GLM', baseUrl: 'https://open.bigmodel.cn/api/paas/v4', model: 'glm-4-flash' },
  { key: 'moonshot', label: 'Moonshot', baseUrl: 'https://api.moonshot.cn/v1', model: 'moonshot-v1-8k' },
  { key: 'openai', label: 'OpenAI', baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o-mini' },
  { key: 'custom', label: '自定义', baseUrl: '', model: '' }
]

/** 去掉全角空格、换行、制表符等多余字符 */
function stripNoise(value) {
  return String(value == null ? '' : value)
    .replace(/\u3000/g, ' ')
    .replace(/[\r\n\t]/g, '')
    .trim()
}

/** 从可能带 markdown 链接、引号、说明文字的输入里抽出真正的 URL */
function extractUrl(value) {
  const text = stripNoise(value)
  if (!text) return ''
  const md = text.match(/\]\((https?:\/\/[^)\s]+)\)/i)
  if (md) return md[1]
  const url = text.match(/https?:\/\/[^\s"'<>）)]+/i)
  if (url) return url[0]
  // 没写协议但看起来像域名：补上 https://
  if (/^[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)+(\/[^\s]*)?$/.test(text)) return 'https://' + text
  return text
}

/** 归一化：补协议、去尾部斜杠 */
function normalizeBaseUrl(value) {
  let url = extractUrl(value)
  if (!url) return ''
  url = url.replace(/^HTTPS?:\/\//i, (m) => m.toLowerCase())
  if (!/^https?:\/\//i.test(url)) url = 'https://' + url.replace(/^\/+/, '')
  return url.replace(/\/+$/, '')
}

/** 取主机名（小写） */
function hostnameOf(url) {
  const m = String(url || '').match(/^https?:\/\/([^\/:?#]+)/i)
  return m ? m[1].toLowerCase() : ''
}

/**
 * 校验接口地址。微信小程序对 wx.request 有几条硬限制，提前在这里拦住并给出人话提示：
 * - 真机必须是 https
 * - 不能带自定义端口（只能 80/443）
 * - 域名不能含中文或空格
 */
function validateBaseUrl(baseUrl, options) {
  const opts = options || {}
  const url = normalizeBaseUrl(baseUrl)
  if (!url) throw new Error('请填写接口地址，例如 https://api.deepseek.com')
  if (!/^https?:\/\//i.test(url)) throw new Error('接口地址要以 http:// 或 https:// 开头')
  if (/[\u4e00-\u9fa5]/.test(url) || /\s/.test(url)) {
    throw new Error('接口地址里有中文或空格，请检查是否复制进了多余文字')
  }
  const host = hostnameOf(url)
  if (!host) throw new Error('接口地址缺少域名，示例：https://api.deepseek.com')
  if (host !== 'localhost' && !/\.[A-Za-z]{2,}$/.test(host)) {
    throw new Error('接口地址的域名不完整：' + host)
  }
  const port = url.match(/^https?:\/\/[^/]+:(\d+)/i)
  if (port && port[1] !== '80' && port[1] !== '443') {
    throw new Error('小程序不允许自定义端口（:' + port[1] + '），请改用标准 443 地址')
  }
  if (!opts.allowHttp && /^http:\/\//i.test(url)) {
    throw new Error('真机上必须使用 https 地址（开发工具里可勾选“不校验合法域名”临时用 http）')
  }
  return url
}

/** 拼出最终请求地址：已经以 /chat/completions 结尾的不再重复拼 */
function chatEndpoint(baseUrl) {
  const base = normalizeBaseUrl(baseUrl)
  if (!base) return ''
  return base.endsWith(CHAT_PATH) ? base : base + CHAT_PATH
}

/** 判断是否是 DeepSeek（决定要不要带 stream:false 等参数） */
function isDeepSeekHost(baseUrl, provider) {
  const host = hostnameOf(normalizeBaseUrl(baseUrl))
  return /(^|\.)deepseek\.com$/i.test(host) || String(provider || '').toLowerCase() === 'deepseek'
}

module.exports = {
  CHAT_PATH,
  PROVIDERS,
  stripNoise,
  extractUrl,
  normalizeBaseUrl,
  hostnameOf,
  validateBaseUrl,
  chatEndpoint,
  isDeepSeekHost
}
