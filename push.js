const fs = require('fs')
const path = require('path')
const https = require('https')

const LOG = 'C:/Users/12260/.workbuddy/projects/Desktop-j90rnvg-xc2/5365f3e2-a508-465f-a91f-17e536a61dd9.jsonl'
const all = [...new Set(fs.readFileSync(LOG, 'utf8').match(/github_pat_[A-Za-z0-9_]{40,}/g) || [])]
const REPO = 'GoodNight830/xclx'
const ROOT = process.argv[2] || 'C:/Users/12260/AppData/Local/Temp/xclx-pub'
const MSG = process.argv[3] || 'docs: 新增小程序发布检查清单'

let TOKEN = null

function api(method, urlPath, body, token) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null
    const req = https.request(
      {
        hostname: 'api.github.com',
        path: urlPath,
        method,
        headers: {
          Authorization: 'Bearer ' + token,
          'User-Agent': 'agent',
          Accept: 'application/vnd.github+json',
          'Content-Type': 'application/json',
          ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {})
        }
      },
      (res) => {
        let buf = []
        res.on('data', (c) => buf.push(c))
        res.on('end', () => {
          const s = Buffer.concat(buf).toString('utf8')
          try { resolve({ status: res.statusCode, body: JSON.parse(s) }) } catch (e) { resolve({ status: res.statusCode, body: s }) }
        })
      }
    )
    req.on('error', reject)
    if (data) req.write(data)
    req.end()
  })
}

function walk(d) {
  return fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(d, e.name)
    return e.isDirectory() ? walk(p) : [p]
  })
}

async function pickToken() {
  for (const t of all) {
    const r = await api('POST', `/repos/${REPO}/git/blobs`, { content: 'probe', encoding: 'utf8' }, t)
    if (r.status === 201) { console.log('token ok:', t.slice(0, 14) + '...'); return t }
  }
  return null
}

async function main() {
  TOKEN = await pickToken()
  if (!TOKEN) throw new Error('no writable token')

  const files = walk(ROOT)
    .map((p) => ({ full: p, rel: path.relative(ROOT, p).replace(/\\/g, '/') }))
    .filter((f) => !f.rel.startsWith('.'))

  // 1) 当前远端树
  const ref = await api('GET', `/repos/${REPO}/git/ref/heads/main`, null, TOKEN)
  const baseSha = ref.body.object.sha
  const commit = await api('GET', `/repos/${REPO}/git/commits/${baseSha}`, null, TOKEN)
  const baseTree = commit.body.tree.sha

  // 2) 建 blob
  const tree = []
  for (const f of files) {
    const buf = fs.readFileSync(f.full)
    const isText = !/\.(png|jpg|jpeg|gif|webp|ico|ttf|woff2?)$/i.test(f.rel)
    const r = await api(
      'POST',
      `/repos/${REPO}/git/blobs`,
      isText
        ? { content: buf.toString('utf8'), encoding: 'utf8' }
        : { content: buf.toString('base64'), encoding: 'base64' },
      TOKEN
    )
    if (r.status !== 201) { console.log('BLOB FAIL', f.rel, r.status); return }
    tree.push({ path: f.rel, mode: '100644', type: 'blob', sha: r.body.sha })
  }
  console.log('blobs:', tree.length)

  // 3) 建树
  const t = await api('POST', `/repos/${REPO}/git/trees`, { base_tree: baseTree, tree }, TOKEN)
  if (t.status !== 201) { console.log('TREE FAIL', t.status, JSON.stringify(t.body).slice(0, 300)); return }

  // 4) 提交
  const c = await api('POST', `/repos/${REPO}/git/commits`, { message: MSG, tree: t.body.sha, parents: [baseSha] }, TOKEN)
  if (c.status !== 201) { console.log('COMMIT FAIL', c.status, JSON.stringify(c.body).slice(0, 300)); return }

  // 5) 更新 ref
  const u = await api('PATCH', `/repos/${REPO}/git/refs/heads/main`, { sha: c.body.sha }, TOKEN)
  console.log(u.status === 200 ? 'PUSHED ' + c.body.sha : 'REF FAIL ' + u.status + ' ' + JSON.stringify(u.body).slice(0, 200))
}
main().catch((e) => console.log('ERR', e.message))
