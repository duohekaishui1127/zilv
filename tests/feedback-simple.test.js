const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const { createRequire } = require('node:module')

function feedbackPage(api, platform = {}) {
  const file = path.join(__dirname, '../miniprogram/pages/feedback/index.js')
  const realRequire = createRequire(file), toasts = []
  let page
  vm.runInNewContext(fs.readFileSync(file, 'utf8'), {
    require: name => name === '../../utils/api' ? { messageOf: error => error.message, ...api } : realRequire(name),
    Page: value => { page = value },
    wx: { getSystemInfoSync: () => ({ platform: 'ios', system: 'iOS', model: 'test', version: 'test' }), showToast: value => toasts.push(value), ...platform },
    console: { warn() {} }
  }, { filename: file })
  page.data = structuredClone(page.data)
  page.setData = patch => Object.assign(page.data, patch)
  return { page, toasts }
}

function feedbackBackend() {
  const file = path.join(__dirname, '../cloudfunctions/api/actions/feedback.js')
  const realRequire = createRequire(file), module = { exports: {} }, records = [], notified = []
  const db = { collection() {
    let criteria = {}, limit = Infinity
    const query = {
      where(value) { criteria = value; return query }, orderBy() { return query }, limit(value) { limit = value; return query },
      async get() { return { data: records.filter(row => Object.entries(criteria).every(([key, value]) => row[key] === value)).slice(0, limit) } },
      async add({ data }) { const id = `feedback-${records.length + 1}`; records.push({ _id: id, ...structuredClone(data) }); return { _id: id } },
      doc(id) { return { async update({ data }) { Object.assign(records.find(row => row._id === id), data) } } }
    }
    return query
  } }
  vm.runInNewContext(fs.readFileSync(file, 'utf8'), {
    require: name => name === '../lib/db' ? { db, C: { FEEDBACKS: 'feedbacks' } }
      : name === '../services/feedback-admin' ? {
        isFeedbackAdmin: user => user.admin === true,
        async notifyFeedbackAdmins(feedback) { notified.push(feedback._id); return { configured: true, notified: 1 } }
      } : realRequire(name),
    module, exports: module.exports, console
  }, { filename: file })
  return { actions: module.exports, records, notified }
}

test('反馈界面只有文字与可选截图，没有分类和联系方式输入', () => {
  const { page } = feedbackPage({})
  const view = fs.readFileSync(path.join(__dirname, '../miniprogram/pages/feedback/index.wxml'), 'utf8')
  assert.equal(Object.hasOwn(page.data, 'categoryIndex'), false)
  assert.equal(Object.hasOwn(page.data, 'contact'), false)
  assert.doesNotMatch(view, /反馈类型|联系方式|<picker\b|changeCategory/)
  assert.match(view, /可选/)
  assert.match(view, /开发者回复/)
})

test('只写一句话即可提交，沿用兼容分类，成功后不额外请求列表', async () => {
  const calls = []
  const { page } = feedbackPage({ async call(action, event, options) {
    calls.push({ action, event, options })
    return { feedback: { _id: 'f', content: event.content, status: 'NEW', createdAt: new Date() } }
  } })
  page.data.content = '  按钮有点慢  '
  const originalId = page.data.clientMutationId
  await page.submit()
  assert.equal(calls.length, 1)
  assert.equal(calls[0].action, 'submitFeedback')
  assert.equal(calls[0].event.content, '按钮有点慢')
  assert.equal(calls[0].event.category, 'OTHER')
  assert.equal(Object.hasOwn(calls[0].event, 'contact'), false)
  assert.equal(calls[0].event.images.length, 0)
  assert.ok(calls[0].event.deviceInfo.appVersion)
  assert.equal(calls[0].options.silent, true)
  assert.equal(page.data.feedbacks[0].statusLabel, '待处理')
  assert.equal(page.data.content, '')
  assert.notEqual(page.data.clientMutationId, originalId)
})

test('空内容不提交、不上传；提交中重复点击和修改附件被阻止', async () => {
  let calls = 0, resolve
  const { page } = feedbackPage({ call() { calls++; return new Promise(done => { resolve = done }) } })
  page.data.content = '   '
  await page.submit()
  assert.equal(calls, 0)
  page.data.content = '反馈'
  page.data.attachments = [{ key: 'a', fileId: 'cloud://existing' }]
  const saving = page.submit()
  await page.submit(); await page.removeImage({ currentTarget: { dataset: { index: 0 } } })
  page.input({ detail: { value: '提交时更改' } })
  assert.equal(calls, 1)
  assert.equal(page.data.content, '反馈')
  assert.equal(page.data.attachments.length, 1)
  resolve({ feedback: { _id: 'f', status: 'NEW' } }); await saving
  assert.equal(page.data.saving, false)
})

test('失败保留内容、上传结果和请求标识，重试不重新上传同一截图', async () => {
  let uploads = 0, attempts = 0
  const ids = [], { page, toasts } = feedbackPage({
    async uploadImage() { uploads++; return 'cloud://screen' },
    async call(_, event) {
      ids.push(event.clientMutationId)
      if (++attempts === 1) throw new Error('网络不稳定，请重试')
      return { feedback: { _id: 'f', content: event.content, images: event.images, status: 'NEW' } }
    }
  })
  page.data.content = '截图说明'
  page.data.attachments = [{ key: 'a', tempPath: '/tmp/screen.png', fileId: '' }]
  await page.submit()
  assert.equal(page.data.content, '截图说明')
  assert.equal(page.data.attachments[0].fileId, 'cloud://screen')
  assert.equal(page.data.saving, false)
  assert.equal(toasts.at(-1).title, '网络不稳定，请重试')
  await page.submit()
  assert.equal(uploads, 1)
  assert.equal(ids[0], ids[1])
  assert.equal(page.data.feedbacks[0].images[0], 'cloud://screen')
})

test('读取设备信息失败仍能提交；旧分类、处理状态和回复仍可查看', async () => {
  let submitted = false
  const { page } = feedbackPage({ async call(action) {
    if (action === 'submitFeedback') { submitted = true; return { feedback: { _id: 'new', status: 'NEW' } } }
    return { feedbacks: [{ _id: 'old', category: 'BUG', categoryLabel: '问题反馈', contact: '旧联系方式', status: 'COMPLETED', adminReply: '已经修复', repliedAt: new Date() }] }
  } }, { getSystemInfoSync() { throw new Error('unavailable') } })
  await page.load()
  assert.equal(page.data.feedbacks[0].statusLabel, '已完成')
  assert.equal(page.data.feedbacks[0].adminReply, '已经修复')
  assert.equal(page.data.feedbacks[0].categoryLabel, '问题反馈')
  page.data.content = '新反馈'; await page.submit()
  assert.equal(submitted, true)
  assert.equal(page.data.feedbacks[1]._id, 'old')
})

test('迟到的历史列表响应不能覆盖刚提交的新反馈', async () => {
  let resolve
  const { page } = feedbackPage({ call(action) {
    if (action === 'getMyFeedbacks') return new Promise(done => { resolve = done })
    return Promise.resolve({ feedback: { _id: 'new', status: 'NEW' } })
  } })
  const loading = page.load()
  page.data.content = '刚提交'
  await page.submit()
  resolve({ feedbacks: [] }); await loading
  assert.equal(page.data.feedbacks[0]._id, 'new')
  assert.equal(page.data.loading, false)
})

test('服务端接受省略分类、联系方式和截图的反馈，并正常通知管理员', async () => {
  const { actions, records, notified } = feedbackBackend()
  const result = await actions.submitFeedback({ user: { _id: 'u' }, event: { content: '按钮点不动', clientMutationId: 'm' } })
  assert.equal(result.feedback.category, 'OTHER')
  assert.equal(result.feedback.categoryLabel, '用户反馈')
  assert.equal(result.feedback.contact, '')
  assert.equal(result.feedback.images.length, 0)
  assert.equal(records.length, 1)
  assert.equal(notified.length, 1)
})

test('服务端兼容旧版分类、联系方式与重试，不修改旧记录', async () => {
  const { actions, records } = feedbackBackend()
  const event = { category: 'FEATURE', contact: '  old-contact  ', content: '旧版建议', clientMutationId: 'm' }
  await actions.submitFeedback({ user: { _id: 'u' }, event })
  const result = await actions.submitFeedback({ user: { _id: 'u' }, event: { ...event, category: 'OTHER' } })
  assert.equal(result.duplicate, true)
  assert.equal(records.length, 1)
  assert.equal(result.feedback.category, 'FEATURE')
  assert.equal(result.feedback.categoryLabel, '功能建议')
  assert.equal(result.feedback.contact, 'old-contact')
})

test('简化字段不放宽空内容、无效分类、截图数量和管理员限制', async () => {
  const { actions, records } = feedbackBackend()
  for (const fields of [{ content: ' ' }, { category: 'UNKNOWN' }, { images: ['a', 'b', 'c', 'd'] }]) {
    await assert.rejects(actions.submitFeedback({ user: { _id: 'u' }, event: { content: '反馈', clientMutationId: 'm', ...fields } }), error => error.code === 'INVALID_PARAMETER')
  }
  await assert.rejects(actions.submitFeedback({ user: { _id: 'admin', admin: true }, event: { content: '反馈', clientMutationId: 'm' } }), error => error.code === 'FORBIDDEN')
  assert.equal(records.length, 0)
})
