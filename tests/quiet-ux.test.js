const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const { createRequire } = require('node:module')
const { getCheckinReminderClient } = require('../miniprogram/utils/checkin-reminder')

function loadPage(name, api, platform = {}) {
  const file = path.join(__dirname, `../miniprogram/pages/${name}/index.js`)
  const realRequire = createRequire(file)
  let page
  vm.runInNewContext(fs.readFileSync(file, 'utf8'), {
    require: name => name === '../../utils/api' ? api : realRequire(name),
    wx: platform, Page: definition => { page = definition }, console
  }, { filename: file })
  page.data = JSON.parse(JSON.stringify(page.data))
  page.setData = (values, callback) => {
    for (const [key, value] of Object.entries(values)) {
      const parts = key.replace(/\[(\d+)\]/g, '.$1').split('.')
      let target = page.data
      for (const part of parts.slice(0, -1)) target = target[part]
      target[parts.at(-1)] = value
    }
    callback?.()
  }
  return page
}

function profilePage(options = {}) {
  const calls = [], toasts = []
  let finishAuthorization, finishProfile
  let settings = {
    configured: true, templateId: 'daily', subscriptionType: 'ONE_TIME',
    enabled: false, pushEnabled: false, time: '10:00', ...options.settings
  }
  const platform = {
    canIUse: () => false,
    showToast: toast => toasts.push(toast),
    getSetting(request) { request.success({ subscriptionsSetting: { mainSwitch: true, itemSettings: {} } }) },
    requestSubscribeMessage(request) {
      calls.push({ action: 'authorize' })
      finishAuthorization = () => options.authorizationFails
        ? request.fail() : request.success({ daily: options.authorization || 'accept' })
      if (!options.delayAuthorization) finishAuthorization()
    }
  }
  const api = {
    localDate: () => '2026-09-28',
    messageOf: error => error.message,
    resolveCloudFileUrl: async value => value,
    async call(action, event, config) {
      calls.push({ action, event, config })
      if (action === 'getProfile') {
        const snapshot = { user: { nickname: '小明', avatar: '', checkinReminderEnabled: settings.enabled, checkinReminderTime: settings.time } }
        if (options.delayProfile) return new Promise(resolve => { finishProfile = () => resolve(snapshot) })
        return snapshot
      }
      if (action === 'getCheckinReminderSettings') return { ...settings }
      if (options.saveFails) throw new Error('保存失败，请重试')
      if (action === 'updateCheckinReminderSettings') {
        settings = { ...settings, enabled: event.enabled, time: event.time, pushEnabled: settings.pushEnabled || event.grantAccepted === true }
        return { ...settings }
      }
      if (action === 'renewCheckinReminderSubscription') {
        settings = { ...settings, pushEnabled: true }
        return { renewed: true }
      }
      throw new Error(`unexpected action: ${action}`)
    }
  }
  const page = loadPage('profile', api, platform)
  page.data.profile = { user: { checkinReminderEnabled: settings.enabled, checkinReminderTime: settings.time, checkinReminderPushEnabled: settings.pushEnabled } }
  page.data.reminderConfig = { ...settings }
  return { page, calls, toasts, api, platform, authorize: () => finishAuthorization(), finishProfile: () => finishProfile() }
}

test('查看我的或打开提醒设置不会申请订阅，也没有授权提示 toast', async () => {
  const state = profilePage()
  await state.page.load()
  state.page.openReminderSettings()
  assert.equal(state.page.data.reminderSettingsVisible, true)
  assert.equal(state.calls.some(call => call.action === 'authorize'), false)
  assert.deepEqual(state.toasts, [])
  state.page.closeReminderSettings()
  assert.equal(state.page.data.reminderSettingsVisible, false)
})

test('首次开启在点击回调内申请授权，再保存设置；同日自动入口不会重复弹框', async () => {
  const state = profilePage({ delayAuthorization: true })
  const saving = state.page.reminderToggle({ detail: { value: true } })
  assert.equal(state.calls[0].action, 'authorize')
  assert.equal(state.calls.length, 1)
  state.page.openReminderSettings()
  state.page.closeReminderSettings()
  assert.equal(state.page.data.reminderSettingsVisible, true, '不能在保存中关闭造成误判')
  state.page.onShow()
  assert.equal(state.calls.length, 1, '微信授权返回时不能读取旧设置覆盖开关')
  state.authorize()
  await saving
  const update = state.calls.find(call => call.action === 'updateCheckinReminderSettings')
  assert.equal(update.event.grantAccepted, true)
  assert.equal(update.event.time, '10:00')
  assert.equal(update.config.silent, true)
  assert.equal(state.page.data.profile.user.checkinReminderPushEnabled, true)
  assert.equal(state.page.data.reminderSaving, false)
  assert.equal(await getCheckinReminderClient(state.platform, state.api).renew({ ...state.page.data.reminderConfig, pushEnabled: false }), false)
  assert.deepEqual(state.toasts, [])
})

test('拒绝或授权接口失败仍可开启业务提醒，不伪造授权，只在设置内解释', async () => {
  for (const options of [{ authorization: 'reject' }, { authorizationFails: true }]) {
    const state = profilePage(options)
    await state.page.reminderToggle({ detail: { value: true } })
    assert.equal(state.page.data.profile.user.checkinReminderEnabled, true)
    assert.equal(state.page.data.profile.user.checkinReminderPushEnabled, false)
    assert.equal(state.calls.at(-1).event.grantAccepted, false)
    assert.match(state.page.data.reminderFeedback, /未获得微信授权/)
    assert.deepEqual(state.toasts, [])
  }
})

test('关闭提醒、已有额度或配置不可用时不多余申请授权', async () => {
  for (const settings of [{ enabled: true }, { pushEnabled: true }, { configured: false }]) {
    const state = profilePage({ settings })
    await state.page.reminderToggle({ detail: { value: !settings.enabled } })
    assert.equal(state.calls.some(call => call.action === 'authorize'), false)
  }
})

test('只有显式允许微信提醒才绕过冷却，成功和拒绝都使用内联反馈', async () => {
  for (const authorization of ['acceptWithAudio', 'reject']) {
    const state = profilePage({ authorization, settings: { enabled: true } })
    const renewal = state.page.renewReminderFromSettings()
    assert.equal(state.calls[0].action, 'authorize')
    await renewal
    assert.equal(state.page.data.reminderConfig.pushEnabled, authorization === 'acceptWithAudio')
    assert.ok(state.page.data.reminderFeedback)
    assert.equal(state.page.data.reminderSaving, false)
    assert.deepEqual(state.toasts, [])
  }
  const disabled = profilePage()
  await disabled.page.renewReminderFromSettings()
  assert.deepEqual(disabled.calls, [], '不会擅自重新开启用户关闭的提醒')
})

test('长期订阅模板拒绝后仍能在设置中重新允许，不调用一次性续订接口', async () => {
  const state = profilePage({ settings: { enabled: true, subscriptionType: 'LONG_TERM' } })
  const saving = state.page.renewReminderFromSettings()
  assert.equal(state.calls[0].action, 'authorize')
  await saving
  assert.equal(state.page.data.reminderConfig.pushEnabled, true)
  assert.equal(state.calls.some(call => call.action === 'renewCheckinReminderSubscription'), false)
  const update = state.calls.find(call => call.action === 'updateCheckinReminderSettings')
  assert.equal(update.event.grantAccepted, true)
  assert.deepEqual(state.toasts, [])
})

test('提醒设置保存失败恢复原开关和时间，错误不使用弹窗；关闭时改时间不重启提醒', async () => {
  const state = profilePage({ saveFails: true })
  await state.page.reminderToggle({ detail: { value: true } })
  assert.equal(state.page.data.profile.user.checkinReminderEnabled, false)
  assert.equal(state.page.data.reminderFeedbackError, true)
  assert.match(state.page.data.reminderFeedback, /保存失败/)
  const calls = state.calls.length
  await state.page.reminderTimeChange({ detail: { value: '09:00' } })
  assert.equal(state.calls.length, calls)
  state.page.data.profile.user.checkinReminderEnabled = true
  await state.page.reminderTimeChange({ detail: { value: '09:00' } })
  assert.equal(state.page.data.profile.user.checkinReminderTime, '10:00')
  assert.deepEqual(state.toasts, [])
})

test('较早的个人页加载不能覆盖用户刚刚保存的提醒设置', async () => {
  const state = profilePage({ delayProfile: true })
  const loading = state.page.load()
  await state.page.reminderToggle({ detail: { value: true } })
  state.finishProfile()
  await loading
  assert.equal(state.page.data.profile.user.checkinReminderEnabled, true)
  assert.equal(state.page.data.reminderConfig.pushEnabled, true)
})

function calendarPage(tasks = []) {
  const calls = []
  const api = {
    localDate: () => '2026-09-28', messageOf: error => error.message,
    async call(action, event) { calls.push({ action, event }); return { month: event.month, days: [] } }
  }
  const page = loadPage('calendar', api)
  page.data.makeupEligible = true
  page.data.calendar = { makeup: { balance: 2 } }
  page.data.selectedDay = { date: '2026-09-27' }
  page.data.dayReview.tasks = tasks
  return { page, calls }
}

test('没有未完成任务的补签直接进入心情小记，尚未确认不消耗卡或请求授权', () => {
  for (const tasks of [[], [{ planId: 'done', completed: true }]]) {
    const { page, calls } = calendarPage(tasks)
    page.startMakeup()
    assert.equal(page.data.makeupEditor.step, 'REVIEW')
    page.previousMakeupStep()
    assert.equal(page.data.makeupEditor.step, 'REVIEW')
    assert.equal(page.data.calendar.makeup.balance, 2)
    assert.deepEqual(calls, [])
  }
})

test('有未完成任务的补签仍先选择实际完成任务，不能自动选中', () => {
  const { page } = calendarPage([{ planId: 'study', completed: false }, { planId: 'done', completed: true }])
  page.startMakeup()
  assert.equal(page.data.makeupEditor.step, 'TASKS')
  assert.equal(page.data.makeupEditor.tasks.length, 1)
  assert.equal(page.data.makeupEditor.tasks[0].selected, false)
  page.nextMakeupStep()
  page.previousMakeupStep()
  assert.equal(page.data.makeupEditor.step, 'TASKS')
})

test('回到本月只在其他月份加载一次，保留正确日期和月份', async () => {
  const { page, calls } = calendarPage()
  page.data.month = '2026-06'
  page.goCurrentMonth()
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(page.data.month, '2026-09')
  assert.equal(page.data.currentMonth, '2026-09')
  assert.equal(calls.length, 1)
  page.goCurrentMonth()
  assert.equal(calls.length, 1)
})

test('快速翻月时较旧的成功或失败不会覆盖当前月、错误或加载状态', async () => {
  for (const oldFails of [false, true]) {
    const requests = []
    const api = {
      localDate: () => '2026-09-28', messageOf: error => error.message,
      call: (action, event) => new Promise((resolve, reject) => requests.push({ ...event, resolve, reject }))
    }
    const page = loadPage('calendar', api)
    const oldLoad = page.loadCalendar()
    page.data.month = '2026-08'
    const newLoad = page.loadCalendar()
    if (oldFails) requests[0].reject(new Error('旧请求失败'))
    else requests[0].resolve({ month: '2026-09', days: [] })
    await oldLoad
    assert.equal(page.data.calendar, null)
    assert.equal(page.data.loading, true)
    assert.equal(page.data.error, '')
    requests[1].resolve({ month: '2026-08', days: [] })
    await newLoad
    assert.equal(page.data.calendar.month, '2026-08')
    assert.equal(page.data.loading, false)
  }
})

test('今日与日历不显示续订横幅，保留显式设置入口和补签消耗说明', () => {
  const read = name => fs.readFileSync(path.join(__dirname, `../miniprogram/pages/${name}/index.wxml`), 'utf8')
  for (const name of ['today', 'calendar']) assert.doesNotMatch(read(name), /续订|reminderRenewalAvailable/)
  assert.match(read('profile'), /bindtap="openReminderSettings"/)
  assert.match(read('profile'), /bindtap="renewReminderFromSettings"/)
  assert.match(read('calendar'), /确认补签 · 消耗 1 张/)
  assert.match(read('calendar'), /month !== currentMonth/)
})

test('已完成任务默认折叠，分区渲染保留原数组索引以免完成错误的任务', () => {
  const page = loadPage('today', { localDate: () => '2026-09-28' })
  const plans = [{ _id: 'done', completed: true }, { _id: 'pending', completed: false }]
  page.data.dashboard = { plans }
  assert.equal(page.data.completedExpanded, false)
  page.toggleCompleted()
  assert.equal(page.data.completedExpanded, true)
  assert.equal(page.data.dashboard.plans, plans)
  assert.equal(page.planFromEvent({ currentTarget: { dataset: { index: 1 } } })._id, 'pending')
  const wxml = fs.readFileSync(path.join(__dirname, '../miniprogram/pages/today/index.wxml'), 'utf8')
  assert.equal((wxml.match(/wx:for="\{\{dashboard.plans\}\}"/g) || []).length, 2)
  assert.match(wxml, /wx:if="\{\{completedExpanded\}\}"/)
  assert.match(wxml, /class="check-hit-area" data-index="\{\{index\}\}" catchtap="quickComplete"/)
})
