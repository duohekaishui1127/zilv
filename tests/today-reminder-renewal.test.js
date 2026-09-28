const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const { createRequire } = require('node:module')
const { getCheckinReminderClient } = require('../miniprogram/utils/checkin-reminder')

function setup(options = {}) {
  const file = path.join(__dirname, '../miniprogram/pages/today/index.js')
  const realRequire = createRequire(file)
  const calls = [], toasts = []
  let authorization
  const platform = {
    getSetting(request) { request.success({ subscriptionsSetting:{ mainSwitch:true,itemSettings:{ daily:'accept' } } }) },
    requestSubscribeMessage(request) {
      calls.push({ action:'authorize' })
      authorization = () => request.success({ daily:options.authorization || 'accept' })
      if (!options.delayedAuthorization) authorization()
    },
    showToast: toast => toasts.push(toast),
    showModal(request) { calls.push({ action:'confirm' }); request.success({ confirm:options.confirm !== false }) }
  }
  const api = {
    localDate: () => '2026-09-28',
    async call(action, event) {
      calls.push({ action,event })
      if (action === 'renewCheckinReminderSubscription') {
        if (options.saveFails) throw new Error('renewal failed')
        return { renewed:true }
      }
      if (options.taskFails) throw new Error('task failed')
      return { plans:[],achievedGoals:[] }
    }
  }
  let page
  vm.runInNewContext(fs.readFileSync(file, 'utf8'), {
    require: name => name === '../../utils/api' ? api : realRequire(name),
    Page: definition => { page = definition }, wx:platform, console
  }, { filename:file })
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
  const plan = { _id:'last',name:'背单词',completed:false,timerEnabled:false,...options.plan }
  page.data.reminderConfig = { configured:true,templateId:'daily',subscriptionType:'ONE_TIME',...options.config }
  page.data.dashboard = {
    user:{ _id:'user-1',checkinReminderEnabled:true,checkinReminderPushEnabled:false,reminderRenewedToday:false,...options.user },
    completion:{ total:2,completed:1,...options.completion },plans:[plan],dailyReview:null
  }
  page.planFromEvent = () => plan
  page.optimisticComplete = () => {
    page._quickCompletingIds = new Set([plan._id])
    plan.completed = true
    return {}
  }
  page.rollbackOptimisticCompletion = () => { plan.completed = false }
  page.applyCompletionResult = () => {}
  page.finishQuickSync = () => page._quickCompletingIds?.delete(plan._id)
  page.showCompletionUndo = () => calls.push({ action:'completion-feedback' })
  page.refreshActiveTimerBar = () => {}
  const loadDashboard = page.load
  page.load = async () => {
    calls.push({ action:'load' })
    page.data.dashboard.dailyReview = { mood:'GOOD',note:'' }
  }
  return {
    page,plan,calls,toasts,api,platform,
    loadDashboard:() => loadDashboard.call(page),
    authorize: () => authorization(),
    refresh: () => getCheckinReminderClient(platform,api).refresh('daily')
  }
}

function flush() { return new Promise(resolve => setImmediate(resolve)) }
const event = { currentTarget:{ dataset:{ index:0 } } }

test('普通任务最后一项完成时同步申请续订，但不等待授权完成才更新任务', async () => {
  const state = setup({ delayedAuthorization:true })
  await state.refresh()
  await state.page.quickComplete(event)
  assert.equal(state.calls[0].action, 'authorize')
  assert.equal(state.calls[1].action, 'completePlan')
  assert.equal(state.plan.completed, true)
  assert.ok(state.calls.some(call => call.action === 'completion-feedback'))
  assert.equal(state.calls.some(call => call.action === 'renewCheckinReminderSubscription'), false)
  state.authorize()
  await flush()
  assert.equal(state.page.data.dashboard.user.checkinReminderPushEnabled, true)
  assert.equal(state.toasts.some(toast => /续订/.test(toast.title)), false)
})

test('非最后一项、提醒关闭、仍有额度或未配置时，普通完成不申请', async () => {
  for (const options of [
    { completion:{ completed:0 } },{ user:{ checkinReminderEnabled:false } },
    { user:{ checkinReminderPushEnabled:true } },{ config:{ configured:false } }
  ]) {
    const state = setup(options)
    await state.refresh()
    await state.page.quickComplete(event)
    await flush()
    assert.equal(state.calls.some(call => call.action === 'authorize'), false)
    assert.equal(state.plan.completed, true)
  }
})

test('未完成任务或无任务时，手动打卡也补充授权，并立即打开原心情小记', async () => {
  for (const completion of [{ total:2,completed:0 },{ total:0,completed:0 }]) {
    const state = setup({ delayedAuthorization:true,completion })
    await state.refresh()
    await state.page.manualDailyCheckin()
    assert.equal(state.calls[0].action, 'authorize')
    assert.equal(state.calls[1].action, 'manualDailyCheckin')
    assert.equal(state.page.data.dailyReviewEditor.visible, true)
    assert.equal(state.page.data.manualCheckinSaving, false)
    state.authorize()
    await flush()
    assert.equal(state.page.data.dashboard.user.checkinReminderPushEnabled, true)
  }
})

test('拒绝或保存续订失败不撤回任务完成、不阻止手动打卡', async () => {
  for (const options of [{ authorization:'reject' },{ saveFails:true }]) {
    const state = setup(options)
    await state.refresh()
    await state.page.quickComplete(event)
    await flush()
    assert.equal(state.plan.completed, true)
    assert.equal(state.page.data.dashboard.user.checkinReminderPushEnabled, false)
    const manual = setup(options)
    await manual.refresh()
    await manual.page.manualDailyCheckin()
    await flush()
    assert.equal(manual.page.data.dailyReviewEditor.visible, true)
  }
})

test('最后一项正计时完成只为每日提醒申请一次，不同时预订休息提醒', async () => {
  const state = setup({ delayedAuthorization:true,plan:{ timerEnabled:true,timerStatus:'FINISHED',timerMode:'COUNT_UP',checkin:{ timerReminderPushEnabled:false } } })
  await state.refresh()
  await state.page.quickComplete(event)
  assert.deepEqual(state.calls.slice(0, 2).map(call => call.action), ['authorize','finishAndCompletePlanTimer'])
  const completion = state.calls.find(call => call.action === 'finishAndCompletePlanTimer')
  assert.deepEqual(Object.keys(completion.event), ['planId'])
  assert.equal(state.page.data.timerBusyPlanId, '')
  state.authorize()
  await flush()
  assert.equal(state.calls.filter(call => call.action === 'authorize').length, 1)
})

test('结束计时在确认按钮回调中请求授权，取消确认不申请也不结束计时', async () => {
  const state = setup({ delayedAuthorization:true,plan:{ timerEnabled:true,timerMode:'COUNT_DOWN' } })
  await state.refresh()
  await state.page.finishTimer(event)
  assert.deepEqual(state.calls.slice(0, 3).map(call => call.action), ['confirm','authorize','finishAndCompletePlanTimer'])
  state.authorize()
  await flush()
  const cancelled = setup({ confirm:false })
  await cancelled.page.finishTimer(event)
  assert.deepEqual(cancelled.calls.map(call => call.action), ['confirm'])
})

test('已记住允许时，服务器续订日期是今天也不阻止再次补充消耗的额度', async () => {
  const state = setup({ user:{ reminderRenewedToday:true } })
  await state.refresh()
  await state.page.quickComplete(event)
  await flush()
  assert.equal(state.calls.filter(call => call.action === 'authorize').length, 1)
  assert.equal(state.page.data.dashboard.user.checkinReminderPushEnabled, true)
})

test('任务完成请求失败仍保存独立取得的提醒授权，重复完成点击不重复请求', async () => {
  const failed = setup({ taskFails:true })
  await failed.refresh()
  await failed.page.quickComplete(event)
  await flush()
  assert.equal(failed.plan.completed, false)
  assert.equal(failed.page.data.dashboard.user.checkinReminderPushEnabled, true)
  const state = setup({ delayedAuthorization:true })
  await state.refresh()
  await Promise.all([state.page.quickComplete(event),state.page.quickComplete(event)])
  assert.equal(state.calls.filter(call => call.action === 'authorize').length, 1)
  assert.equal(state.calls.filter(call => call.action === 'completePlan').length, 1)
  state.authorize()
  await flush()
})

test('打开今日页和编辑已完成任务都不自动调用微信订阅接口', async () => {
  const state = setup()
  state.page.onShow()
  state.plan.completed = true
  await state.page.quickComplete(event)
  await flush()
  assert.equal(state.calls.some(call => call.action === 'authorize'), false)
})

test('旧仪表盘查询不能覆盖新授权，但下一次查询可以反映额度再次消耗', async () => {
  const state = setup()
  await state.refresh()
  const response = {
    user:{ ...state.page.data.dashboard.user,checkinReminderPushEnabled:false },
    plans:[],nutrition:{},energy:{ estimatedCalorieBalance:0 }
  }
  let finishDashboard
  state.api.call = (action) => {
    if (action === 'dashboard') return new Promise(resolve => {
      finishDashboard = () => resolve(JSON.parse(JSON.stringify(response)))
    })
    return Promise.resolve({ renewed:true })
  }
  for (const name of ['revealActiveTimer','startTicker','maybePromptDailyReview','finishExpiredCountdown']) {
    state.page[name] = () => {}
  }
  const first = state.loadDashboard()
  await state.page.beginReminderRenewal(null,{ manual:true })
  finishDashboard()
  await first
  assert.equal(state.page.data.dashboard.user.checkinReminderPushEnabled, true)
  const next = state.loadDashboard()
  finishDashboard()
  await next
  assert.equal(state.page.data.dashboard.user.checkinReminderPushEnabled, false)
})
