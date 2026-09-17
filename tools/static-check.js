const fs = require('fs')
const path = require('path')
const child = require('child_process')

const root = path.resolve(__dirname, '..')
const ignored = new Set(['node_modules', 'miniprogram_npm'])
let checkedJs = 0
let checkedJson = 0
const failures = []
const warnings = []

function fail(message) { failures.push(message) }
function warn(message) { warnings.push(message) }
function read(rel) { return fs.readFileSync(path.join(root, rel), 'utf8') }
function json(rel) { return JSON.parse(read(rel)) }

function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (ignored.has(entry.name) || entry.name === '.git') continue
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) walk(full)
    else if (entry.name.endsWith('.js')) {
      child.execFileSync(process.execPath, ['--check', full], { stdio: 'pipe' })
      checkedJs++
    } else if (entry.name.endsWith('.json')) {
      JSON.parse(fs.readFileSync(full, 'utf8'))
      checkedJson++
    }
  }
}

function checkVersions() {
  const expected = read('VERSION').trim()
  const versions = {
    'package.json': json('package.json').version,
    'package-lock.json': json('package-lock.json').version,
    'package-lock root': json('package-lock.json').packages?.['']?.version,
    'api package': json('cloudfunctions/api/package.json').version,
    'admin-init package': json('cloudfunctions/admin-init/package.json').version,
    'reminder-dispatch package': json('cloudfunctions/reminder-dispatch/package.json').version,
    'client config': (read('miniprogram/config/version.js').match(/APP_VERSION:\s*['"]([^'"]+)/) || [])[1],
    'server config': (read('cloudfunctions/api/lib/version.js').match(/APP_VERSION:\s*['"]([^'"]+)/) || [])[1],
    'admin-init': (read('cloudfunctions/admin-init/index.js').match(/APP_VERSION\s*=\s*['"]([^'"]+)/) || [])[1]
  }
  for (const [name, version] of Object.entries(versions)) if (version !== expected) fail(`版本不一致: ${name}=${version || 'missing'}, expected=${expected}`)

  const schemaClient = Number((read('miniprogram/config/version.js').match(/SCHEMA_VERSION:\s*(\d+)/) || [])[1])
  const schemaServer = Number((read('cloudfunctions/api/lib/version.js').match(/SCHEMA_VERSION:\s*(\d+)/) || [])[1])
  const schemaAdmin = Number((read('cloudfunctions/admin-init/index.js').match(/SCHEMA_VERSION\s*=\s*(\d+)/) || [])[1])
  if (!schemaClient || schemaClient !== schemaServer || schemaClient !== schemaAdmin) fail(`Schema 版本不一致: client=${schemaClient}, server=${schemaServer}, admin=${schemaAdmin}`)
}

function checkDependencies() {
  for (const rel of ['cloudfunctions/api/package.json', 'cloudfunctions/admin-init/package.json', 'cloudfunctions/reminder-dispatch/package.json']) {
    const pkg = json(rel)
    for (const [name, version] of Object.entries(pkg.dependencies || {})) {
      if (version === 'latest' || version === '*') fail(`${rel} 依赖 ${name} 未固定版本`)
    }
  }
}

function checkPages() {
  const app = json('miniprogram/app.json')
  for (const page of app.pages || []) {
    for (const ext of ['js', 'json', 'wxml', 'wxss']) {
      const rel = `miniprogram/${page}.${ext}`
      if (!fs.existsSync(path.join(root, rel))) fail(`页面资源缺失: ${rel}`)
    }
  }
  const tabs = app.tabBar?.list || []
  if (tabs.length < 2 || tabs.length > 5) fail(`tabBar 数量必须为2到5项，当前为${tabs.length}项`)
  for (const tab of app.tabBar?.list || []) if (!(app.pages || []).includes(tab.pagePath)) fail(`tabBar 页面未注册: ${tab.pagePath}`)
  for (const tab of tabs) {
    for (const field of ['iconPath', 'selectedIconPath']) {
      if (!tab[field] || !fs.existsSync(path.join(root, 'miniprogram', tab[field]))) fail(`tabBar 素材缺失: ${tab[field] || `${tab.pagePath}.${field}`}`)
    }
  }
}

function exportedActions() {
  const dir = path.join(root, 'cloudfunctions/api/actions')
  const names = new Set()
  for (const file of fs.readdirSync(dir).filter(x => x.endsWith('.js') && x !== 'index.js')) {
    const text = fs.readFileSync(path.join(dir, file), 'utf8')
    const match = text.match(/module\.exports\s*=\s*\{([\s\S]*?)\}/m)
    if (!match) continue
    match[1].split(',').map(x => x.trim()).filter(Boolean).forEach(item => {
      const key = item.includes(':') ? item.split(':')[0].trim() : item
      if (/^[A-Za-z_$][\w$]*$/.test(key)) names.add(key)
    })
    const lines = text.split(/\r?\n/).length
    if (lines > 220) fail(`Action 模块过大(${lines}行): ${file}`)
    else if (lines > 160) warn(`Action 模块较大(${lines}行): ${file}`)
  }
  return names
}

function clientActions() {
  const names = new Set()
  const base = path.join(root, 'miniprogram')
  function scan(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) scan(full)
      else if (entry.name.endsWith('.js')) {
        const text = fs.readFileSync(full, 'utf8')
        const regex = /api\.call\(\s*['"]([A-Za-z0-9_]+)['"]/g
        let match
        while ((match = regex.exec(text))) names.add(match[1])
        if (!full.endsWith(path.join('utils', 'api.js')) && /wx\.cloud\.callFunction\s*\(/.test(text)) fail(`页面绕过 API Client: ${path.relative(root, full)}`)
      }
    }
  }
  scan(base)
  return names
}

function checkActionContracts() {
  const exported = exportedActions()
  const called = clientActions()
  for (const name of called) if (!exported.has(name)) fail(`客户端调用但服务端未导出的 Action: ${name}`)
}


function checkWxmlBalance() {
  const voidTags = new Set(['input', 'image', 'switch', 'icon', 'progress'])
  const base = path.join(root, 'miniprogram')
  function scan(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) scan(full)
      else if (entry.name.endsWith('.wxml')) {
        const text = fs.readFileSync(full, 'utf8')
        const stack = []
        const regex = /<\s*(\/?)\s*([A-Za-z][\w-]*)([^>]*)>/g
        let match
        while ((match = regex.exec(text))) {
          const [, closing, name, rest] = match
          const selfClosing = rest.trimEnd().endsWith('/') || voidTags.has(name)
          if (closing) {
            const expected = stack.pop()
            if (expected !== name) {
              fail(`WXML 标签不平衡: ${path.relative(root, full)} 期望 </${expected || 'none'}> 实际 </${name}>`)
              break
            }
          } else if (!selfClosing) stack.push(name)
        }
        if (stack.length) fail(`WXML 存在未关闭标签: ${path.relative(root, full)} -> ${stack.join(' > ')}`)
      }
    }
  }
  scan(base)
}

function checkProjectConfig() {
  const config = json('project.config.json')
  if (!config.libVersion || config.libVersion === 'trial') fail('project.config.json 必须固定稳定基础库版本，不能使用 trial')
}

function checkReminderFunction() {
  const config = json('cloudfunctions/reminder-dispatch/config.json')
  const permissions = config.permissions?.openapi || []
  if (!permissions.includes('subscribeMessage.send')) fail('reminder-dispatch 缺少 subscribeMessage.send OpenAPI 权限')
  const timer = (config.triggers || []).find(trigger => trigger.type === 'timer')
  if (!timer?.config) fail('reminder-dispatch 缺少定时触发器')
}

function checkLegacyModules() {
  for (const rel of ['cloudfunctions/api/actions/social.js', 'cloudfunctions/api/actions/activity.js']) {
    if (fs.existsSync(path.join(root, rel))) warn(`旧的大模块仍存在: ${rel}`)
  }
}

walk(root)
checkVersions()
checkDependencies()
checkPages()
checkWxmlBalance()
checkProjectConfig()
checkReminderFunction()
checkActionContracts()
checkLegacyModules()

warnings.forEach(message => console.warn(`WARN: ${message}`))
if (failures.length) {
  failures.forEach(message => console.error(`FAIL: ${message}`))
  process.exit(1)
}
console.log(`static-check ok: JS=${checkedJs}, JSON=${checkedJson}, warnings=${warnings.length}`)
