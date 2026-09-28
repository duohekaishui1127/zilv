const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const { createRequire } = require('node:module')

function calendarPage(options = {}) {
  const file = path.join(__dirname, '../miniprogram/pages/calendar/index.js')
  const realRequire = createRequire(file)
  const calls = []
  const toasts = []
  let authorize, finishCalendar
  let settings = {
    configured: true, templateId: 'checkin-template', subscriptionType: 'ONE_TIME',
    enabled: true, time: '10:00', timezoneOffset: 480, pushEnabled: false, ...options.settings
  }
  const api = {
    localDate: () => '2026-09-28',
    messageOf: error => error.message,
    async call(action, event) {
      calls.push({ action, event })
      if (action === 'renewCheckinReminderSubscription') {
        if (options.renewalFails) throw new Error('续订保存失败')
        settings = { ...settings, pushEnabled: true }
        return { renewed: true }
      }
      if (action === 'makeupDailyCheckin') {
        if (options.makeupFails) throw new Error('补签失败')
        return { success: true }
      }
      if (action === 'getActivityCalendar') {
        const snapshot = {
          month: '2026-09', days: [], makeup: { balance: 2, yesterday: '2026-09-27' },
          reminderSettings: { ...settings }
        }
        if (options.delayCalendar) return new Promise(resolve => { finishCalendar = () => resolve(snapshot) })
        return snapshot
      }
      return {}
    }
  }
  let page
  vm.runInNewContext(fs.readFileSync(file, 'utf8'), {
    require: name => name === '../../utils/api' ? api : realRequire(name),
    Page: definition => { page = definition },
    console: { warn() {} },
    wx: {
      requestSubscribeMessage(request) {
        calls.push({ action: 'authorize', templateIds: request.tmplIds })
        authorize = () => {
          if (options.authorizationFails) request.fail({ errMsg: 'cancelled' })
          else request.success({ [settings.templateId]: options.authorization || 'accept' })
        }
        if (!options.delayedAuthorization) authorize()
      },
      showToast: toast => toasts.push(toast)
    }
  }, { filename: file })
  page.data = JSON.parse(JSON.stringify(page.data))
  page.setData = values => {
    for (const [key, value] of Object.entries(values)) {
      const keys = key.split('.')
      let target = page.data
      for (const part of keys.slice(0, -1)) target = target[part]
      target[keys[keys.length - 1]] = value
    }
  }
  page.setReminderSettings(settings)
  page.data.makeupEditor = {
    visible: true, freeEdit: false, step: 'REVIEW', date: '2026-09-27', saving: false,
    mood: 'GOOD', note: '昨天的记录', tasks: [{ planId: 'study', selected: true }]
  }
  return { page, calls, toasts, authorize:() => authorize(), finishCalendar:() => finishCalendar() }
}

test('补签确认在任何异步等待之前请求微信授权，并保留 10:00 设置', async () => {
  const { page, calls } = calendarPage()
  const saving = page.submitMakeup()
  assert.equal(calls[0].action, 'authorize')
  assert.equal(calls[1].action, 'makeupDailyCheckin')
  await saving
  const renewal = calls.find(call => call.action === 'renewCheckinReminderSubscription')
  assert.deepEqual(Object.keys(renewal.event), ['authorized'])
  assert.equal(renewal.event.authorized, true)
  assert.equal(calls.find(call => call.action === 'makeupDailyCheckin').event.makeupDate, '2026-09-27')
  assert.equal(page.data.reminderSettings.time, '10:00')
  assert.equal(page.data.reminderSettings.pushEnabled, true)
  assert.equal(page.data.reminderRenewalAvailable, false)
})

test('已有未使用授权、关闭提醒、长期模板或未配置时，补签不重复申请', async () => {
  for (const settings of [{ pushEnabled: true }, { enabled: false }, { subscriptionType: 'LONG_TERM' }, { configured: false }]) {
    const { page, calls } = calendarPage({ settings })
    await page.submitMakeup()
    assert.equal(calls.some(call => call.action === 'authorize'), false)
    assert.equal(calls.some(call => call.action === 'renewCheckinReminderSubscription'), false)
    assert.equal(calls.some(call => call.action === 'makeupDailyCheckin'), true)
  }
})

test('拒绝或微信授权失败不影响补签，也不会错误显示已授权状态', async () => {
  for (const options of [{ authorization: 'reject' }, { authorizationFails: true }]) {
    const { page, calls, toasts } = calendarPage(options)
    await page.submitMakeup()
    assert.equal(calls.some(call => call.action === 'renewCheckinReminderSubscription'), false)
    assert.equal(toasts.at(-1).title, '补签成功')
    assert.equal(page.data.reminderRenewalAvailable, true)
  }
})

test('续订保存失败不回滚补签；补签失败也不丢弃已获微信授权', async () => {
  const failedRenewal = calendarPage({ renewalFails: true })
  await failedRenewal.page.submitMakeup()
  assert.equal(failedRenewal.toasts.at(-1).title, '补签成功')
  assert.equal(failedRenewal.page.data.reminderRenewalAvailable, true)
  const failedMakeup = calendarPage({ makeupFails: true })
  await failedMakeup.page.submitMakeup()
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(failedMakeup.toasts.at(-1).title, '补签失败')
  assert.equal(failedMakeup.page.data.reminderSettings.pushEnabled, true)
  assert.equal(failedMakeup.page.data.makeupEditor.saving, false)
})

test('仅编辑历史心情和小记不触发订阅；重复点击确认只提交一次', async () => {
  const edit = calendarPage()
  edit.page.data.makeupEditor.freeEdit = true
  await edit.page.submitMakeup()
  assert.equal(edit.calls.some(call => call.action === 'authorize'), false)
  assert.equal(edit.calls.some(call => call.action === 'saveDailyReview'), true)
  const makeup = calendarPage()
  await Promise.all([makeup.page.submitMakeup(), makeup.page.submitMakeup()])
  assert.equal(makeup.calls.filter(call => call.action === 'authorize').length, 1)
  assert.equal(makeup.calls.filter(call => call.action === 'makeupDailyCheckin').length, 1)
})

test('补签授权逻辑支持显式申请，接受带声音的授权也有效', async () => {
  const { page, calls } = calendarPage({ authorization: 'acceptWithAudio' })
  const renewal = page.beginReminderRenewal(true)
  assert.equal(calls[0].action, 'authorize')
  await renewal
  assert.equal(page.data.reminderRenewalAvailable, false)
})

test('补签保存和成功反馈不等待微信授权回调，完成后仍可独立保存授权', async () => {
  const state = calendarPage({ delayedAuthorization:true })
  await state.page.submitMakeup()
  assert.equal(state.toasts.at(-1).title, '补签成功')
  assert.equal(state.page.data.makeupEditor.visible, false)
  assert.equal(state.calls.some(call => call.action === 'renewCheckinReminderSubscription'), false)
  state.authorize()
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(state.page.data.reminderSettings.pushEnabled, true)
})

test('补签后的旧日历查询返回时，不覆盖已经成功保存的提醒授权', async () => {
  const state = calendarPage({ delayedAuthorization:true,delayCalendar:true })
  const saving = state.page.submitMakeup()
  await new Promise(resolve => setImmediate(resolve))
  state.authorize()
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(state.page.data.reminderSettings.pushEnabled, true)
  state.finishCalendar()
  await saving
  assert.equal(state.page.data.reminderSettings.pushEnabled, true)
  assert.equal(state.page.data.reminderRenewalAvailable, false)
})
