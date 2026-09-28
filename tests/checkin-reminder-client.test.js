const test = require('node:test')
const assert = require('node:assert/strict')
const { getCheckinReminderClient } = require('../miniprogram/utils/checkin-reminder')

function setup(options = {}) {
  const storage = options.storage || new Map()
  const calls = []
  const settings = { configured:true,templateId:'daily',subscriptionType:'ONE_TIME',enabled:true,pushEnabled:false }
  let date = '2026-09-28'
  let rememberedChoice = options.rememberedChoice || ''
  let authorization
  const platform = {
    getStorageSync: key => storage.get(key),
    setStorageSync: (key, value) => storage.set(key, value),
    getSetting(request) {
      if (options.settingFails) return request.fail()
      request.success({ subscriptionsSetting: {
        mainSwitch: options.mainSwitch !== false,
        itemSettings: rememberedChoice ? { daily: rememberedChoice } : {}
      } })
    },
    requestSubscribeMessage(request) {
      calls.push('authorize')
      authorization = () => options.authorizationFails
        ? request.fail() : request.success({ daily: options.authorization || 'accept' })
      if (!options.delayedAuthorization) authorization()
    }
  }
  const api = {
    localDate: () => date,
    async call(action, event, config) {
      calls.push(action)
      assert.equal(event.authorized, true)
      assert.deepEqual(Object.keys(event), ['authorized'])
      assert.equal(config.silent, true)
      if (options.saveFails) throw new Error('save failed')
      return { renewed: true }
    }
  }
  const client = getCheckinReminderClient(platform, api)
  return {
    client, platform, api, settings, calls, storage,
    authorize: () => authorization(),
    nextDay: () => { date = '2026-09-29' },
    remember: choice => { rememberedChoice = choice }
  }
}

test('读取记住的选择不申请订阅；只有点击调用 renew 才真正请求授权', async () => {
  const state = setup({ rememberedChoice:'accept' })
  await state.client.refresh('daily')
  assert.deepEqual(state.calls, [])
  const renewal = state.client.renew(state.settings)
  assert.equal(state.calls[0], 'authorize', 'native API must be synchronous')
  assert.equal(await renewal, true)
  assert.deepEqual(state.calls, ['authorize','renewCheckinReminderSubscription'])
})

test('未记住选择每天最多自动请求一次，跨页面和重启仍遵守冷却', async () => {
  const state = setup()
  await state.client.refresh('daily')
  assert.equal(await state.client.renew(state.settings), true)
  assert.equal(await state.client.renew(state.settings), false)
  assert.equal(getCheckinReminderClient(state.platform, state.api), state.client)
  const restarted = setup({ storage:state.storage })
  await restarted.client.refresh('daily')
  assert.equal(await restarted.client.renew(restarted.settings), false)
  assert.deepEqual(restarted.calls, [])
  restarted.nextDay()
  assert.equal(await restarted.client.renew(restarted.settings), true)
})

test('已记住允许时，额度同日再次消耗后可无感补充；未消耗则跳过', async () => {
  for (const rememberedChoice of ['accept','acceptWithAudio']) {
    const state = setup({ rememberedChoice })
    await state.client.refresh('daily')
    assert.equal(await state.client.renew(state.settings), true)
    assert.equal(await state.client.renew({ ...state.settings,pushEnabled:true }), false)
    assert.equal(await state.client.renew(state.settings), true)
    assert.equal(state.calls.filter(action => action === 'authorize').length, 2)
  }
})

test('已记住拒绝、模板不可用或关闭微信订阅总开关时不自动打扰', async () => {
  for (const options of [{ rememberedChoice:'reject' },{ rememberedChoice:'ban' },{ rememberedChoice:'filter' },{ mainSwitch:false }]) {
    const state = setup(options)
    await state.client.refresh('daily')
    assert.equal(await state.client.renew(state.settings), false)
    assert.deepEqual(state.calls, [])
  }
})

test('关闭业务提醒、已有额度、长期模板或未配置时不请求订阅', async () => {
  for (const overrides of [{ enabled:false },{ pushEnabled:true },{ subscriptionType:'LONG_TERM' },{ configured:false },{ templateId:'' }]) {
    const state = setup({ rememberedChoice:'accept' })
    await state.client.refresh('daily')
    assert.equal(await state.client.renew({ ...state.settings,...overrides }), false)
    assert.deepEqual(state.calls, [])
  }
})

test('多个入口同时请求时合并授权和云端保存，不把一次授权记两次', async () => {
  const state = setup({ delayedAuthorization:true })
  const first = state.client.renew(state.settings)
  const second = state.client.renew(state.settings)
  assert.equal(first, second)
  assert.deepEqual(state.calls, ['authorize'])
  state.authorize()
  assert.equal(await first, true)
  assert.deepEqual(state.calls, ['authorize','renewCheckinReminderSubscription'])
})

test('一次拒绝不会当作永久拒绝；授权失败不保存，次日可再尝试', async () => {
  for (const options of [{ authorization:'reject' },{ authorizationFails:true },{ settingFails:true,authorization:'reject' }]) {
    const state = setup(options)
    await state.client.refresh('daily')
    assert.equal(await state.client.renew(state.settings), false)
    assert.deepEqual(state.calls, ['authorize'])
    assert.equal(await state.client.renew(state.settings), false)
    state.nextDay()
    await state.client.renew(state.settings)
    assert.deepEqual(state.calls, ['authorize','authorize'])
  }
})

test('用户主动续订可绕过每日冷却；后台保存失败只返回 false 不抛出异常', async () => {
  const state = setup()
  await state.client.renew(state.settings)
  assert.equal(await state.client.renew(state.settings), false)
  assert.equal(await state.client.renew(state.settings,{ force:true }), true)
  const failed = setup({ saveFails:true })
  assert.equal(await failed.client.renew(failed.settings), false)
})
